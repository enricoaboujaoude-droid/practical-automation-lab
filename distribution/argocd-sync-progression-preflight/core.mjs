const SEVERITY = { PASS: 0, REVIEW: 1, BLOCK: 2 };

function unquote(value = "") {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function parseVersion(value = "") {
  const m = String(value).match(/(?:^|v)(\d+)\.(\d+)\.(\d+)/);
  return m ? m.slice(1).map(Number) : null;
}

function inRange(version, min, max) {
  const v = parseVersion(version);
  if (!v) return false;
  const n = v[0] * 1e6 + v[1] * 1e3 + v[2];
  const lo = min[0] * 1e6 + min[1] * 1e3 + min[2];
  const hi = max[0] * 1e6 + max[1] * 1e3 + max[2];
  return n >= lo && n <= hi;
}

function parseDocument(text, index) {
  const lines = text.split(/\r?\n/);
  const getScalar = (key) => {
    const re = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.*?)\\s*$`);
    for (const line of lines) { const m = line.match(re); if (m) return unquote(m[1]); }
    return "";
  };
  const annotation = (name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^\\s*(?:["']?${escaped}["']?)\\s*:\\s*(.*?)\\s*$`);
    for (const line of lines) { const m = line.match(re); if (m) return unquote(m[1]); }
    return "";
  };
  const kind = getScalar("kind") || "Unknown";
  let name = "";
  const meta = lines.findIndex(l => /^\s*metadata\s*:\s*$/.test(l));
  if (meta >= 0) {
    const base = lines[meta].match(/^\s*/)[0].length;
    for (let i = meta + 1; i < lines.length; i++) {
      const indent = lines[i].match(/^\s*/)[0].length;
      if (lines[i].trim() && indent <= base) break;
      const m = lines[i].match(/^\s*name\s*:\s*(.*?)\s*$/);
      if (m) { name = unquote(m[1]); break; }
    }
  }
  return {
    index, kind, name: name || `${kind.toLowerCase()}-${index + 1}`,
    waveRaw: annotation("argocd.argoproj.io/sync-wave"),
    hooks: annotation("argocd.argoproj.io/hook").split(",").map(x => x.trim()).filter(Boolean),
    deletePolicies: annotation("argocd.argoproj.io/hook-delete-policy").split(",").map(x => x.trim()).filter(Boolean),
    syncOptions: annotation("argocd.argoproj.io/sync-options").split(",").map(x => x.trim()).filter(Boolean),
    serviceAccountName: getScalar("serviceAccountName"),
    automated: /\n\s*automated\s*:\s*(?:\{|$)/m.test(`\n${text}`),
    raw: text
  };
}

export function parseBundle(text = "") {
  return String(text).split(/^---\s*$/m).map(x => x.trim()).filter(Boolean).map(parseDocument);
}

function finding(severity, ruleId, object, message, remediation, evidence = {}) {
  return { severity, ruleId, object, message, remediation, evidence };
}

