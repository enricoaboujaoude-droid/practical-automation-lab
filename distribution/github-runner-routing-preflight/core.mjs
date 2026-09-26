const severityRank = { PASS: 0, REVIEW: 1, BLOCK: 2 };

const unique = (values) => [...new Set(values.map(String).map((value) => value.trim()).filter(Boolean))];
const unquote = (value) => String(value).trim().replace(/^['"]|['"]$/g, "");

function parseArray(value) {
  const raw = String(value).trim();
  if (!raw.startsWith("[") || !raw.endsWith("]")) return null;
  return unique(raw.slice(1, -1).split(",").map(unquote));
}

function indentOf(line) {
  return line.match(/^\s*/)[0].length;
}

function parseMatrix(lines, start, end, jobIndent) {
  const values = {};
  let matrixIndent = null;
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    const indent = indentOf(line);
    if (/^\s*matrix:\s*$/.test(line) && indent > jobIndent) {
      matrixIndent = indent;
      continue;
    }
    if (matrixIndent === null) continue;
    if (line.trim() && indent <= matrixIndent) break;
    const match = line.match(/^\s*([A-Za-z0-9_-]+):\s*(\[.*\])\s*$/);
    if (match && indent > matrixIndent) values[match[1]] = parseArray(match[2]) ?? [];
  }
  return values;
}

function expandLabels(labels, matrix) {
  let combinations = [[]];
  let dynamic = false;
  for (const label of labels) {
    const exact = label.match(/^\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}$/);
    if (exact && matrix[exact[1]]?.length) {
      combinations = combinations.flatMap((existing) => matrix[exact[1]].map((value) => [...existing, value]));
    } else if (label.includes("${{")) {
      dynamic = true;
      combinations = combinations.map((existing) => [...existing, label]);
    } else {
      combinations = combinations.map((existing) => [...existing, label]);
    }
  }
  return { combinations, dynamic };
}

