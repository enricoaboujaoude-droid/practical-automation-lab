import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRestore, parseToc, renderHtml } from "../src/analyzer.mjs";

const toc = `;
; Dumped from database version: 16.4
; Dumped by pg_dump version: 16.4
2; 3079 16400 EXTENSION - pg_trgm
10; 2615 2200 SCHEMA - public app_owner
216; 1259 16408 TABLE public widgets app_owner`;
const safe = { serverVersion: "16.4", roles: ["app_owner"], availableExtensions: ["pg_trgm"] };

test("parses versions, owners and extensions", () => {
  const parsed = parseToc(toc);
  assert.equal(parsed.entries, 3);
  assert.deepEqual(parsed.owners, ["app_owner"]);
  assert.deepEqual(parsed.extensions, ["pg_trgm"]);
});

test("safe inventory passes", () => {
  assert.equal(analyzeRestore(toc, safe).status, "PASS");
});

test("missing owner blocks", () => {
  const report = analyzeRestore(toc, { ...safe, roles: [] });
  assert.equal(report.status, "BLOCK");
  assert.ok(report.findings.some((item) => item.code === "ROLES_MISSING"));
});

test("no-owner converts missing owner to review", () => {
  const report = analyzeRestore(toc, { ...safe, roles: [] }, { noOwner: true });
  assert.equal(report.status, "REVIEW");
  assert.ok(report.findings.some((item) => item.code === "OWNERS_BYPASSED"));
});

test("unavailable extension blocks", () => {
  const report = analyzeRestore(toc, { ...safe, availableExtensions: [] });
  assert.ok(report.findings.some((item) => item.code === "EXTENSIONS_UNAVAILABLE"));
});

test("newer source and dump tool block an older target", () => {
  const report = analyzeRestore(toc, { ...safe, serverVersion: "15.9" });
  assert.deepEqual(report.findings.filter((item) => item.severity === "BLOCK").map((item) => item.code), ["SOURCE_NEWER_THAN_TARGET", "DUMP_TOOL_NEWER_THAN_TARGET"]);
});

test("empty TOC and missing target version block", () => {
  const report = analyzeRestore("; no entries", { roles: [], availableExtensions: [] });
  assert.equal(report.status, "BLOCK");
  assert.ok(report.findings.some((item) => item.code === "TOC_EMPTY"));
  assert.ok(report.findings.some((item) => item.code === "TARGET_VERSION_MISSING"));
});

test("HTML evidence escapes unsafe content", () => {
  const report = analyzeRestore(toc, safe);
  report.findings[0].message = "<script>alert(1)</script>";
  const html = renderHtml(report);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
});
