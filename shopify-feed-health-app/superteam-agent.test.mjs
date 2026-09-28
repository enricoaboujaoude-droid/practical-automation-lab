import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchAgentListings,
  normalizeAgentListings,
  publicListingSummary,
} from "./superteam-agent.mjs";

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test("normalizeAgentListings accepts supported response envelopes", () => {
  assert.deepEqual(normalizeAgentListings({ listings: [{ id: "a" }] }), [{ id: "a" }]);
  assert.deepEqual(normalizeAgentListings({ data: [{ id: "b" }] }), [{ id: "b" }]);
  assert.deepEqual(normalizeAgentListings([{ id: "c" }]), [{ id: "c" }]);
  assert.deepEqual(normalizeAgentListings({ data: { id: "x" } }), []);
});

test("publicListingSummary exposes only bounded public commercial fields", () => {
  const summary = publicListingSummary({
    id: "listing-1",
    slug: "meaningful-agent-bounty",
    title: "Meaningful agent bounty",
    type: "bounty",
    agentAccess: "AGENT_ALLOWED",
    deadline: "2026-10-05T00:00:00.000Z",
    totalReward: 550,
    sponsor: { name: "Example Sponsor" },
    internalReview: "must not leak",
    apiKey: "secret",
  });

  assert.deepEqual(summary, {
    id: "listing-1",
    slug: "meaningful-agent-bounty",
    title: "Meaningful agent bounty",
    type: "bounty",
    agentAccess: "AGENT_ALLOWED",
    deadline: "2026-10-05T00:00:00.000Z",
    reward: 550,
    sponsor: "Example Sponsor",
  });
  assert.equal(JSON.stringify(summary).includes("secret"), false);
  assert.equal(JSON.stringify(summary).includes("internalReview"), false);
});

test("fetchAgentListings uses bearer auth but returns only listing data", async () => {
  let requestUrl = "";
  let authorization = "";

  const listings = await fetchAgentListings({
    apiKey: "sk_private",
    baseUrl: "https://superteam.fun/",
    fetchImpl: async (url, options) => {
      requestUrl = String(url);
      authorization = options.headers.Authorization;
      return response(200, {
        listings: [
          {
            id: "listing-2",
            title: "Research brief",
            agentAccess: "AGENT_ONLY",
          },
        ],
      });
    },
  });

  assert.match(requestUrl, /\/api\/agents\/listings\/live\?take=20$/);
  assert.equal(authorization, "Bearer sk_private");
  assert.equal(listings.length, 1);
  assert.equal(listings[0].id, "listing-2");
});

test("fetchAgentListings fails closed on authentication failure", async () => {
  await assert.rejects(
    () =>
      fetchAgentListings({
        apiKey: "bad",
        fetchImpl: async () => response(401, { error: "Unauthorized" }),
      }),
    /HTTP 401/,
  );
});