export function parseWorkflow(workflowText) {
  const lines = String(workflowText).replace(/\t/g, "  ").split(/\r?\n/);
  const jobsLine = lines.findIndex((line) => /^jobs:\s*(?:#.*)?$/.test(line));
  if (jobsLine < 0) throw new Error("Workflow must contain a top-level jobs mapping.");
  const jobs = [];
  for (let index = jobsLine + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s+)([A-Za-z0-9_-]+):\s*(?:#.*)?$/);
    if (!match) continue;
    const jobIndent = match[1].length;
    if (jobIndent === 0) break;
    const jobId = match[2];
    let end = index + 1;
    while (end < lines.length && (!lines[end].trim() || indentOf(lines[end]) > jobIndent)) end += 1;
    const matrix = parseMatrix(lines, index + 1, end, jobIndent);
    let labels = null;
    let group = null;
    let dynamic = false;
    for (let cursor = index + 1; cursor < end; cursor += 1) {
      const scalar = lines[cursor].match(/^\s*runs-on:\s*(.+?)\s*(?:#.*)?$/);
      if (scalar) {
        labels = parseArray(scalar[1]) ?? [unquote(scalar[1])];
        break;
      }
      if (/^\s*runs-on:\s*$/.test(lines[cursor])) {
        const baseIndent = indentOf(lines[cursor]);
        for (let nested = cursor + 1; nested < end && (!lines[nested].trim() || indentOf(lines[nested]) > baseIndent); nested += 1) {
          const groupMatch = lines[nested].match(/^\s*group:\s*(.+?)\s*$/);
          const labelsMatch = lines[nested].match(/^\s*labels:\s*(.+?)\s*$/);
          if (groupMatch) group = unquote(groupMatch[1]);
          if (labelsMatch) labels = parseArray(labelsMatch[1]) ?? [unquote(labelsMatch[1])];
        }
        labels ??= [];
        break;
      }
    }
    if (labels === null) {
      jobs.push({ id: jobId, demands: [], dynamic: true, reason: "runs-on was not statically parsed" });
    } else {
      const expanded = expandLabels(labels, matrix);
      dynamic = expanded.dynamic || Boolean(group?.includes("${{"));
      jobs.push({
        id: jobId,
        dynamic,
        demands: expanded.combinations.map((combination, matrixIndex) => ({
          id: expanded.combinations.length > 1 ? `${jobId}[${matrixIndex}]` : jobId,
          labels: unique(combination),
          group
        }))
      });
    }
    index = end - 1;
  }
  if (!jobs.length) throw new Error("No jobs were recognized beneath jobs:.");
  return { jobs };
}

function isHostedDemand(labels, group) {
  if (group) return false;
  if (labels.includes("self-hosted")) return false;
  return labels.length === 1 && /^(ubuntu|windows|macos)-(?:latest|\d+(?:\.\d+)?)$/.test(labels[0]);
}

function finding(severity, code, job, message, remediation) {
  return { severity, code, job, message, remediation };
}

function groupAllowsRepository(group, repository) {
  if (!group) return true;
  if (group.access === "all") return true;
  return Array.isArray(group.repositories) && group.repositories.includes(repository);
}

export function analyzeRouting(workflowText, inventory) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) throw new TypeError("Inventory must be a JSON object.");
  if (!inventory.repository) throw new Error("Inventory.repository is required.");
  const workflow = parseWorkflow(workflowText);
  const runners = Array.isArray(inventory.runners) ? inventory.runners.map((runner) => ({
    name: String(runner.name ?? "unnamed"),
    labels: unique(runner.labels ?? []),
    group: runner.group ? String(runner.group) : "Default",
    status: runner.status ? String(runner.status) : null,
    busy: typeof runner.busy === "boolean" ? runner.busy : null
  })) : [];
  const groups = new Map((inventory.groups ?? []).map((group) => [String(group.name), group]));
  const findings = [];
  const routes = [];

  for (const job of workflow.jobs) {
    if (job.dynamic) findings.push(finding("REVIEW", "DYNAMIC_ROUTING_EXPRESSION", job.id, `Job ${job.id} contains routing that cannot be fully resolved from its local matrix.`, "Replace dynamic routing with a finite matrix or review every possible value manually."));
    for (const demand of job.demands) {
      if (isHostedDemand(demand.labels, demand.group)) {
        routes.push({ ...demand, scope: "github-hosted", eligible: [] });
        continue;
      }
      if (demand.group && !groups.has(demand.group)) {
        findings.push(finding("BLOCK", "RUNNER_GROUP_UNKNOWN", demand.id, `Runner group ${demand.group} is absent from the inventory.`, "Export the group or correct the workflow group name."));
        routes.push({ ...demand, scope: "self-hosted", eligible: [] });
        continue;
      }
      if (demand.group && !groupAllowsRepository(groups.get(demand.group), inventory.repository)) {
        findings.push(finding("BLOCK", "GROUP_REPOSITORY_ACCESS", demand.id, `Runner group ${demand.group} does not grant access to ${inventory.repository}.`, "Grant repository access or route the job to an accessible group."));
        routes.push({ ...demand, scope: "self-hosted", eligible: [] });
        continue;
      }
      const requiredLabels = demand.labels.filter((label) => label !== "self-hosted" && !label.includes("${{"));
      const eligible = runners.filter((runner) => (!demand.group || runner.group === demand.group) && requiredLabels.every((label) => runner.labels.includes(label)));
      routes.push({ ...demand, scope: "self-hosted", eligible: eligible.map((runner) => runner.name) });
      if (demand.labels.length === 1 && demand.labels[0] === "self-hosted") {
        findings.push(finding("REVIEW", "BROAD_SELF_HOSTED_FALLBACK", demand.id, `${demand.id} can run on any repository-accessible self-hosted runner.`, "Require purpose-specific labels or a runner group to prevent accidental routing."));
      }
      if (!eligible.length && !job.dynamic) {
        findings.push(finding("BLOCK", "NO_ELIGIBLE_RUNNER", demand.id, `${demand.id} has no runner satisfying labels [${requiredLabels.join(", ") || "none"}]${demand.group ? ` in group ${demand.group}` : ""}.`, "Add a matching runner or correct labels, group, matrix, and repository access before merge."));
      } else if (eligible.length === 1) {
        findings.push(finding("REVIEW", "SINGLE_RUNNER_BOTTLENECK", demand.id, `${demand.id} depends on only ${eligible[0].name}.`, "Add a second eligible runner or accept the documented availability risk."));
      }
      const unavailable = eligible.filter((runner) => runner.status === "offline" || runner.busy === true);
      if (eligible.length && unavailable.length === eligible.length) {
        findings.push(finding("REVIEW", "NO_CURRENTLY_IDLE_RUNNER", demand.id, `All statically eligible runners are offline or busy: ${unavailable.map((runner) => runner.name).join(", ")}.`, "Treat status as a point-in-time signal; verify autoscaling and queue capacity."));
      }
    }
  }

  if (!findings.length) findings.push(finding("PASS", "ROUTING_CONTRACT_SATISFIABLE", "all", "Every scoped self-hosted routing demand has at least two eligible runners.", "Run a controlled workflow dispatch; static analysis cannot prove service availability."));
  const status = findings.reduce((current, item) => severityRank[item.severity] > severityRank[current] ? item.severity : current, "PASS");
  return {
    schemaVersion: 1,
    tool: "github-runner-routing-preflight",
    status,
    repository: inventory.repository,
    runnerCount: runners.length,
    routes,
    findings
  };
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function renderHtml(report) {
  const rows = report.findings.map((item) => `<tr><td>${escapeHtml(item.severity)}</td><td><code>${escapeHtml(item.code)}</code></td><td>${escapeHtml(item.job)}</td><td>${escapeHtml(item.message)}</td><td>${escapeHtml(item.remediation)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Runner routing preflight — ${escapeHtml(report.status)}</title><style>body{font:16px system-ui;max-width:1180px;margin:40px auto;padding:0 20px;color:#17212b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5df;padding:9px;text-align:left;vertical-align:top}th{background:#eef3f7}code{background:#eef3f7;padding:2px 5px}</style><h1>GitHub runner routing contract preflight</h1><p><strong>${escapeHtml(report.status)}</strong> — ${escapeHtml(report.repository)}; ${report.runnerCount} runner(s); ${report.routes.length} route(s).</p><table><thead><tr><th>Severity</th><th>Code</th><th>Job</th><th>Finding</th><th>Remediation</th></tr></thead><tbody>${rows}</tbody></table></html>`;
}
