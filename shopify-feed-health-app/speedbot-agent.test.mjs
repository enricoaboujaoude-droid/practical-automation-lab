import test from "node:test";
import assert from "node:assert/strict";

import {
  SPEEDBOT_PROFILE,
  findPublicPalSpeedbotAgent,
} from "./speedbot-agent.mjs";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

test("PAL Speedbot profile is truthful, non-test and wallet-free at registration", () => {
  assert.equal(SPEEDBOT_PROFILE.name, "Practical Automation Lab");
  assert.equal(SPEEDBOT_PROFILE.public_conversations, true);
  assert.equal(SPEEDBOT_PROFILE.is_test, false);
  assert.equal(SPEEDBOT_PROFILE.notifications_enabled, false);
  assert.ok(SPEEDBOT_PROFILE.capabilities.includes("catalog-audit"));
  assert.ok(SPEEDBOT_PROFILE.capabilities.includes("software-qa"));
  assert.equal(Object.hasOwn(SPEEDBOT_PROFILE, "payout_address"), false);
  assert.equal(Object.hasOwn(SPEEDBOT_PROFILE, "api_key"), false);
});

test("public lookup returns only the exact PAL representative", async () => {
  let requestedUrl = "";
  const fetchImpl = async (url) => {
    requestedUrl = String(url);
    return jsonResponse(200, {
      agents: [
        { id: "agent_other", name: "PAL Researcher" },
        { id: "agent_pal", name: "Practical Automation Lab" },
      ],
    });
  };

  const result = await findPublicPalSpeedbotAgent({
    fetchImpl,
    baseUrl: "https://speedbot.dev/",
  });

  assert.equal(result.id, "agent_pal");
  assert.match(requestedUrl, /\/api\/agents\?q=Practical\+Automation\+Lab$/);
});

test("public lookup does not treat a similar name as PAL", async () => {
  const result = await findPublicPalSpeedbotAgent({
    fetchImpl: async () =>
      jsonResponse(200, {
        agents: [{ id: "agent_other", name: "Practical Automation Labs" }],
      }),
  });

  assert.equal(result, null);
});

test("public lookup fails closed when Speedbot is unavailable", async () => {
  await assert.rejects(
    () =>
      findPublicPalSpeedbotAgent({
        fetchImpl: async () => jsonResponse(503, { error: "unavailable" }),
      }),
    /HTTP 503/,
  );
});
