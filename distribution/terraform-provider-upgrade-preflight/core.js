/* Terraform Provider-Upgrade Replacement Contract Preflight
 * Zero-dependency deterministic core for Node.js and browsers.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TerraformUpgradePreflight = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0.0";

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).sort().forEach((key) => { out[key] = canonical(value[key]); });
      return out;
    }
    return value;
  }

  function stableStringify(value) {
    return JSON.stringify(canonical(value));
  }

  function digest(value) {
    const text = typeof value === "string" ? value : stableStringify(value);
    let h1 = 0xcbf29ce4;
    let h2 = 0x84222325;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      h1 ^= code & 0xff;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= (code >>> 8) & 0xff;
      h2 = Math.imul(h2, 0x01000193) >>> 0;
    }
    return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
  }

  function parsePlan(input, label) {
    try {
      const value = typeof input === "string" ? JSON.parse(input) : input;
      if (!value || typeof value !== "object" || !Array.isArray(value.resource_changes)) {
        throw new Error("expected terraform show -json plan with resource_changes");
      }
      return value;
    } catch (error) {
      throw new Error(`${label}: ${error.message}`);
    }
  }

  function parseLockfile(text) {
    const providers = {};
    const source = String(text || "");
    const block = /provider\s+"([^"]+)"\s*\{([\s\S]*?)\n\}/g;
    let match;
    while ((match = block.exec(source)) !== null) {
      const version = match[2].match(/(?:^|\n)\s*version\s*=\s*"([^"]+)"/);
      providers[match[1]] = version ? version[1] : null;
    }
    if (!Object.keys(providers).length) throw new Error("lockfile: no provider blocks found");
    return providers;
  }

  function providerDeltas(before, after) {
    return Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort().map((source) => ({
      source,
      baseline_version: Object.prototype.hasOwnProperty.call(before, source) ? before[source] : null,
      candidate_version: Object.prototype.hasOwnProperty.call(after, source) ? after[source] : null,
      changed: before[source] !== after[source]
    })).filter((item) => item.changed);
  }

  function actionKind(actions) {
    const a = Array.isArray(actions) ? actions : [];
    if (a.includes("delete") && a.includes("create")) return "replace";
    return a.join("+") || "no-op";
  }

  function pathString(path) {
    return (Array.isArray(path) ? path : []).map((part) => typeof part === "number" ? `[${part}]` : String(part)).join(".").replace(".[", "[");
  }

  function unknownPaths(value, prefix, out) {
    const list = out || [];
    const base = prefix || [];
    if (value === true) list.push(pathString(base));
    else if (Array.isArray(value)) value.forEach((item, index) => unknownPaths(item, base.concat(index), list));
    else if (value && typeof value === "object") Object.keys(value).sort().forEach((key) => unknownPaths(value[key], base.concat(key), list));
    return list;
  }

  function risk(type) {
    const t = String(type || "").toLowerCase();
    const groups = [
      ["DATABASE", /(db|database|rds|sql|postgres|mysql|redis|cache|dynamodb|cosmos)/],
      ["IDENTITY", /(iam|identity|role|policy|permission|principal|service_account)/],
      ["NETWORK", /(vpc|subnet|network|security_group|firewall|gateway|route|load_balancer|dns)/],
      ["CLUSTER", /(cluster|kubernetes|eks|aks|gke|node_group)/]
    ];
    const found = groups.filter(([, pattern]) => pattern.test(t)).map(([name]) => name);
    return found.length ? { level: "HIGH", domains: found } : { level: "STANDARD", domains: [] };
  }

  function changeMap(plan) {
    const map = new Map();
    plan.resource_changes.forEach((item) => {
      const change = item.change || {};
      map.set(item.address, {
        address: item.address,
        mode: item.mode || "managed",
        type: item.type || "",
        provider_name: item.provider_name || "",
        actions: Array.isArray(change.actions) ? change.actions.slice() : [],
        action_kind: actionKind(change.actions),
        replace_paths: (change.replace_paths || []).map(pathString).sort(),
        unknown_paths: unknownPaths(change.after_unknown).sort()
      });
    });
    return map;
  }

  function finding(code, severity, message, details) {
    return { code, severity, message, details: details || {} };
  }

  function analyze(inputs) {
    const baseline = parsePlan(inputs.baselinePlan, "baseline plan");
    const candidate = parsePlan(inputs.candidatePlan, "candidate plan");
    const baselineProviders = parseLockfile(inputs.baselineLockfile);
    const candidateProviders = parseLockfile(inputs.candidateLockfile);
    const deltas = providerDeltas(baselineProviders, candidateProviders);
    const findings = [];

    const baselineConfiguration = digest(baseline.configuration || null);
    const candidateConfiguration = digest(candidate.configuration || null);
    const baselineVariables = digest(baseline.variables || null);
    const candidateVariables = digest(candidate.variables || null);
    if (!deltas.length) findings.push(finding("PROVENANCE_NO_PROVIDER_DELTA", "BLOCK", "No provider version change exists between lockfiles."));
    if (baselineConfiguration !== candidateConfiguration) findings.push(finding("PROVENANCE_CONFIGURATION_MISMATCH", "BLOCK", "Plan configuration fingerprints differ; changes cannot be attributed only to a provider upgrade.", { baseline: baselineConfiguration, candidate: candidateConfiguration }));
    if (baselineVariables !== candidateVariables) findings.push(finding("PROVENANCE_VARIABLES_MISMATCH", "BLOCK", "Plan variable fingerprints differ; changes cannot be attributed only to a provider upgrade.", { baseline: baselineVariables, candidate: candidateVariables }));
    if (!baseline.configuration || !candidate.configuration) findings.push(finding("PROVENANCE_CONFIGURATION_ABSENT", "REVIEW", "One or both plans omit configuration; same-configuration provenance is not fully verifiable."));

    const oldMap = changeMap(baseline);
    const newMap = changeMap(candidate);
    const replacements = [];
    Array.from(newMap.keys()).sort().forEach((address) => {
      const current = newMap.get(address);
      const prior = oldMap.get(address);
      if (current.action_kind !== "replace" || (prior && prior.action_kind === "replace")) return;
      const item = {
        address,
        type: current.type,
        provider_name: current.provider_name,
        actions: current.actions,
        replace_paths: current.replace_paths,
        newly_unknown_paths: current.unknown_paths.filter((path) => !prior || !prior.unknown_paths.includes(path)),
        risk: risk(current.type)
      };
      replacements.push(item);
      findings.push(finding("UPGRADE_INTRODUCED_REPLACEMENT", "BLOCK", `Candidate plan newly replaces ${address}.`, item));
      if (!current.replace_paths.length) findings.push(finding("REPLACEMENT_PATH_UNDISCLOSED", "REVIEW", `${address} is replaced but the plan supplies no replace_paths.`, { address }));
      if (item.newly_unknown_paths.length) findings.push(finding("REPLACEMENT_UNKNOWN_EXPANSION", "REVIEW", `${address} gains values unknown until apply during replacement.`, { address, paths: item.newly_unknown_paths }));
    });

    const status = findings.some((item) => item.severity === "BLOCK") ? "BLOCK" : findings.some((item) => item.severity === "REVIEW") ? "REVIEW" : "PASS";
    return {
      schema: "pal.terraform-provider-upgrade-preflight.v1",
      tool_version: VERSION,
      status,
      summary: {
        provider_deltas: deltas.length,
        baseline_resource_changes: baseline.resource_changes.length,
        candidate_resource_changes: candidate.resource_changes.length,
        upgrade_introduced_replacements: replacements.length,
        high_risk_replacements: replacements.filter((item) => item.risk.level === "HIGH").length,
        block_findings: findings.filter((item) => item.severity === "BLOCK").length,
        review_findings: findings.filter((item) => item.severity === "REVIEW").length
      },
      provenance: {
        baseline_plan_digest: digest(baseline), candidate_plan_digest: digest(candidate),
        baseline_lockfile_digest: digest(String(inputs.baselineLockfile || "")), candidate_lockfile_digest: digest(String(inputs.candidateLockfile || "")),
        configuration: { baseline: baselineConfiguration, candidate: candidateConfiguration, match: baselineConfiguration === candidateConfiguration },
        variables: { baseline: baselineVariables, candidate: candidateVariables, match: baselineVariables === candidateVariables }
      },
      provider_deltas: deltas,
      upgrade_introduced_replacements: replacements,
      findings
    };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function renderHtml(report) {
    const rows = report.findings.map((item) => `<tr><td>${escapeHtml(item.severity)}</td><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.message)}</td></tr>`).join("") || "<tr><td colspan=\"3\">No findings.</td></tr>";
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Terraform provider upgrade preflight</title><style>body{font:15px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;color:#18212f}h1{margin-bottom:4px}.status{display:inline-block;padding:6px 12px;border-radius:999px;background:${report.status === "PASS" ? "#d1fae5" : report.status === "REVIEW" ? "#fef3c7" : "#fee2e2"};font-weight:700}table{border-collapse:collapse;width:100%;margin-top:20px}th,td{border:1px solid #d7dee8;padding:9px;text-align:left;vertical-align:top}th{background:#f5f7fa}pre{white-space:pre-wrap;background:#111827;color:#e5e7eb;padding:16px;border-radius:8px;overflow:auto}</style></head><body><h1>Terraform Provider-Upgrade Replacement Preflight</h1><p class="status">${escapeHtml(report.status)}</p><p>${report.summary.upgrade_introduced_replacements} upgrade-introduced replacement(s); ${report.summary.high_risk_replacements} high risk.</p><table><thead><tr><th>Severity</th><th>Code</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table><h2>Deterministic evidence</h2><pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre></body></html>`;
  }

  return { VERSION, analyze, renderHtml, stableStringify, digest, parseLockfile };
});
