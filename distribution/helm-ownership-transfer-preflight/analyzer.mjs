const CLUSTER_SCOPED = new Set([
  'APIService','ClusterRole','ClusterRoleBinding','CustomResourceDefinition',
  'CSIDriver','CSINode','IngressClass','MutatingWebhookConfiguration',
  'Namespace','Node','PersistentVolume','PriorityClass','RuntimeClass',
  'StorageClass','ValidatingAdmissionPolicy','ValidatingAdmissionPolicyBinding',
  'ValidatingWebhookConfiguration','VolumeAttachment'
]);

const unquote = (value = '') => {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v.replace(/\s+#.*$/, '').trim();
};

function yamlDocuments(text) {
  return text.replace(/^\uFEFF/, '').split(/^\s*---\s*$/m).map(x => x.trim()).filter(Boolean);
}

function parseYamlMetadata(document) {
  const out = { apiVersion: '', kind: '', metadata: { name: '', namespace: '', annotations: {}, labels: {} } };
  let section = '';
  let subsection = '';
  for (const raw of document.split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const indent = raw.match(/^\s*/)[0].length;
    const match = raw.trim().match(/^([^:#][^:]*):(?:\s*(.*))?$/);
    if (!match) continue;
    const key = unquote(match[1]);
    const value = unquote(match[2] ?? '');
    if (indent === 0) {
      section = key;
      subsection = '';
      if (key === 'apiVersion') out.apiVersion = value;
      if (key === 'kind') out.kind = value;
      continue;
    }
    if (section !== 'metadata') continue;
    if (indent <= 2 && ['annotations','labels'].includes(key)) {
      subsection = key;
      continue;
    }
    if (indent <= 2) {
      subsection = '';
      if (key === 'name') out.metadata.name = value;
      if (key === 'namespace') out.metadata.namespace = value;
      continue;
    }
    if (subsection === 'annotations' || subsection === 'labels') out.metadata[subsection][key] = value;
  }
  if (!out.apiVersion || !out.kind || !out.metadata.name) throw new Error('Each YAML document needs apiVersion, kind, and metadata.name');
  return out;
}

function flattenJson(value) {
  if (Array.isArray(value)) return value;
  if (value?.kind === 'List' && Array.isArray(value.items)) return value.items;
  return [value];
}

export function parseResources(text, label = 'input') {
  if (!text || !text.trim()) return [];
  try {
    const parsed = JSON.parse(text);
    return flattenJson(parsed).map((item, index) => normalizeResource(item, `${label}[${index}]`));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return yamlDocuments(text).map((doc, index) => normalizeResource(parseYamlMetadata(doc), `${label}[${index}]`));
    }
    throw error;
  }
}

export function normalizeResource(item, source = 'input') {
  if (!item || typeof item !== 'object') throw new Error(`${source} is not an object`);
  const apiVersion = String(item.apiVersion || '');
  const kind = String(item.kind || '');
  const metadata = item.metadata || {};
  const name = String(metadata.name || '');
  if (!apiVersion || !kind || !name) throw new Error(`${source} needs apiVersion, kind, and metadata.name`);
  const group = apiVersion.includes('/') ? apiVersion.split('/')[0] : 'core';
  const clusterScoped = CLUSTER_SCOPED.has(kind);
  const namespace = clusterScoped ? '_cluster' : String(metadata.namespace || 'default');
  const annotations = Object.fromEntries(Object.entries(metadata.annotations || {}).map(([k,v]) => [String(k), String(v)]));
  const labels = Object.fromEntries(Object.entries(metadata.labels || {}).map(([k,v]) => [String(k), String(v)]));
  return {
    apiVersion, group, kind, name, namespace, clusterScoped, annotations, labels,
    id: `${group}|${kind}|${namespace}|${name}`,
    owner: annotations['meta.helm.sh/release-name'] || '',
    ownerNamespace: annotations['meta.helm.sh/release-namespace'] || '',
    source
  };
}

const finding = (severity, code, resource, message, remediation) => ({
  severity, code, resource: resource?.id || '', message, remediation
});

export function analyzeOwnership({ oldManifest = '', adoptingManifest = '', liveInventory = '', oldRelease, oldNamespace = 'default', newRelease, newNamespace = 'default' }) {
  if (!oldRelease || !newRelease) throw new Error('oldRelease and newRelease are required');
  const oldResources = parseResources(oldManifest, 'oldManifest');
  const targetResources = parseResources(adoptingManifest, 'adoptingManifest');
  const liveResources = parseResources(liveInventory, 'liveInventory');
  const oldById = new Map(oldResources.map(x => [x.id, x]));
  const liveById = new Map(liveResources.map(x => [x.id, x]));
  const targetCounts = new Map();
  for (const resource of targetResources) targetCounts.set(resource.id, (targetCounts.get(resource.id) || 0) + 1);
  const findings = [];

  for (const [id, count] of targetCounts) {
    if (count > 1) findings.push(finding('BLOCK','DUPLICATE_TARGET_IDENTITY',targetResources.find(x => x.id === id),`The adopting manifest renders ${count} resources with the same identity.`,`Make rendered resource identities unique before deployment.`));
  }

  for (const target of targetResources) {
    const old = oldById.get(target.id);
    const live = liveById.get(target.id);
    if (old) {
      findings.push(finding('BLOCK','DELETE_AFTER_TRANSFER',target,`${target.kind}/${target.name} remains in ${oldRelease}'s stored manifest while ${newRelease} proposes adoption. A later ${oldRelease} upgrade that removes it can delete the live object after ownership transfer.`,`Remove the object from the old release with an explicitly tested transition, or protect/sequence the migration and verify the live owner before any old-release upgrade.`));
      if (target.clusterScoped) findings.push(finding('BLOCK','SHARED_CLUSTER_RESOURCE',target,`Cluster-scoped ${target.kind}/${target.name} is shared across release histories.`,`Assign one lifecycle owner and keep all other releases from rendering or deleting it.`));
      const keep = old.annotations['helm.sh/resource-policy'] === 'keep';
      if (!keep) findings.push(finding('REVIEW','KEEP_POLICY_MISSING',target,`The old stored object has no helm.sh/resource-policy=keep safety annotation.`,`Do not rely on keep alone; if appropriate, add it before transition and test upgrade/uninstall sequencing.`));
    }
    if (!live) {
      findings.push(finding('REVIEW','LIVE_STATE_UNVERIFIED',target,`No matching live object was supplied for ${target.kind}/${target.name}.`,`Export the live object metadata with kubectl and rerun before adoption.`));
      continue;
    }
    if (!live.owner) {
      findings.push(finding('REVIEW','UNOWNED_LIVE_RESOURCE',target,`The live object has no Helm release-name annotation; --take-ownership will bypass the normal guard.`,`Confirm its current controller and rollback path before adoption.`));
    } else if (live.owner !== oldRelease && live.owner !== newRelease) {
      findings.push(finding('BLOCK','INVALID_OWNER',target,`The live object is owned by ${live.owner}, not declared old owner ${oldRelease} or adopter ${newRelease}.`,`Resolve the unexpected owner; do not force adoption.`));
    }
    if (live.owner === oldRelease && live.ownerNamespace && live.ownerNamespace !== oldNamespace) {
      findings.push(finding('BLOCK','OWNER_NAMESPACE_MISMATCH',target,`Live owner namespace ${live.ownerNamespace} differs from declared ${oldNamespace}.`,`Use the actual release namespace and verify the release history.`));
    }
    if (target.annotations['helm.sh/hook'] || old?.annotations['helm.sh/hook']) {
      findings.push(finding('REVIEW','HOOK_LIFECYCLE_GAP',target,`The resource participates in Helm hook lifecycle semantics.`,`Review hook delete policies and test install, upgrade, rollback, and uninstall.`));
    }
  }

  const counts = { BLOCK: 0, REVIEW: 0 };
  for (const item of findings) if (item.severity in counts) counts[item.severity]++;
  const status = counts.BLOCK ? 'BLOCK' : counts.REVIEW ? 'REVIEW' : 'PASS';
  return {
    schemaVersion: 1,
    status,
    summary: { oldResources: oldResources.length, adoptingResources: targetResources.length, liveResources: liveResources.length, findings: findings.length, ...counts },
    releases: { old: { name: oldRelease, namespace: oldNamespace }, adopting: { name: newRelease, namespace: newNamespace } },
    findings
  };
}

const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderEvidenceHtml(report) {
  const rows = report.findings.map(x => `<tr><td>${esc(x.severity)}</td><td><code>${esc(x.code)}</code></td><td><code>${esc(x.resource)}</code></td><td>${esc(x.message)}</td><td>${esc(x.remediation)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Helm ownership preflight — ${esc(report.status)}</title><style>body{font:15px system-ui;margin:2rem;color:#172033}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd3df;padding:.55rem;text-align:left;vertical-align:top}.BLOCK{color:#a00}code{font-size:12px}</style></head><body><h1>Helm ownership transfer preflight: ${esc(report.status)}</h1><p>Blocks: ${report.summary.BLOCK}; reviews: ${report.summary.REVIEW}; findings: ${report.summary.findings}</p><table><thead><tr><th>Severity</th><th>Code</th><th>Resource</th><th>Evidence</th><th>Remediation</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No ownership-transfer risks detected in supplied evidence.</td></tr>'}</tbody></table></body></html>`;
}
