import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchOpenBasedAgentsTasks,
  publicBasedAgentsTaskSummary,
  resolveBasedAgentsScoutIntervalMs,
  selectPaidBasedAgentsTasks,
} from "./basedagents-scout.mjs";

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test("publicBasedAgentsTaskSummary keeps only bounded public commercial fields", () => {
  const summary = publicBasedAgentsTaskSummary({
    task_id: "task_123",
    title: "  Safe\nresearch task  ",
    description: "untrusted instructions must not be logged",
    category: "research",
    status: "open",
    created_at: "2026-09-29T03:00:00Z",
    claimable: true,
    bounty: {
      amount_display: "25.00",
      token: "USDC",
      network: "eip155:8453",
      private_note: "do not leak",
    },
    payment_status: "funded",
    escrow: { status: "funded", wallet: "do-not-log" },
  });

  assert.deepEqual(summary, {
    id: "task_123",
    title: "Safe research task",
    category: "research",
    createdAt: "2026-09-29T03:00:00Z",
    bounty: {
      amount: "25.00",
      token: "USDC",
      network: "eip155:8453",
    },
    paymentStatus: "funded",
    escrowStatus: "funded",
    claimable: true,
  });

  const rendered = JSON.stringify(summary);
  assert.equal(rendered.includes("untrusted instructions"), false);
  assert.equal(rendered.includes("do-not-log"), false);
  assert.equal(rendered.includes("private_note"), false);
});

test("selectPaidBasedAgentsTasks rejects free, non-Base, closed and unclaimable work", () => {
  const tasks = selectPaidBasedAgentsTasks([
    {
      task_id: "good",
      title: "Good",
      status: "open",
      claimable: true,
      bounty: {
        amount_display: "12.50",
        token: "USDC",
        network: "eip155:8453",
      },
    },
    {
      task_id: "free",
      title: "Free",
      status: "open",
      claimable: true,
      bounty: null,
    },
    {
      task_id: "wrong-network",
      title: "Wrong network",
      status: "open",
      claimable: true,
      bounty: {
        amount_display: "9.00",
        token: "USDC",
        network: "eip155:84532",
      },
    },
    {
      task_id: "claimed",
      title: "Already claimed",
      status: "claimed",
      claimable: false,
      bounty: {
        amount_display: "20.00",
        token: "USDC",
        network: "eip155:8453",
      },
    },
    {
      task_id: "not-claimable",
      title: "Not claimable",
      status: "open",
      claimable: false,
      bounty: {
        amount_display: "30.00",
        token: "USDC",
        network: "eip155:8453",
      },
    },
  ]);

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, "good");
  assert.equal(tasks[0].bounty.amount, "12.50");
});

test("fetchOpenBasedAgentsTasks uses the anonymous paid-work board only", async () => {
  let requestUrl = "";
  let requestOptions = null;

  const tasks = await fetchOpenBasedAgentsTasks({
    baseUrl: "https://api.basedagents.ai/",
    minUsdc: "1.00",
    fetchImpl: async (url, options) => {
      requestUrl = String(url);
      requestOptions = options;
      return response(200, {
        ok: true,
        tasks: [
          {
            task_id: "task_live",
            title: "Live paid task",
            status: "open",
            claimable: true,
            bounty: {
              amount_display: "5.00",
              token: "USDC",
              network: "eip155:8453",
            },
            payment_status: "funded",
            escrow: { status: "funded" },
          },
        ],
      });
    },
  });

  const url = new URL(requestUrl);
  assert.equal(url.pathname, "/v1/tasks");
  assert.equal(url.searchParams.get("status"), "open");
  assert.equal(url.searchParams.get("min_usdc"), "1.00");
  assert.equal(url.searchParams.get("limit"), "100");
  assert.equal(requestOptions.method, "GET");
  assert.equal(requestOptions.headers.Authorization, undefined);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].id, "task_live");
});

test("fetchOpenBasedAgentsTasks fails closed on HTTP and schema errors", async () => {
  await assert.rejects(
    () =>
      fetchOpenBasedAgentsTasks({
        fetchImpl: async () => response(503, { error: "unavailable" }),
      }),
    /HTTP 503/,
  );

  await assert.rejects(
    () =>
      fetchOpenBasedAgentsTasks({
        fetchImpl: async () => response(200, { ok: true, tasks: null }),
      }),
    /unexpected response/,
  );
});

test("resolveBasedAgentsScoutIntervalMs defaults to six hours when env is unset and stays bounded", () => {
  const previous = process.env.BASEDAGENTS_SCOUT_INTERVAL_MS;
  delete process.env.BASEDAGENTS_SCOUT_INTERVAL_MS;

  try {
    assert.equal(resolveBasedAgentsScoutIntervalMs(undefined), 6 * 60 * 60 * 1000);
    assert.equal(resolveBasedAgentsScoutIntervalMs("bad"), 6 * 60 * 60 * 1000);
    assert.equal(resolveBasedAgentsScoutIntervalMs("1000"), 60 * 60 * 1000);
    assert.equal(
      resolveBasedAgentsScoutIntervalMs(String(8 * 60 * 60 * 1000)),
      8 * 60 * 60 * 1000,
    );
    assert.equal(
      resolveBasedAgentsScoutIntervalMs(String(72 * 60 * 60 * 1000)),
      24 * 60 * 60 * 1000,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.BASEDAGENTS_SCOUT_INTERVAL_MS;
    } else {
      process.env.BASEDAGENTS_SCOUT_INTERVAL_MS = previous;
    }
  }
});
