import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, parseBundle, toHtml, toSarif } from "./core.mjs";
const safe = readFileSync(new URL("./sample/safe.yaml", import.meta.url), "utf8");
const blocked = readFileSync(new URL("./sample/blocked.yaml", import.meta.url), "utf8");
const cases = [];
const test = (name, fn) => cases.push([name, fn]);

test("parses multi-document bundle", () => assert.equal(parseBundle(safe).length, 2));
test("safe sample passes", () => assert.equal(analyze({manifests:safe,targetVersion:"3.3.9"}).status, "PASS"));
test("invalid wave blocks", () => assert.equal(analyze({manifests:"kind: ConfigMap\nmetadata:\n  name: x\n  annotations:\n    argocd.argoproj.io/sync-wave: later",targetVersion:"3.3.9"}).status, "BLOCK"));
test("service account ordering blocks", () => assert.ok(analyze({manifests:blocked,targetVersion:"3.3.9"}).findings.some(f=>f.ruleId==="ARGO-DEP-004")));
test("mixed lifecycle hook phases block", () => assert.ok(analyze({manifests:blocked,targetVersion:"3.3.9"}).findings.some(f=>f.ruleId==="ARGO-HOOK-002")));
test("named hook without delete policy reviews", () => assert.ok(analyze({manifests:blocked,targetVersion:"3.3.9"}).findings.some(f=>f.ruleId==="ARGO-HOOK-003")));
test("3.4.2 app-of-apps regression blocks", () => assert.ok(analyze({manifests:blocked,currentVersion:"3.3.9",targetVersion:"3.4.2"}).findings.some(f=>f.ruleId==="ARGO-UPGRADE-005")));
test("other target version skips scoped regression", () => assert.ok(!analyze({manifests:blocked,targetVersion:"3.5.0"}).findings.some(f=>f.ruleId==="ARGO-UPGRADE-005")));
test("deny window combination reviews", () => { const p=`apiVersion: argoproj.io/v1alpha1\nkind: AppProject\nmetadata:\n  name: p\nspec:\n  syncWindows:\n    - kind: deny`; const a=`apiVersion: argoproj.io/v1alpha1\nkind: Application\nmetadata:\n  name: a\n  annotations:\n    argocd.argoproj.io/sync-wave: "1"\nspec:\n  syncPolicy:\n    automated: {}`; assert.ok(analyze({manifests:a,project:p,targetVersion:"3.3.9"}).findings.some(f=>f.ruleId==="ARGO-WINDOW-006")); });
test("missing version reviews", () => assert.ok(analyze({manifests:safe}).findings.some(f=>f.ruleId==="INPUT-007")));
test("HTML evidence is standalone", () => assert.match(toHtml(analyze({manifests:blocked,targetVersion:"3.4.2"})), /<!doctype html>/));
test("SARIF evidence contains results", () => assert.ok(toSarif(analyze({manifests:blocked,targetVersion:"3.4.2"})).runs[0].results.length >= 3));

let failed = 0;
for (const [name, fn] of cases) { try { fn(); console.log(`PASS ${name}`); } catch (e) { failed++; console.error(`FAIL ${name}\n${e.stack}`); } }
console.log(`${cases.length - failed}/${cases.length} tests passed`);
if (failed) process.exit(1);
