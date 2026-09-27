const WORD = /[A-Za-z_:][A-Za-z0-9_:]*/g;
const RESERVED = new Set(['and','or','unless','by','without','on','ignoring','group_left','group_right','bool','offset']);

export function parseInventory(text) {
  const metrics = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_:][A-Za-z0-9_:]*)(?:\{([^}]*)\})?/);
    if (!m) continue;
    const labels = [...(m[2] || '').matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*=/g)].map(x => x[1]);
    metrics[m[1]] ||= [];
    metrics[m[1]] = [...new Set([...metrics[m[1]], ...labels])].sort();
  }
  return metrics;
}

function walkGrafana(value, path, title, out) {
  if (Array.isArray(value)) return value.forEach((v, i) => walkGrafana(v, `${path}[${i}]`, title, out));
  if (!value || typeof value !== 'object') return;
  const nextTitle = typeof value.title === 'string' ? value.title : title;
  if (typeof value.expr === 'string' && value.expr.trim()) {
    out.push({kind:'grafana', name: nextTitle || value.refId || path, path, expr:value.expr.trim()});
  }
  for (const [k,v] of Object.entries(value)) if (k !== 'expr') walkGrafana(v, `${path}.${k}`, nextTitle, out);
}

export function extractGrafana(text, filename='dashboard.json') {
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { throw new Error(`${filename}: invalid JSON (${e.message})`); }
  const out = [];
  walkGrafana(parsed, '$', parsed.title || filename, out);
  return out;
}

