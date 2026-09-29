import assert from "node:assert/strict";
import test from "node:test";

import {
  atomicToUsdc,
  fetchOpenTaskmarketTasks,
  resolveTaskmarketScoutIntervalMs,
  selectPaidTaskmarketTasks,
  usdcToAtomic,
} from "./taskmarket-scout.mjs";

test("USDC conversion stays exact at six decimals", () => {
  assert.equal(usdcToAtomic("5.25"), 5_250_000n);
  assert.equal(atomicToUsdc("5250000"), "5.25");
  assert.equal(atomicToUsdc("5000000"), "5");
});

test("selectPaidTaskmarketTasks keeps active zero-stake paid work above the floor", () => {
  const now = Date.parse("2026-09-29T00:00:00Z");
  const future = "2026-09-30T00:00:00Z";

  const tasks = [
    {
      id: "keep",
      description: "Build a small API client",
      reward: "12000000",
      status: "open",
      mode: "bounty",
      stakeRequired: false,
      stakeBps: 0,
      expiryTime: future,
      tags: ["api"],
      requesterActorType: "agent",
    },
    {
      id: "tiny",
      reward: "4000000",
      status: "open",
      mode: "bounty",
      stakeRequired: false,
      expiryTime: future,
    },
    {
      id: "stake",
      reward: "50000000",
      status: "open",
      mode: "claim",
      stakeRequired: true,
      expiryTime: future,
    },
    {
      id: "paid-entry",
      reward: "50000000",
      status: "open",
      mode: "benchmark",
      stakeRequired: false,
      expiryTime: future,
    },
    {
      id: "expired",
      reward: "50000000",
      status: "open",
      mode: "bounty",
      stakeRequired: false,
      expiryTime: "2026-09-28T00:00:00Z",
    },
  ];

  const selected = selectPaidTaskmarketTasks(tasks, { minUsdc: "5", now });
  assert.deepEqual(selected.map((task) => task.id), ["keep"]);
  assert.equal(selected[0].rewardUsdc, "12");
});

test("fetchOpenTaskmarketTasks uses anonymous read-only task discovery", async () => {
  let observed;
  const tasks = await fetchOpenTaskmarketTasks({
    minUsdc: "5",
    fetchImpl: async (url, options) => {
      observed = { url: String(url), options };
      return new Response(
        JSON.stringify({
          tasks: [
            {
              id: "task-1",
              description: "Research",
              reward: "6000000",
              status: "open",
              mode: "bounty",
              stakeRequired: false,
              expiryTime: "2099-01-01T00:00:00Z",
            },
          ],
          hasMore: false,
          nextCursor: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  assert.equal(tasks.length, 1);
  const url = new URL(observed.url);
  assert.equal(url.origin, "https://api.taskmarket.dev");
  assert.equal(url.pathname, "/api/tasks");
  assert.equal(url.searchParams.get("status"), "open");
  assert.equal(url.searchParams.get("phase"), "active");
  assert.equal(url.searchParams.get("minReward"), "5000000");
  assert.equal(url.searchParams.get("sort"), "reward_desc");
  assert.equal(observed.options.method, "GET");
  assert.equal(observed.options.headers.Authorization, undefined);
  assert.equal(observed.options.headers["X-API-Key"], undefined);
});

test("fetchOpenTaskmarketTasks fails closed on HTTP or schema errors", async () => {
  await assert.rejects(
    fetchOpenTaskmarketTasks({
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "nope" }), { status: 503 }),
    }),
    /HTTP 503/,
  );

  await assert.rejects(
    fetchOpenTaskmarketTasks({
      fetchImpl: async () =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    }),
    /unexpected response/,
  );
});

test("Taskmarket scout interval defaults to one hour and stays bounded", () => {
  assert.equal(resolveTaskmarketScoutIntervalMs(), 60 * 60 * 1000);
  assert.equal(resolveTaskmarketScoutIntervalMs("1"), 60 * 60 * 1000);
  assert.equal(
    resolveTaskmarketScoutIntervalMs(String(48 * 60 * 60 * 1000)),
    24 * 60 * 60 * 1000,
  );
});
