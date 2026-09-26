const assert = require("node:assert/strict");
const { analyze } = require("./core");
const ruleset = (checks = ["test"], mergeQueue = true) => ({ rules: [
  { type: "required_status_checks", parameters: { required_status_checks: checks.map((context) => ({ context })) } },
  ...(mergeQueue ? [{ type: "merge_queue", parameters: {} }] : []),
] });
const workflow = ({ events = ["pull_request", "merge_group"], job = "test", extra = "" } = {}) => `name: CI\non:\n${events.map((e) => `  ${e}:`).join("\n")}\njobs:\n  ${job}:\n    name: ${job}\n    runs-on: ubuntu-latest\n${extra}`;
const run = (r = ruleset(), w = workflow()) => analyze({ ruleset: r, workflowYaml: w });
const has = (report, code) => report.findings.some((item) => item.code === code);

const tests = [
  ["missing merge_group blocks", () => assert(has(run(ruleset(), workflow({ events: ["pull_request"] })), "MISSING_MERGE_GROUP"))],
  ["exact required check passes", () => assert(has(run(), "REQUIRED_CHECK_PRESENT"))],
  ["wildcard context blocks", () => assert(has(run(ruleset(["test*"]), workflow()), "WILDCARD_CHECK_CONTEXT"))],
  ["duplicate context blocks", () => assert(has(run(ruleset(["test", "test"]), workflow()), "DUPLICATE_REQUIRED_CHECK"))],
  ["paths filter blocks", () => assert(has(run(ruleset(["test"], false), `on:\n  pull_request:\n    paths:\n      - "src/**"\njobs:\n  test:\n    runs-on: ubuntu-latest`), "SKIPPABLE_REQUIRED_WORKFLOW"))],
  ["absent job blocks", () => assert(has(run(ruleset(["release"]), workflow()), "REQUIRED_CHECK_ABSENT"))],
  ["safe configuration passes", () => assert.equal(run().status, "PASS")],
];
let passed = 0;for (const [name, test] of tests) {try{test();passed++;console.log(`ok - ${name}`)}catch(e){console.error(`not ok - ${name}\n${e.stack}`);process.exitCode=1}}console.log(`${passed}/${tests.length} tests passed`);
