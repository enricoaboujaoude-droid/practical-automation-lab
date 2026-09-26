const OWNER_OBJECT_TYPES = [
  "MATERIALIZED VIEW",
  "FOREIGN TABLE",
  "TABLE ATTACH",
  "TABLE",
  "SEQUENCE",
  "VIEW",
  "FUNCTION",
  "PROCEDURE",
  "AGGREGATE",
  "TYPE",
  "DOMAIN",
  "SCHEMA"
];

const severityRank = { PASS: 0, REVIEW: 1, BLOCK: 2 };

function normalizeVersion(value) {
  const match = String(value ?? "").match(/(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return { raw: match[0], major: Number(match[1]), minor: Number(match[2] ?? 0) };
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function matchObjectType(description) {
  return OWNER_OBJECT_TYPES.find((type) => description.startsWith(`${type} `)) ?? null;
}

export function parseToc(text) {
  const sourceVersion = text.match(/^;\s*Dumped from database version:\s*(.+)$/mi)?.[1]?.trim() ?? null;
  const dumpVersion = text.match(/^;\s*Dumped by pg_dump version:\s*(.+)$/mi)?.[1]?.trim() ?? null;
  const owners = [];
  const extensions = [];
  const ambiguousOwnerLines = [];
  let entries = 0;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^\d+;\s+\d+\s+\d+\s+/.test(line)) continue;
    entries += 1;
    const description = line.replace(/^\d+;\s+\d+\s+\d+\s+/, "");

    if (description.startsWith("EXTENSION ")) {
      const tokens = description.split(/\s+/);
      const extensionName = tokens.at(-1);
      if (extensionName && extensionName !== "-") extensions.push(extensionName);
      continue;
    }

    const objectType = matchObjectType(description);
    if (!objectType) continue;
    const remainder = description.slice(objectType.length).trim();
    const tokens = remainder.split(/\s+/).filter(Boolean);
    const owner = tokens.at(-1);
    if (!owner || owner === "-" || /["']/u.test(remainder)) {
      ambiguousOwnerLines.push(line);
      continue;
    }
    owners.push(owner);
  }

  return {
    sourceVersion,
    dumpVersion,
    entries,
    owners: uniqueSorted(owners),
    extensions: uniqueSorted(extensions),
    ambiguousOwnerLines
  };
}

function finding(severity, code, message, remediation) {
  return { severity, code, message, remediation };
}

export function analyzeRestore(tocText, targetInventory, options = {}) {
  if (!targetInventory || typeof targetInventory !== "object" || Array.isArray(targetInventory)) {
    throw new TypeError("Target inventory must be a JSON object.");
  }

  const toc = parseToc(tocText);
  const targetVersion = normalizeVersion(targetInventory.serverVersion);
  const sourceVersion = normalizeVersion(toc.sourceVersion);
  const dumpVersion = normalizeVersion(toc.dumpVersion);
  const targetRoles = new Set((targetInventory.roles ?? []).map(String));
  const availableExtensions = new Set((targetInventory.availableExtensions ?? []).map(String));
  const findings = [];

  if (toc.entries === 0) {
    findings.push(finding("BLOCK", "TOC_EMPTY", "No pg_restore TOC entries were recognized.", "Generate metadata with: pg_restore --list backup.dump"));
  }

  if (!targetVersion) {
    findings.push(finding("BLOCK", "TARGET_VERSION_MISSING", "Target serverVersion is missing or invalid.", "Add the target server version, for example 16.4."));
  } else {
    if (sourceVersion && sourceVersion.major > targetVersion.major) {
      findings.push(finding("BLOCK", "SOURCE_NEWER_THAN_TARGET", `Source PostgreSQL ${sourceVersion.raw} is newer than target ${targetVersion.raw}.`, "Restore to an equal or newer PostgreSQL major version, or use a supported migration path."));
    }
    if (dumpVersion && dumpVersion.major > targetVersion.major) {
      findings.push(finding("BLOCK", "DUMP_TOOL_NEWER_THAN_TARGET", `pg_dump ${dumpVersion.raw} produced SQL for target PostgreSQL ${targetVersion.raw}.`, "Use a pg_dump major version no newer than the destination, or restore to an equal/newer target."));
    }
  }

  const missingRoles = toc.owners.filter((owner) => !targetRoles.has(owner));
  if (missingRoles.length > 0) {
    if (options.noOwner) {
      findings.push(finding("REVIEW", "OWNERS_BYPASSED", `Archive owners are absent on target but --no-owner was selected: ${missingRoles.join(", ")}.`, "Confirm restored objects should be owned by the connecting role and review grants separately."));
    } else {
      findings.push(finding("BLOCK", "ROLES_MISSING", `Target is missing archive owner roles: ${missingRoles.join(", ")}.`, "Create the roles before restore, or explicitly choose --no-owner after reviewing ownership and grants."));
    }
  }

  const missingExtensions = toc.extensions.filter((name) => !availableExtensions.has(name));
  if (missingExtensions.length > 0) {
    findings.push(finding("BLOCK", "EXTENSIONS_UNAVAILABLE", `Target cannot provide archive extensions: ${missingExtensions.join(", ")}.`, "Install/allow the extensions on the destination or remove dependent objects through a reviewed TOC list."));
  }

  if (toc.ambiguousOwnerLines.length > 0) {
    findings.push(finding("REVIEW", "OWNER_PARSE_AMBIGUOUS", `${toc.ambiguousOwnerLines.length} owner-bearing TOC line(s) use quoting or an unsupported shape.`, "Review these lines manually before relying on the ownership result."));
  }

  if (findings.length === 0) {
    findings.push(finding("PASS", "PORTABILITY_PREFLIGHT_CLEAR", "No scoped portability blocker was found.", "Proceed to a disposable restore drill; this preflight does not prove data integrity or application compatibility."));
  }

  const status = findings.reduce((current, item) => severityRank[item.severity] > severityRank[current] ? item.severity : current, "PASS");
  return {
    schemaVersion: 1,
    tool: "pg-restore-portability-preflight",
    status,
    scope: ["owner roles", "extension availability", "PostgreSQL major-version direction"],
    archive: toc,
    target: {
      serverVersion: targetInventory.serverVersion ?? null,
      roleCount: targetRoles.size,
      availableExtensionCount: availableExtensions.size
    },
    restorePlan: {
      noOwner: Boolean(options.noOwner),
      recommendedArguments: options.noOwner ? ["--no-owner"] : [],
      nextStep: status === "BLOCK" ? "Resolve blockers before restore." : "Run a disposable restore drill with --exit-on-error."
    },
    findings
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

export function renderHtml(report) {
  const rows = report.findings.map((item) => `<tr><td>${escapeHtml(item.severity)}</td><td><code>${escapeHtml(item.code)}</code></td><td>${escapeHtml(item.message)}</td><td>${escapeHtml(item.remediation)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PostgreSQL restore preflight — ${escapeHtml(report.status)}</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;color:#17212b}h1{margin-bottom:4px}.status{font-weight:800;font-size:1.4rem}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #ccd5df;padding:10px;text-align:left;vertical-align:top}th{background:#eef3f7}code{background:#eef3f7;padding:2px 5px}</style><h1>PostgreSQL archive restore-portability preflight</h1><div class="status">${escapeHtml(report.status)}</div><p>Entries: ${report.archive.entries}; owners: ${report.archive.owners.length}; extensions: ${report.archive.extensions.length}; target: ${escapeHtml(report.target.serverVersion)}</p><table><thead><tr><th>Severity</th><th>Code</th><th>Finding</th><th>Remediation</th></tr></thead><tbody>${rows}</tbody></table><p><strong>Next:</strong> ${escapeHtml(report.restorePlan.nextStep)}</p></html>`;
}
