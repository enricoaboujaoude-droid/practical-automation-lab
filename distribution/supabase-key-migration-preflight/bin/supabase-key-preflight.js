#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runPreflight, formatHumanReport } from '../lib/preflight.js';

function usage() {
  return `Supabase API-key migration preflight

Usage:
  supabase-key-preflight --config ./preflight.config.json [--output ./report.json] [--json]

Credentials are read only from environment variables named by the config.
The tool performs GET or HEAD requests only, refuses cross-origin probes,
does not follow redirects, and redacts credential values from output.`;
}

function parseArgs(argv) {
  const options = { json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--json') options.json = true;
    else if (arg === '--config') options.config = argv[++i];
    else if (arg === '--output') options.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.config) throw new Error('--config is required');
  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    process.exit(0);
  }

  const configPath = resolve(process.cwd(), options.config);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const report = await runPreflight(config, { env: process.env });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (options.output) await writeFile(resolve(process.cwd(), options.output), serialized, { mode: 0o600 });
  console.log(options.json ? serialized.trimEnd() : formatHumanReport(report));
  process.exitCode = report.summary.failed > 0 ? 2 : 0;
} catch (error) {
  console.error(`Preflight failed: ${error.message}`);
  process.exitCode = 1;
}
