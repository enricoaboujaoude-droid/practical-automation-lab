import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

async function source(name) {
  return readFile(resolve(here, name), "utf8");
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

  assert.doesNotMatch(pro, /href=\{?[^\n]*\/app\/export\?type=/);
  assert.doesNotMatch(pro, /target="_top"/);
});

test("legacy scheduled-report view cannot navigate to the old export resource route", async () => {
  const report = await source("app.report.$reportId.tsx");

  assert.doesNotMatch(report, /\/app\/export\?type=/);
  assert.doesNotMatch(report, /target="_top"/);
  assert.match(report, /Back to Monitoring & reports to download CSV/);
});
