(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RulesetMergeabilityPreflight = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const RANK = { PASS: 0, REVIEW: 1, BLOCK: 2 };
  const finding = (status, code, message, detail) => ({ status, code, message, ...(detail ? { detail } : {}) });

  function stripComment(line) {
    let single = false, double = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === "'" && !double) single = !single;
      else if (c === '"' && !single && line[i - 1] !== "\\") double = !double;
      else if (c === "#" && !single && !double && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
    }
    return line;
  }

  function indentOf(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1].replace(/\t/g, "  ").length : 0;
  }

  function unquote(value) {
    return String(value || "").trim().replace(/^['"]|['"]$/g, "");
  }

  function topBlock(lines, key) {
    const start = lines.findIndex((line) => new RegExp(`^${key}:(?:\\s|$)`).test(line));
    if (start < 0) return [];
    const block = [lines[start]];
    for (let i = start + 1; i < lines.length; i++) {
      if (/^[A-Za-z_][\w-]*:(?:\s|$)/.test(lines[i])) break;
      block.push(lines[i]);
    }
    return block;
  }

  function parseEvents(onBlock) {
    if (!onBlock.length) return { events: [], hasPathFilter: false, hasBranchFilter: false };
    const first = onBlock[0].replace(/^on:\s*/, "").trim();
    const events = [];
    if (first) {
      if (first.startsWith("[")) first.slice(1, -1).split(",").map(unquote).filter(Boolean).forEach((e) => events.push(e));
      else events.push(unquote(first));
    }
    for (const line of onBlock.slice(1)) {
      const match = line.match(/^\s{2}([A-Za-z_][\w-]*):(?:\s|$)/);
      if (match) events.push(match[1]);
    }
    return {
      events: [...new Set(events)],
      hasPathFilter: onBlock.some((line) => /^\s+paths(?:-ignore)?:/.test(line)),
      hasBranchFilter: onBlock.some((line) => /^\s+branches(?:-ignore)?:/.test(line)),
    };
  }

  function parseJobs(jobBlock) {
    if (!jobBlock.length) return [];
    const jobs = [];
    let current = null;
    for (const raw of jobBlock.slice(1)) {
      const line = raw;
      const jobMatch = line.match(/^ {2}([A-Za-z_][\w-]*):\s*$/);
      if (jobMatch) {
        current = { id: jobMatch[1], name: jobMatch[1], hasIf: false, reusable: false, matrix: false };
        jobs.push(current);
        continue;
      }
      if (!current || indentOf(line) < 4) continue;
      const name = line.match(/^ {4}name:\s*(.+)$/);
      if (name) current.name = unquote(name[1]);
      if (/^ {4}if:\s*/.test(line)) current.hasIf = true;
      if (/^ {4}uses:\s*/.test(line)) current.reusable = true;
      if (/^ {4}strategy:\s*$/.test(line) || /^ {6}matrix:\s*/.test(line)) current.matrix = true;
    }
    return jobs;
  }

  function parseWorkflow(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n").map(stripComment);
    const eventData = parseEvents(topBlock(lines, "on"));
    return { ...eventData, jobs: parseJobs(topBlock(lines, "jobs")) };
  }

  function allRuleObjects(value, out = []) {
    if (Array.isArray(value)) value.forEach((item) => allRuleObjects(item, out));
    else if (value && typeof value === "object") {
      if (typeof value.type === "string" && value.parameters && typeof value.parameters === "object") out.push(value);
      Object.values(value).forEach((item) => allRuleObjects(item, out));
    }
    return out;
  }

  function parseRuleset(input) {
    const value = typeof input === "string" ? JSON.parse(input) : input;
    if (!value || typeof value !== "object") throw new Error("Ruleset must be a JSON object or array.");
    const rules = allRuleObjects(value);
    const checks = [];
    let requiresMergeQueue = false;
    let requiredWorkflowCount = 0;
    for (const rule of rules) {
      if (rule.type === "merge_queue") requiresMergeQueue = true;
      if (rule.type === "workflows" || rule.type === "required_workflows") {
        requiredWorkflowCount += Array.isArray(rule.parameters.workflows) ? rule.parameters.workflows.length : 1;
      }
      if (rule.type === "required_status_checks") {
        const list = rule.parameters.required_status_checks || [];
        for (const item of list) {
          const context = typeof item === "string" ? item : item && item.context;
          if (context) checks.push(String(context));
        }
      }
    }
    return { checks, requiresMergeQueue, requiredWorkflowCount, ruleCount: rules.length };
  }

  function analyze(input) {
    const ruleset = parseRuleset(input.ruleset);
    const workflow = parseWorkflow(input.workflowYaml);
    const findings = [];
    const jobNames = new Set(workflow.jobs.flatMap((job) => [job.id, job.name]));

    if (!ruleset.ruleCount) findings.push(finding("BLOCK", "NO_RULES", "No supported rules were found in the supplied ruleset JSON."));
    if (!ruleset.checks.length) findings.push(finding("REVIEW", "NO_REQUIRED_CHECKS", "No required status-check contexts were found; this preflight cannot prove check mergeability."));

    const counts = new Map();
    for (const check of ruleset.checks) counts.set(check, (counts.get(check) || 0) + 1);
    for (const [check, count] of counts) {
      if (count > 1) findings.push(finding("BLOCK", "DUPLICATE_REQUIRED_CHECK", `Required check '${check}' appears ${count} times.`, check));
      if (/[*?\[\]]/.test(check)) findings.push(finding("BLOCK", "WILDCARD_CHECK_CONTEXT", `Required status-check contexts are exact names; '${check}' contains wildcard syntax.`, check));
      if (!jobNames.has(check) && !/[*?\[\]]/.test(check)) findings.push(finding("BLOCK", "REQUIRED_CHECK_ABSENT", `No pasted workflow job can emit required check '${check}'.`, check));
      if (jobNames.has(check)) findings.push(finding("PASS", "REQUIRED_CHECK_PRESENT", `Workflow contains a job matching required check '${check}'.`, check));
    }

    const matchedJobs = workflow.jobs.filter((job) => ruleset.checks.includes(job.id) || ruleset.checks.includes(job.name));
    if (ruleset.requiresMergeQueue && !workflow.events.includes("merge_group")) {
      findings.push(finding("BLOCK", "MISSING_MERGE_GROUP", "The ruleset requires a merge queue, but the pasted workflow does not listen for merge_group."));
    } else if (ruleset.requiresMergeQueue) {
      findings.push(finding("PASS", "MERGE_GROUP_PRESENT", "The workflow listens for merge_group."));
    }

    if (ruleset.checks.length && workflow.hasPathFilter) {
      findings.push(finding("BLOCK", "SKIPPABLE_REQUIRED_WORKFLOW", "A paths/paths-ignore filter can skip the workflow while its check remains required."));
    }
    if (ruleset.checks.length && workflow.hasBranchFilter) {
      findings.push(finding("REVIEW", "BRANCH_FILTER_REVIEW", "Confirm every protected target can trigger this workflow; branch filters can prevent a required check from being created."));
    }
    if (matchedJobs.some((job) => job.hasIf)) findings.push(finding("REVIEW", "CONDITIONAL_REQUIRED_JOB", "A required job has an if condition and may be skipped for some events."));
    if (matchedJobs.some((job) => job.reusable)) findings.push(finding("REVIEW", "REUSABLE_OUTPUT_UNRESOLVED", "A required job calls a reusable workflow; paste its emitted job names before relying on the result."));
    if (matchedJobs.some((job) => job.matrix)) findings.push(finding("REVIEW", "MATRIX_NAME_UNRESOLVED", "A required job uses a matrix; verify the exact expanded check names GitHub emits."));
    if (ruleset.requiredWorkflowCount) findings.push(finding("REVIEW", "REQUIRED_WORKFLOW_SCOPE", "Ruleset-required workflow source permissions and pinned refs require repository context and were not guessed."));

    if (!findings.length) findings.push(finding("PASS", "NO_DEADLOCK_FOUND", "No modeled mergeability deadlock was found."));
    const status = findings.reduce((worst, item) => RANK[item.status] > RANK[worst] ? item.status : worst, "PASS");
    return {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      status,
      summary: {
        rules: ruleset.ruleCount,
        requiredChecks: ruleset.checks.length,
        workflowJobs: workflow.jobs.length,
        events: workflow.events,
        mergeQueueRequired: ruleset.requiresMergeQueue,
      },
      findings,
    };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function toHtml(report) {
    const rows = report.findings.map((f) => `<tr><td>${escapeHtml(f.status)}</td><td>${escapeHtml(f.code)}</td><td>${escapeHtml(f.message)}</td></tr>`).join("");
    return `<!doctype html><meta charset="utf-8"><title>GitHub Ruleset Mergeability ${escapeHtml(report.status)}</title><style>body{font:15px system-ui;max-width:900px;margin:40px auto;padding:0 18px;color:#172033}h1{color:${report.status === "PASS" ? "#087f23" : report.status === "BLOCK" ? "#b42318" : "#9a6700"}}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd4df;padding:9px;text-align:left}</style><h1>${escapeHtml(report.status)}</h1><p>Generated ${escapeHtml(report.generatedAt)}. Rules: ${report.summary.rules}; required checks: ${report.summary.requiredChecks}; workflow jobs: ${report.summary.workflowJobs}.</p><table><thead><tr><th>Status</th><th>Code</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table><p>This static preflight does not modify GitHub or prove live runtime behavior.</p>`;
  }

  return { analyze, parseRuleset, parseWorkflow, toHtml };
});