export function extractPrometheusRules(text, filename='rules.yml') {
  const lines = text.split(/\r?\n/), out=[];
  let name='', block=null;
  const flush = () => { if (block) { block.expr=block.parts.join('\n').trim(); delete block.parts; if(block.expr) out.push(block); block=null; } };
  for (let i=0;i<lines.length;i++) {
    const line=lines[i], indent=(line.match(/^\s*/)||[''])[0].length;
    const id=line.match(/^\s*-?\s*(alert|record):\s*["']?([^"'#]+?)["']?\s*(?:#.*)?$/);
    if (id) { flush(); name=id[2].trim(); continue; }
    const ex=line.match(/^\s*expr:\s*(.*)$/);
    if (ex) {
      flush(); const rest=ex[1].trim();
      if (/^[|>][-+]?\s*$/.test(rest)) block={kind:'prometheus-rule',name:name||`${filename}:${i+1}`,path:`${filename}:${i+1}`,parts:[],indent};
      else if (rest) out.push({kind:'prometheus-rule',name:name||`${filename}:${i+1}`,path:`${filename}:${i+1}`,expr:rest.replace(/^['"]|['"]$/g,'')});
      continue;
    }
    if (block) {
      if (line.trim() && indent <= block.indent) { flush(); i--; }
      else block.parts.push(line.trim());
    }
  }
  flush(); return out;
}

export function extractConsumers(files) {
  const out=[];
  for (const file of files) {
    const lower=file.name.toLowerCase();
    if (lower.endsWith('.json')) out.push(...extractGrafana(file.text,file.name));
    else if (/\.ya?ml$/.test(lower)) out.push(...extractPrometheusRules(file.text,file.name));
    else throw new Error(`${file.name}: only Grafana JSON and Prometheus YAML are supported`);
  }
  return out.sort((a,b)=>`${a.kind}:${a.path}:${a.expr}`.localeCompare(`${b.kind}:${b.path}:${b.expr}`));
}

function selectorLabels(expr, metric) {
  const labels=new Set();
  const escaped=metric.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`${escaped}\\s*\\{([^}]*)\\}`,'g'); let m;
  while ((m=re.exec(expr))) for (const x of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:!?=~?)/g)) labels.add(x[1]);
  return [...labels].sort();
}

function groupingLabels(expr) {
  const labels=new Set();
  for (const m of expr.matchAll(/\b(?:by|without|on|ignoring|group_left|group_right)\s*\(([^)]*)\)/g)) {
    for (const x of m[1].matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) labels.add(x[0]);
  }
  return [...labels].sort();
}

function referencedMetrics(expr, inventory) {
  const clean=expr.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,' ');
  return [...new Set((clean.match(WORD)||[]).filter(x=>inventory[x] && !RESERVED.has(x)))].sort();
}

function renameCandidates(metric, after) {
  const stem=metric.replace(/_(total|seconds|bytes|count|bucket|sum)$/,'');
  return Object.keys(after).filter(x=>x!==metric && (x.includes(stem)||stem.includes(x.replace(/_(total|seconds|bytes|count|bucket|sum)$/,'')))).sort().slice(0,3);
}

export function analyze({beforeText, afterText, consumers}) {
  const before=parseInventory(beforeText), after=parseInventory(afterText), queries=extractConsumers(consumers), findings=[];
  for (const q of queries) {
    const metrics=referencedMetrics(q.expr,before);
    for (const metric of metrics) {
      if (!after[metric]) findings.push({ruleId:'OTEL-METRIC-REMOVED',level:'BLOCK',consumer:q.name,path:q.path,metric,message:`Referenced metric ${metric} is absent after the upgrade.`,candidates:renameCandidates(metric,after)});
      else {
        for (const label of selectorLabels(q.expr,metric)) if (!after[metric].includes(label)) findings.push({ruleId:'OTEL-SELECTOR-LABEL-REMOVED',level:'BLOCK',consumer:q.name,path:q.path,metric,label,message:`Selector label ${label} is absent from ${metric} after the upgrade.`});
      }
    }
    for (const label of groupingLabels(q.expr)) {
      const applicable=metrics.filter(m=>after[m]);
      if (applicable.length && applicable.every(m=>!after[m].includes(label))) findings.push({ruleId:'OTEL-GROUP-LABEL-REMOVED',level:'REVIEW',consumer:q.name,path:q.path,label,message:`Grouping label ${label} is absent from every surviving referenced metric.`});
    }
  }
  findings.sort((a,b)=>`${a.level}:${a.ruleId}:${a.path}:${a.metric||''}:${a.label||''}`.localeCompare(`${b.level}:${b.ruleId}:${b.path}:${b.metric||''}:${b.label||''}`));
  const blocking=findings.filter(f=>f.level==='BLOCK').length, review=findings.filter(f=>f.level==='REVIEW').length;
  return {schemaVersion:'1.0.0',status:blocking?'BLOCK':review?'REVIEW':'PASS',summary:{beforeMetrics:Object.keys(before).length,afterMetrics:Object.keys(after).length,consumers:queries.length,blocking,review},findings};
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function toHtml(report) {
  const rows=report.findings.map(f=>`<tr><td>${esc(f.level)}</td><td>${esc(f.ruleId)}</td><td>${esc(f.consumer)}</td><td>${esc(f.message)}</td></tr>`).join('')||'<tr><td colspan="4">No broken dependencies detected.</td></tr>';
  return `<!doctype html><meta charset="utf-8"><title>OTel upgrade preflight: ${report.status}</title><style>body{font:15px system-ui;max-width:1100px;margin:40px auto;padding:0 20px;color:#172033}h1{margin-bottom:4px}.BLOCK{color:#b42318}.REVIEW{color:#b54708}.PASS{color:#067647}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d0d5dd;padding:9px;text-align:left;vertical-align:top}</style><h1 class="${report.status}">${report.status}</h1><p>${report.summary.blocking} blocking · ${report.summary.review} review · ${report.summary.consumers} consumers</p><table><thead><tr><th>Level</th><th>Rule</th><th>Consumer</th><th>Evidence</th></tr></thead><tbody>${rows}</tbody></table>`;
}

export function toSarif(report) {
  const rules=[['OTEL-METRIC-REMOVED','Saved query references a metric absent after upgrade'],['OTEL-SELECTOR-LABEL-REMOVED','Selector requires a label absent after upgrade'],['OTEL-GROUP-LABEL-REMOVED','Grouping label is absent after upgrade']];
  return {version:'2.1.0',$schema:'https://json.schemastore.org/sarif-2.1.0.json',runs:[{tool:{driver:{name:'otel-upgrade-blast-radius-preflight',version:'0.1.0',rules:rules.map(([id,description])=>({id,shortDescription:{text:description}}))}},results:report.findings.map(f=>({ruleId:f.ruleId,level:f.level==='BLOCK'?'error':'warning',message:{text:f.message},locations:[{physicalLocation:{artifactLocation:{uri:f.path}}}]}))}]};
}
