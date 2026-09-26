#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { analyzeOwnership, renderEvidenceHtml } from './analyzer.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((v,i,a) => v.startsWith('--') ? [v.slice(2), a[i+1] && !a[i+1].startsWith('--') ? a[i+1] : true] : null).filter(Boolean));
if (!args.old || !args.adopting || !args['old-release'] || !args['new-release']) {
  console.error('Usage: node cli.mjs --old old.yaml --adopting new.yaml --live live.json --old-release release-a --new-release release-b [--json report.json] [--html report.html]');
  process.exit(2);
}
const input = {
  oldManifest: await readFile(args.old, 'utf8'),
  adoptingManifest: await readFile(args.adopting, 'utf8'),
  liveInventory: args.live ? await readFile(args.live, 'utf8') : '',
  oldRelease: args['old-release'], oldNamespace: args['old-namespace'] || 'default',
  newRelease: args['new-release'], newNamespace: args['new-namespace'] || 'default'
};
const report = analyzeOwnership(input);
const json = JSON.stringify(report, null, 2) + '\n';
if (args.json) await writeFile(args.json, json);
if (args.html) await writeFile(args.html, renderEvidenceHtml(report));
process.stdout.write(json);
process.exitCode = report.status === 'BLOCK' ? 1 : 0;
