import { appendFile, readFile, writeFile } from "node:fs/promises";
import { analyzeRouting, renderHtml } from "./core.mjs";

const workflowPath = process.env["INPUT_WORKFLOW-PATH"] ?? process.env.INPUT_WORKFLOW_PATH;
const inventoryPath = process.env["INPUT_INVENTORY-PATH"] ?? process.env.INPUT_INVENTORY_PATH;
try {
  if (!workflowPath || !inventoryPath) throw new Error("workflow-path and inventory-path are required");
  const [workflow, inventoryText] = await Promise.all([readFile(workflowPath, "utf8"), readFile(inventoryPath, "utf8")]);
  const report = analyzeRouting(workflow, JSON.parse(inventoryText));
  await Promise.all([
    writeFile("runner-routing-preflight.json", `${JSON.stringify(report, null, 2)}\n`),
    writeFile("runner-routing-preflight.html", renderHtml(report))
  ]);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `status=${report.status}\njson-report=runner-routing-preflight.json\nhtml-report=runner-routing-preflight.html\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = report.findings.map((item) => `| ${item.severity} | \`${item.code}\` | ${item.job} | ${item.message.replaceAll("|", "\\|")} |`).join("\n");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Runner routing preflight: ${report.status}\n\n| Severity | Code | Job | Finding |\n|---|---|---|---|\n${rows}\n`);
  }
  if (report.status === "BLOCK") process.exitCode = 2;
} catch (error) {
  console.error(`Runner routing preflight failed: ${error.message}`);
  process.exitCode = 1;
}