export function analyze({ manifests = "", project = "", currentVersion = "", targetVersion = "" } = {}) {
  const docs = parseBundle([manifests, project].filter(Boolean).join("\n---\n"));
  const findings = [];
  const withWaves = docs.filter(d => d.waveRaw !== "");

  for (const d of docs) {
    const object = `${d.kind}/${d.name}`;
    if (d.waveRaw !== "" && !/^-?\d+$/.test(d.waveRaw)) {
      findings.push(finding("BLOCK", "ARGO-WAVE-001", object, `Sync wave '${d.waveRaw}' is not an integer.`, "Use a quoted or unquoted base-10 integer.", { wave: d.waveRaw }));
    }
    const phases = d.hooks.filter(x => ["PreSync", "Sync", "PostSync", "SyncFail", "PreDelete", "PostDelete"].includes(x));
    const normal = phases.filter(x => !["PreDelete", "PostDelete"].includes(x));
    const deletion = phases.filter(x => ["PreDelete", "PostDelete"].includes(x));
    if (normal.length && deletion.length) {
      findings.push(finding("BLOCK", "ARGO-HOOK-002", object, `Hook mixes normal-sync and deletion phases (${phases.join(", ")}).`, "Split lifecycle phases into separate named hook resources.", { phases }));
    }
    if (phases.length && d.name && !d.deletePolicies.some(x => ["BeforeHookCreation", "HookSucceeded", "HookFailed"].includes(x))) {
      findings.push(finding("REVIEW", "ARGO-HOOK-003", object, "Named hook has no lifecycle deletion policy and can block a later sync when the name already exists.", "Add BeforeHookCreation or an intentional HookSucceeded/HookFailed policy.", { phases, deletePolicies: d.deletePolicies }));
    }
  }

  const serviceAccounts = new Map(docs.filter(d => d.kind === "ServiceAccount").map(d => [d.name, Number(d.waveRaw || 0)]));
  for (const d of docs.filter(x => x.serviceAccountName)) {
    const saWave = serviceAccounts.get(d.serviceAccountName);
    const consumerWave = Number(d.waveRaw || 0);
    if (saWave !== undefined && saWave >= consumerWave) {
      findings.push(finding("BLOCK", "ARGO-DEP-004", `${d.kind}/${d.name}`, `Uses ServiceAccount/${d.serviceAccountName} at wave ${saWave}, not before consumer wave ${consumerWave}.`, "Move the ServiceAccount to a lower wave than every consumer.", { serviceAccount: d.serviceAccountName, serviceAccountWave: saWave, consumerWave }));
    }
  }

  const childApps = docs.filter(d => d.kind === "Application" && d.waveRaw !== "");
  if (childApps.length >= 2 && inRange(targetVersion, [3,4,2], [3,4,2])) {
    findings.push(finding("BLOCK", "ARGO-UPGRADE-005", "Application graph", "Target Argo CD 3.4.2 intersects a reported App-of-Apps regression where higher-wave child Applications can start before lower-wave children finish.", "Do not approve the upgrade until the regression is fixed or a representative staged test proves ordering.", { currentVersion, targetVersion, childApplications: childApps.map(x => x.name) }));
  }

  const hasDenyWindow = docs.some(d => d.kind === "AppProject" && /\n\s*-?\s*kind\s*:\s*deny\s*$/mi.test(`\n${d.raw}`));
  const automatedApps = docs.filter(d => d.kind === "Application" && d.automated);
  if (hasDenyWindow && automatedApps.length && withWaves.length) {
    findings.push(finding("REVIEW", "ARGO-WINDOW-006", "AppProject/Application graph", "Automated sync, deny SyncWindows, and ordered waves coexist; current incidents show operations can remain stuck in Syncing when a window closes mid-progression.", "Prove a full multi-wave sync inside the allowed window or disable automatic initiation near its boundary.", { automatedApplications: automatedApps.map(x => x.name) }));
  }

  if (!docs.length) findings.push(finding("BLOCK", "INPUT-000", "Input", "No YAML documents were found.", "Provide rendered Kubernetes/Argo CD manifests."));
  if (!parseVersion(targetVersion)) findings.push(finding("REVIEW", "INPUT-007", "Target version", "Target Argo CD version is missing or invalid; version-scoped rules were skipped.", "Provide a semantic version such as 3.4.2.", { targetVersion }));

  findings.sort((a,b) => SEVERITY[b.severity] - SEVERITY[a.severity] || a.ruleId.localeCompare(b.ruleId));
  const status = findings.some(f => f.severity === "BLOCK") ? "BLOCK" : findings.some(f => f.severity === "REVIEW") ? "REVIEW" : "PASS";
  return { schemaVersion: 1, status, summary: { documents: docs.length, waves: withWaves.length, block: findings.filter(f=>f.severity==="BLOCK").length, review: findings.filter(f=>f.severity==="REVIEW").length }, versions: { current: currentVersion || null, target: targetVersion || null }, findings };
}

export function toHtml(report) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const rows = report.findings.map(f => `<tr><td>${esc(f.severity)}</td><td>${esc(f.ruleId)}</td><td>${esc(f.object)}</td><td>${esc(f.message)}</td><td>${esc(f.remediation)}</td></tr>`).join("");
  return `<!doctype html><meta charset="utf-8"><title>Argo CD progression evidence</title><style>body{font:14px system-ui;margin:2rem;color:#17202a}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd;padding:.55rem;text-align:left;vertical-align:top}.BLOCK{color:#a00}</style><h1>Argo CD Sync-Progression Preflight: <span class="${esc(report.status)}">${esc(report.status)}</span></h1><p>${report.summary.documents} documents · ${report.summary.block} block · ${report.summary.review} review</p><table><thead><tr><th>Severity</th><th>Rule</th><th>Object</th><th>Evidence</th><th>Remediation</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function toSarif(report) {
  const level = { BLOCK: "error", REVIEW: "warning", PASS: "note" };
  return { version: "2.1.0", $schema: "https://json.schemastore.org/sarif-2.1.0.json", runs: [{ tool: { driver: { name: "argocd-sync-progression-preflight", rules: [...new Set(report.findings.map(f=>f.ruleId))].map(id=>({id})) } }, results: report.findings.map(f => ({ ruleId: f.ruleId, level: level[f.severity], message: { text: `${f.object}: ${f.message} ${f.remediation}` } })) }] };
}
