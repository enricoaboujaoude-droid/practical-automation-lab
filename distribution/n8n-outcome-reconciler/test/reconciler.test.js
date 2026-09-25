const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcile, terminalCandidates } = require("../reconciler.js");

const workflow = {
  name: "Daily client report",
  nodes: [{ name: "Schedule" }, { name: "Get Rows" }, { name: "Send Report" }],
  connections: {
    Schedule: { main: [[{ node: "Get Rows" }]] },
    "Get Rows": { main: [[{ node: "Send Report" }]] },
  },
};

function execution(id, status, terminalItems, startedAt = "2026-09-25T12:00:00Z") {
  const runData = { Schedule: [{ data: { main: [[{ json: {} }]] } }], "Get Rows": [{ data: { main: [[{ json: { id: 1 } }]] } }] };
  if (terminalItems !== null) runData["Send Report"] = [{ data: { main: [terminalItems] } }];
  return { id, status, startedAt, data: { resultData: { runData } } };
}

test("infers terminal workflow nodes", () => {
  assert.deepEqual(terminalCandidates(workflow), ["Send Report"]);
});

test("passes a successful execution with minimum output and receipt", () => {
  const report = reconcile(workflow, [execution("1", "success", [{ json: { messageId: "abc" } }])], {
    terminalNode: "Send Report", minItems: 1, cadenceHours: 24, receiptPath: "json.messageId",
  }, "2026-09-25T13:00:00Z");
  assert.equal(report.verdict, "healthy");
  assert.equal(report.summary.passed, 1);
});

test("flags green zero-item execution", () => {
  const report = reconcile(workflow, [execution("2", "success", [])], {
    terminalNode: "Send Report", minItems: 1, receiptPath: "json.messageId",
  }, "2026-09-25T13:00:00Z");
  assert.equal(report.verdict, "attention_required");
  assert.ok(report.executions[0].issues.some((issue) => issue.code === "GREEN_BELOW_MINIMUM"));
  assert.ok(report.executions[0].issues.some((issue) => issue.code === "MISSING_RECEIPT"));
});

test("flags successful execution that never reaches terminal", () => {
  const report = reconcile(workflow, [execution("3", "success", null)], {
    terminalNode: "Send Report", minItems: 0,
  }, "2026-09-25T13:00:00Z");
  assert.ok(report.executions[0].issues.some((issue) => issue.code === "GREEN_WITHOUT_TERMINAL"));
});

test("flags overdue cadence", () => {
  const report = reconcile(workflow, [execution("4", "success", [{ json: { messageId: "ok" } }], "2026-09-23T12:00:00Z")], {
    terminalNode: "Send Report", minItems: 1, cadenceHours: 24,
  }, "2026-09-25T13:00:00Z");
  assert.ok(report.findings.some((issue) => issue.code === "OVERDUE"));
});
