#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { analyze, toHtml, toSarif } from "./core.mjs";

const args = Object.fromEntries(process.argv.slice(2).map((v,i,a) => v.startsWith("--") ? [v.slice(2), a[i+1]?.startsWith("--") ? true : a[i+1]] : null).filter(Boolean));
if (!args.manifests) {
  console.error("Usage: node cli.mjs --manifests rendered.yaml [--project appproject.yaml] --current 3.3.9 --target 3.4.2 [--format json|html|sarif] [--output file]");
  process.exit(64);
}
const report = analyze({ manifests: readFileSync(args.manifests, "utf8"), project: args.project ? readFileSync(args.project, "utf8") : "", currentVersion: args.current || "", targetVersion: args.target || "" });
const format = args.format || "json";
const output = format === "html" ? toHtml(report) : JSON.stringify(format === "sarif" ? toSarif(report) : report, null, 2);
if (args.output) writeFileSync(args.output, output); else console.log(output);
process.exitCode = report.status === "BLOCK" ? 2 : 0;
