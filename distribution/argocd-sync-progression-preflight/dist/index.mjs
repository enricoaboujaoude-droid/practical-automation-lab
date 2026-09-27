import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { analyze } from "../core.mjs";
const input = name => process.env[`INPUT_${name.toUpperCase().replaceAll("-", "_")}`] || "";
try {
  const report = analyze({ manifests: readFileSync(input("manifests"), "utf8"), project: input("project") ? readFileSync(input("project"), "utf8") : "", currentVersion: input("current-version"), targetVersion: input("target-version") });
  const evidence = "argocd-sync-progression-evidence.json";
  writeFileSync(evidence, JSON.stringify(report, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `status=${report.status}\nevidence-json=${evidence}\n`);
  console.log(`${report.status}: ${report.summary.block} blocking, ${report.summary.review} review finding(s). Evidence: ${evidence}`);
  if (report.status === "BLOCK") process.exitCode = 2;
} catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
