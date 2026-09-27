import fs from 'node:fs'; import path from 'node:path'; import {analyze,toHtml,toSarif} from './core.mjs';
const get=n=>process.env[`INPUT_${n.toUpperCase().replaceAll('-','_')}`]||'';
const consumers=get('consumers').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const report=analyze({beforeText:fs.readFileSync(get('before'),'utf8'),afterText:fs.readFileSync(get('after'),'utf8'),consumers:consumers.map(p=>({name:path.basename(p),text:fs.readFileSync(p,'utf8')}))});
fs.writeFileSync('otel-preflight.json',JSON.stringify(report,null,2)+'\n');fs.writeFileSync('otel-preflight.html',toHtml(report));fs.writeFileSync('otel-preflight.sarif',JSON.stringify(toSarif(report),null,2)+'\n');
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`status=${report.status}\nblocking-count=${report.summary.blocking}\nreview-count=${report.summary.review}\n`);
console.log(`OTel upgrade preflight: ${report.status}; ${report.summary.blocking} blocking, ${report.summary.review} review`);
if(get('fail-on-block')!=='false'&&report.status==='BLOCK')process.exitCode=1;
