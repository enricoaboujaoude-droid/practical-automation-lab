import { analyzeRestore, renderHtml } from "./src/analyzer.mjs";

const form = document.querySelector("form");
const output = document.querySelector("#output");
let latestReport = null;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  try {
    latestReport = analyzeRestore(
      document.querySelector("#toc").value,
      JSON.parse(document.querySelector("#target").value),
      { noOwner: document.querySelector("#no-owner").checked }
    );
    output.textContent = JSON.stringify(latestReport, null, 2);
    output.dataset.status = latestReport.status;
  } catch (error) {
    latestReport = null;
    output.textContent = `ERROR: ${error.message}`;
    output.dataset.status = "BLOCK";
  }
});

document.querySelector("#download-json").addEventListener("click", () => download("pg-restore-preflight.json", JSON.stringify(latestReport, null, 2), "application/json"));
document.querySelector("#download-html").addEventListener("click", () => download("pg-restore-preflight.html", renderHtml(latestReport), "text/html"));

function download(name, content, type) {
  if (!latestReport) return;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}
