(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.OutcomeReconciler = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeExecutions(input) {
    if (Array.isArray(input)) return input;
    if (!input || typeof input !== "object") return [];
    for (const key of ["executions", "results", "data"]) {
      if (Array.isArray(input[key])) return input[key];
    }
    return input.id || input.status || input.data ? [input] : [];
  }

  function workflowNodes(workflow) {
    return asArray(workflow && workflow.nodes);
  }

  function terminalCandidates(workflow) {
    const nodes = workflowNodes(workflow);
    const outgoing = new Set();
    const connections = (workflow && workflow.connections) || {};
    Object.entries(connections).forEach(([source, groups]) => {
      const hasTarget = Object.values(groups || {}).some((lanes) =>
        asArray(lanes).some((lane) => asArray(lane).length > 0)
      );
      if (hasTarget) outgoing.add(source);
    });
    return nodes.map((node) => node.name).filter((name) => !outgoing.has(name));
  }

  function statusOf(execution) {
    const raw = String(execution.status || "").toLowerCase();
    if (raw) return raw;
    if (execution.finished === true) return "success";
    if (execution.finished === false) return "running";
    return "unknown";
  }

  function isSuccessful(execution) {
    return ["success", "successful", "completed", "finished"].includes(statusOf(execution));
  }

  function runDataOf(execution) {
    return (
      execution?.data?.resultData?.runData ||
      execution?.resultData?.runData ||
      execution?.runData ||
      {}
    );
  }

  function nodeRuns(execution, nodeName) {
    return asArray(runDataOf(execution)[nodeName]);
  }

  function nodeItems(execution, nodeName) {
    return nodeRuns(execution, nodeName).flatMap((run) => {
      const main = asArray(run?.data?.main);
      return main.flatMap((lane) => asArray(lane));
    });
  }

  function getPath(value, path) {
    if (!path) return undefined;
    return path.split(".").filter(Boolean).reduce((current, key) => {
      if (current == null) return undefined;
      const normalized = key === "json" && current.json === undefined ? key : key;
      return current[normalized];
    }, value);
  }

  function hasReceipt(items, receiptPath) {
    if (!receiptPath) return true;
    return items.some((item) => {
      const direct = getPath(item, receiptPath);
      const jsonFallback = getPath(item?.json, receiptPath.replace(/^json\./, ""));
      const value = direct === undefined ? jsonFallback : direct;
      return value !== undefined && value !== null && value !== "" && value !== false;
    });
  }

  function executionTime(execution) {
    const value = execution.startedAt || execution.startTime || execution.createdAt || execution.stoppedAt;
    const time = value ? new Date(value).getTime() : NaN;
    return Number.isFinite(time) ? time : null;
  }

  function reconcile(workflow, executionsInput, contract, now) {
    const executions = normalizeExecutions(executionsInput);
    const nodes = workflowNodes(workflow);
    const nodeNames = new Set(nodes.map((node) => node.name));
    const terminals = terminalCandidates(workflow);
    const terminalNode = contract.terminalNode || terminals[0] || "";
    const minItems = Math.max(0, Number(contract.minItems ?? 1));
    const cadenceHours = Math.max(0, Number(contract.cadenceHours || 0));
    const receiptPath = String(contract.receiptPath || "").trim();
    const findings = [];

    if (!nodes.length) findings.push({ severity: "error", code: "WORKFLOW_EMPTY", message: "Workflow has no nodes." });
    if (!terminalNode) findings.push({ severity: "error", code: "TERMINAL_UNSET", message: "No terminal node could be inferred." });
    else if (!nodeNames.has(terminalNode)) findings.push({ severity: "error", code: "TERMINAL_UNKNOWN", message: `Terminal node “${terminalNode}” is not in the workflow.` });
    if (!executions.length) findings.push({ severity: "error", code: "NO_EXECUTIONS", message: "No executions were found in the imported JSON." });

    const executionReports = executions.map((execution, index) => {
      const id = String(execution.id ?? execution.executionId ?? index + 1);
      const status = statusOf(execution);
      const terminalRuns = terminalNode ? nodeRuns(execution, terminalNode) : [];
      const items = terminalNode ? nodeItems(execution, terminalNode) : [];
      const runNodes = Object.keys(runDataOf(execution));
      const issues = [];

      if (isSuccessful(execution) && terminalRuns.length === 0) {
        issues.push({ severity: "error", code: "GREEN_WITHOUT_TERMINAL", message: `Successful execution never reached “${terminalNode}”.` });
      }
      if (isSuccessful(execution) && items.length < minItems) {
        issues.push({ severity: "error", code: "GREEN_BELOW_MINIMUM", message: `Successful execution produced ${items.length} terminal item(s); contract requires at least ${minItems}.` });
      }
      if (isSuccessful(execution) && !hasReceipt(items, receiptPath)) {
        issues.push({ severity: "error", code: "MISSING_RECEIPT", message: `No terminal item contains receipt path “${receiptPath}”.` });
      }
      if (!isSuccessful(execution)) {
        issues.push({ severity: status === "running" ? "warning" : "error", code: "EXECUTION_NOT_SUCCESSFUL", message: `Execution status is “${status}”.` });
      }

      return {
        id,
        status,
        startedAt: execution.startedAt || execution.startTime || execution.createdAt || null,
        terminalNode,
        terminalItems: items.length,
        visitedNodes: runNodes.length,
        issues,
        outcome: issues.some((issue) => issue.severity === "error") ? "failed_contract" : issues.length ? "warning" : "passed_contract",
      };
    });

    const latestTime = executions.map(executionTime).filter((value) => value !== null).sort((a, b) => b - a)[0];
    if (cadenceHours > 0) {
      if (!latestTime) {
        findings.push({ severity: "warning", code: "CADENCE_UNVERIFIABLE", message: "Cadence cannot be checked because executions have no readable timestamps." });
      } else {
        const ageHours = ((now ? new Date(now) : new Date()).getTime() - latestTime) / 3600000;
        if (ageHours > cadenceHours) findings.push({ severity: "error", code: "OVERDUE", message: `Latest execution is ${ageHours.toFixed(1)} hours old; contract requires one every ${cadenceHours} hours.` });
      }
    }

    const passed = executionReports.filter((item) => item.outcome === "passed_contract").length;
    const failed = executionReports.filter((item) => item.outcome === "failed_contract").length;
    const warnings = executionReports.filter((item) => item.outcome === "warning").length;
    const globalErrors = findings.filter((item) => item.severity === "error").length;
    const verdict = globalErrors || failed ? "attention_required" : warnings || findings.length ? "review" : "healthy";

    return {
      generatedAt: (now ? new Date(now) : new Date()).toISOString(),
      verdict,
      contract: { terminalNode, minItems, cadenceHours, receiptPath },
      workflow: { name: workflow?.name || "Unnamed workflow", nodeCount: nodes.length, terminalCandidates: terminals },
      summary: { executionCount: executions.length, passed, failed, warnings, globalFindings: findings.length },
      findings,
      executions: executionReports,
    };
  }

  return { normalizeExecutions, terminalCandidates, reconcile };
});
