import assert from "node:assert/strict";
import test from "node:test";

import {
  parseNearMarketAutoBidJobIds,
  resolveNearMarketIntervalMs,
  runNearMarketAgent,
  selectNearMarketObservedJobs,
  selectNearMarketPaidJobs,
} from "./near-market-agent.mjs";

const SAFE_JOB_A = "1725b126-c552-4eb5-b640-de55fe5cb07d";
const SAFE_JOB_B = "1652585a-ed2a-428b-8f66-4c20dabbcf6a";

test("parseNearMarketAutoBidJobIds keeps only explicit job ids", () => {
  const ids = parseNearMarketAutoBidJobIds(
    ` ${SAFE_JOB_A},,${SAFE_JOB_B} `,
  );
  assert.deepEqual([...ids], [SAFE_JOB_A, SAFE_JOB_B]);
});

test("selectNearMarketObservedJobs surfaces open zero-spend jobs without allowlisting", () => {
  const observed = selectNearMarketObservedJobs(
    [
      {
        jobId: "ordinary-paid-job",
        title: "Build a deterministic report",
        description: "Return a JSON report from public data.",
        budgetAmount: "75",
        budgetToken: "USD",
        status: "open",
      },
      {
        jobId: "spend-risk",
        title: "Purchase a product and review it",
        description: "Buy the item first.",
        budgetAmount: "100",
        budgetToken: "USD",
        status: "open",
      },
      {
        jobId: "closed-job",
        title: "Closed work",
        description: "No longer available.",
        budgetAmount: "200",
        budgetToken: "USD",
        status: "closed",
      },
    ],
    { minUsd: "5" },
  );

  assert.deepEqual(observed.map((job) => job.id), ["ordinary-paid-job"]);
});

test("selectNearMarketPaidJobs requires allowlist, floor, open status, and no spend risk", () => {
  const selected = selectNearMarketPaidJobs(
    [
      {
        jobId: SAFE_JOB_A,
        title: "Deterministic capability audit",
        description: "Observe source only and return JSON evidence.",
        budgetAmount: "10",
        budgetToken: "USD",
        status: "open",
      },
      {
        jobId: SAFE_JOB_B,
        title: "Independent safety evaluation",
        description: "Please purchase a test asset first.",
        budgetAmount: "10",
        budgetToken: "USD",
        status: "open",
      },
      {
        jobId: "not-approved",
        title: "Unknown task",
        budgetAmount: "100",
        budgetToken: "USDC",
        status: "open",
      },
    ],
    {
      minUsd: "5",
      autoBidJobIds: new Set([SAFE_JOB_A, SAFE_JOB_B, "not-approved"]),
    },
  );

  assert.deepEqual(selected.map((job) => job.id), [SAFE_JOB_A]);
});

test("runNearMarketAgent submits only missing approved bids", async () => {
  const calls = [];

  const result = await runNearMarketAgent({
    token: "aat_test_only",
    minUsd: "5",
    autoBidEnabled: true,
    autoBidJobIds: new Set([SAFE_JOB_A, SAFE_JOB_B]),
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(String(url));
      calls.push({
        path: parsed.pathname,
        method: options.method || "GET",
        body: options.body || null,
      });

      if (parsed.pathname === "/v1/jobs/board") {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                jobId: SAFE_JOB_A,
                title: "Deterministic capability audit",
                description: "Observe source only and return JSON evidence.",
                budgetAmount: "10",
                budgetToken: "USD",
                status: "open",
              },
              {
                jobId: SAFE_JOB_B,
                title: "Independent safety evaluation",
                description: "Evaluate source without modifying it.",
                budgetAmount: "10",
                budgetToken: "USD",
                status: "open",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (parsed.pathname === "/v1/agents/me/bids") {
        return new Response(
          JSON.stringify({
            bids: [{ id: "existing-bid", jobId: SAFE_JOB_A, status: "pending" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (
        parsed.pathname === `/v1/jobs/${SAFE_JOB_B}/bids` &&
        options.method === "POST"
      ) {
        const body = JSON.parse(options.body);
        assert.equal(body.amount, "10");
        assert.match(body.proposal, /independent safety evaluation/i);
        return new Response(
          JSON.stringify({ id: "new-bid", status: "pending" }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ error: "unexpected request" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(result.status, "ready");
  assert.equal(result.observed.length, 2);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(
    result.bids.map((bid) => [bid.jobId, bid.status]),
    [
      [SAFE_JOB_A, "already_bid"],
      [SAFE_JOB_B, "submitted"],
    ],
  );

  const postCalls = calls.filter((call) => call.method === "POST");
  assert.deepEqual(postCalls.map((call) => call.path), [
    `/v1/jobs/${SAFE_JOB_B}/bids`,
  ]);
});

test("runNearMarketAgent fails closed when the token is absent", async () => {
  let called = false;
  const result = await runNearMarketAgent({
    token: "",
    autoBidEnabled: true,
    fetchImpl: async () => {
      called = true;
      throw new Error("should not fetch");
    },
  });

  assert.equal(result.status, "deferred");
  assert.equal(result.reason, "missing_agent_token");
  assert.equal(called, false);
});

test("NEAR market polling interval defaults to one hour and stays bounded", () => {
  assert.equal(resolveNearMarketIntervalMs(), 60 * 60 * 1000);
  assert.equal(resolveNearMarketIntervalMs("1"), 60 * 60 * 1000);
  assert.equal(
    resolveNearMarketIntervalMs(String(48 * 60 * 60 * 1000)),
    24 * 60 * 60 * 1000,
  );
});
