import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const routes = resolve(here, "../routes");

async function source(name) {
  return readFile(resolve(routes, name), "utf8");
}

test("Pro CSV exports stay inside the embedded app and use fetcher delivery", async () => {
  const pro = await source("app.pro.tsx");

  assert.match(pro, /useFetcher/);
  assert.match(pro, /name="intent" value="export-csv"/);
  assert.match(pro, /exportType" value="history"/);
  assert.match(pro, /exportType" value="issues"/);
  assert.match(pro, /exportType" value="scheduled"/);
  assert.match(pro, /new Blob/);
  assert.match(pro, /link\.download = payload\.filename/);
  assert.match(pro, /CSV export failed/);
  assert.match(pro, /The CSV could not be prepared/);
  assert.match(pro, /Browser download needs confirmation/);
  assert.match(pro, /Download again/);

  assert.doesNotMatch(pro, /href=\{?[^\n]*\/app\/export\?type=/);
  assert.doesNotMatch(pro, /target="_top"/);
});

test("legacy scheduled-report view cannot navigate to the old export resource route", async () => {
  const report = await source("app.report.$reportId.tsx");

  assert.doesNotMatch(report, /\/app\/export\?type=/);
  assert.doesNotMatch(report, /target="_top"/);
  assert.match(report, /Back to Monitoring & reports to download CSV/);
});
