"use strict";
const fs = require("fs");
const core = require("./core");

const input = (name) => {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  return process.env[key] || process.env[key.replace(/-/g, "_")];
};
const output = (name, value) => fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);

try {
  const report = core.analyze({
    baselinePlan: fs.readFileSync(input("baseline-plan"), "utf8"),
    candidatePlan: fs.readFileSync(input("candidate-plan"), "utf8"),
    baselineLockfile: fs.readFileSync(input("baseline-lockfile"), "utf8"),
    candidateLockfile: fs.readFileSync(input("candidate-lockfile"), "utf8")
  });
  const jsonPath = input("json-output") || "upgrade-preflight.json";
  const htmlPath = input("html-output") || "upgrade-preflight.html";
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(htmlPath, core.renderHtml(report));
  output("status", report.status);
  output("replacement-count", report.summary.upgrade_introduced_replacements);
  output("json-report", jsonPath);
  output("html-report", htmlPath);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Terraform provider-upgrade preflight: ${report.status}\n\n- Upgrade-introduced replacements: ${report.summary.upgrade_introduced_replacements}\n- High-risk replacements: ${report.summary.high_risk_replacements}\n`);
  if (report.status === "BLOCK" && input("fail-on-block") !== "false") process.exitCode = 2;
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
