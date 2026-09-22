import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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

test("all app route source files avoid legacy CSV export navigation", async () => {
  const entries = await readdir(routes, { withFileTypes: true });
  const routeFiles = entries
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => entry.name);

  assert.ok(routeFiles.length > 0);

  for (const name of routeFiles) {
    const body = await source(name);
    assert.doesNotMatch(
      body,
      /href=\{?[^\n]*\/app\/export\?type=/,
      `${name} reintroduced legacy export navigation`,
    );
  }
});

test("Pro export action authenticates and gates entitlement before reading export input", async () => {
  const pro = await source("app.pro.tsx");
  const authIndex = pro.indexOf("authenticate.admin(request)");
  const entitlementIndex = pro.indexOf("getEntitlementForShop");
  const formIndex = pro.indexOf("request.formData()");
  const proGateIndex = pro.indexOf('entitlement.plan !== "pro"');

  assert.ok(authIndex >= 0);
  assert.ok(entitlementIndex > authIndex);
  assert.ok(proGateIndex > entitlementIndex);
  assert.ok(formIndex > proGateIndex);
});

test("Findings and scheduled report exports remain scoped to the authenticated shop", async () => {
  const pro = await source("app.pro.tsx");

  assert.match(pro, /where:\s*\{ id: scanId, shop: session\.shop \}/);
  assert.match(pro, /where:\s*\{ id: reportId, shop: session\.shop \}/);
});

test("browser CSV download uses a local object URL and cleans it up", async () => {
  const pro = await source("app.pro.tsx");

  assert.match(pro, /URL\.createObjectURL\(blob\)/);
  assert.match(pro, /document\.createElement\("a"\)/);
  assert.match(pro, /link\.download = payload\.filename/);
  assert.match(pro, /link\.remove\(\)/);
  assert.match(pro, /URL\.revokeObjectURL\(objectUrl\)/);
});

test("CSV preparation and browser download failures stay inside the embedded page", async () => {
  const pro = await source("app.pro.tsx");

  assert.match(pro, /CSV export failed/);
  assert.match(pro, /The CSV could not be prepared/);
  assert.match(pro, /browser CSV download failed/);
  assert.match(pro, /Browser download needs confirmation/);
  assert.match(pro, /Download again/);
  assert.doesNotMatch(pro, /window\.location\s*=/);
  assert.doesNotMatch(pro, /location\.href\s*=/);
});

test("legacy export resource remains authenticated, Pro-gated and shop-scoped", async () => {
  const legacy = await source("app.export.tsx");

  assert.match(legacy, /authenticate\.admin\(request\)/);
  assert.match(legacy, /entitlement\.plan !== "pro"/);
  assert.match(legacy, /where:\s*\{ id: scanId, shop: session\.shop \}/);
  assert.match(legacy, /where:\s*\{ id: reportId, shop: session\.shop \}/);
});

test("all three Pro export controls submit through the embedded fetcher", async () => {
  const pro = await source("app.pro.tsx");
  const forms = pro.match(/<exportFetcher\.Form method="post">/g) || [];
  assert.equal(forms.length, 3);
  assert.match(pro, /exportType" value="history"/);
  assert.match(pro, /exportType" value="issues"/);
  assert.match(pro, /exportType" value="scheduled"/);
});

