import { appendFile, readFile, writeFile } from "node:fs/promises";
import { analyzeRestore, renderHtml } from "./src/analyzer.mjs";

const tocPath = process.env.INPUT_TOC_PATH;
const targetPath = process.env.INPUT_TARGET_PATH;
const noOwner = String(process.env.INPUT_NO_OWNER).toLowerCase() === "true";
const jsonPath = "pg-restore-preflight.json";
const htmlPath = "pg-restore-preflight.html";

try {
  if (!tocPath || !targetPath) throw new Error("toc-path and target-path are required");
  const [toc, targetText] = await Promise.all([readFile(tocPath, "utf8"), readFile(targetPath, "utf8")]);
  const report = analyzeRestore(toc, JSON.parse(targetText), { noOwner });
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
    writeFile(htmlPath, renderHtml(report))
  ]);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `status=${report.status}\njson-report=${jsonPath}\nhtml-report=${htmlPath}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = report.findings.map((item) => `| ${item.severity} | \`${item.code}\` | ${item.message.replaceAll("|", "\\|")} |`).join("\n");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## PostgreSQL restore preflight: ${report.status}\n\n| Severity | Code | Finding |\n|---|---|---|\n${rows}\n`);
  }
  console.log(`PostgreSQL restore preflight: ${report.status}`);
  if (report.status === "BLOCK") process.exitCode = 2;
} catch (error) {
  console.error(`Preflight failed: ${error.message}`);
  process.exitCode = 1;
}
