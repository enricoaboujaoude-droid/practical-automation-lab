#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { analyzeRouting, renderHtml } from "./core.mjs";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));

try {
  if (!args.workflow || !args.inventory) throw new Error("Usage: node cli.mjs --workflow workflow.yml --inventory inventory.json [--json report.json] [--html report.html]");
  const [workflow, inventoryText] = await Promise.all([readFile(args.workflow, "utf8"), readFile(args.inventory, "utf8")]);
  const report = analyzeRouting(workflow, JSON.parse(inventoryText));
  if (args.json) await writeFile(args.json, `${JSON.stringify(report, null, 2)}\n`);
  if (args.html) await writeFile(args.html, renderHtml(report));
  console.log(JSON.stringify(report, null, 2));
  if (report.status === "BLOCK") process.exitCode = 2;
} catch (error) {
  console.error(`Runner routing preflight failed: ${error.message}`);
  process.exitCode = 1;
}
