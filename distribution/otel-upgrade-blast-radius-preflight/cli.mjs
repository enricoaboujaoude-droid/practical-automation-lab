#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import {analyze,toHtml,toSarif} from './core.mjs';
function usage(){console.log('Usage: node cli.mjs --before before.prom --after after.prom --consumer dashboard.json --consumer rules.yml [--json report.json] [--html report.html] [--sarif report.sarif]');}
const args=process.argv.slice(2), opts={consumer:[]};
for(let i=0;i<args.length;i++){const k=args[i];if(k==='--help'){usage();process.exit(0)}if(!k.startsWith('--')) throw new Error(`Unexpected argument: ${k}`);const key=k.slice(2),v=args[++i];if(!v)throw new Error(`Missing value for ${k}`);if(key==='consumer')opts.consumer.push(v);else opts[key]=v;}
if(!opts.before||!opts.after||!opts.consumer.length){usage();process.exit(2)}
const read=p=>fs.readFileSync(p,'utf8');
const report=analyze({beforeText:read(opts.before),afterText:read(opts.after),consumers:opts.consumer.map(p=>({name:path.basename(p),text:read(p)}))});
if(opts.json)fs.writeFileSync(opts.json,JSON.stringify(report,null,2)+'\n');if(opts.html)fs.writeFileSync(opts.html,toHtml(report));if(opts.sarif)fs.writeFileSync(opts.sarif,JSON.stringify(toSarif(report),null,2)+'\n');
console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='BLOCK'?1:0;
