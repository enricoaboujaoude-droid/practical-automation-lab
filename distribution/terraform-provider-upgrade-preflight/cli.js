#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const core = require("./core");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

try {
  const paths = {
    baselinePlan: arg("baseline-plan"), candidatePlan: arg("candidate-plan"),
    baselineLockfile: arg("baseline-lockfile"), candidateLockfile: arg("candidate-lockfile")
  };
  const missing = Object.entries(paths).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing arguments: ${missing.join(", ")}`);
  const report = core.analyze(Object.fromEntries(Object.entries(paths).map(([key, value]) => [key, fs.readFileSync(value, "utf8")])));
  const jsonPath = arg("json", "upgrade-preflight.json");
  const htmlPath = arg("html", "upgrade-preflight.html");
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(htmlPath, core.renderHtml(report));
  console.log(`${report.status}: ${report.summary.upgrade_introduced_replacements} upgrade-introduced replacement(s)`);
  console.log(`JSON: ${path.resolve(jsonPath)}\nHTML: ${path.resolve(htmlPath)}`);
  process.exitCode = report.status === "BLOCK" ? 2 : 0;
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
