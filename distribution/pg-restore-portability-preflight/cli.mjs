#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { analyzeRestore, renderHtml } from "./src/analyzer.mjs";

function parseArgs(argv) {
  const result = { noOwner: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--no-owner") result.noOwner = true;
    else if (["--toc", "--target", "--json", "--html"].includes(token)) result[token.slice(2)] = argv[++index];
    else if (token === "--help") result.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return result;
}

const usage = "Usage: node cli.mjs --toc archive.list --target target.json [--no-owner] [--json report.json] [--html report.html]";

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  if (!args.toc || !args.target) throw new Error(usage);
  const [toc, targetText] = await Promise.all([readFile(args.toc, "utf8"), readFile(args.target, "utf8")]);
  const report = analyzeRestore(toc, JSON.parse(targetText), { noOwner: args.noOwner });
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.json) await writeFile(args.json, json);
  if (args.html) await writeFile(args.html, renderHtml(report));
  process.stdout.write(json);
  if (report.status === "BLOCK") process.exitCode = 2;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
