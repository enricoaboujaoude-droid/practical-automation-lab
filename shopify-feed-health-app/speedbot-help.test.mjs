import test from "node:test";
import assert from "node:assert/strict";

import { extractPublicAssignment, extractPublicAssignmentContext, recoverSpeedbotHelpFromOperatorInbox, recoverSpeedbotHelpThread } from "./speedbot-help.mjs";

test("extractPublicAssignment reads direct public identifiers", () => {
  assert.deepEqual(
    extractPublicAssignment({
      intro_id: "intro_123",
      room_id: "room_456",
      request_id: "request_789",
      public_url: "https://speedbot.dev/work/intro_123",
    }),
    {
      introId: "intro_123",
      roomId: "room_456",
      requestId: "request_789",
      responseId: null,
      publicUrl: "https://speedbot.dev/work/intro_123",
    },
  );
});

test("extractPublicAssignment reads nested assignment identifiers", () => {
  assert.deepEqual(
    extractPublicAssignment({
      assignment: {
        introduction_id: "intro_nested",
        work_room_id: "room_nested",
        work_request_id: "request_nested",
        work_url: "https://speedbot.dev/work/intro_nested",
      },
    }),
    {
      introId: "intro_nested",
      roomId: "room_nested",
      requestId: "request_nested",
      responseId: null,
      publicUrl: "https://speedbot.dev/work/intro_nested",
    },
  );
});

test("extractPublicAssignment returns nulls for unrelated private fields", () => {
  assert.deepEqual(
    extractPublicAssignment({
      credential_reference: "redacted",
      private_opening: "not public",
    }),
    {
      introId: null,
      roomId: null,
      requestId: null,
      responseId: null,
      publicUrl: null,
    },
  );
});


test("extractPublicAssignment finds identifiers through deeper nesting", () => {
  assert.deepEqual(
    extractPublicAssignment({
      result: {
        activation: {
          request: {
            intro_id: "intro_deep",
            room_id: "room_deep",
            request_id: "request_deep",
            url: "https://speedbot.dev/work/intro_deep",
          },
        },
      },
    }),
    {
      introId: "intro_deep",
      roomId: "room_deep",
      requestId: "request_deep",
      responseId: null,
      publicUrl: "https://speedbot.dev/work/intro_deep",
    },
  );
});


test("extractPublicAssignmentContext exposes only bounded public assignment fields", () => {
  const context = extractPublicAssignmentContext({
    assignment: {
      goal: "Check one public API response against its documentation.",
      public_details: "Read-only verification, no credentials or spending.",
      requester_name: "Example Requester",
      intro_id: "intro_safe",
      room_id: "room_safe",
      content: "private opening text must never be logged",
      api_key: "secret-key",
      authorization: "Bearer secret",
      private_opening: "also private",
    },
  });

  assert.deepEqual(context, {
    goal: "Check one public API response against its documentation.",
    public_details: "Read-only verification, no credentials or spending.",
    requester_name: "Example Requester",
    intro_id: "intro_safe",
    room_id: "room_safe",
  });
  assert.equal(JSON.stringify(context).includes("secret"), false);
  assert.equal(JSON.stringify(context).includes("private opening"), false);
});

test("extractPublicAssignmentContext truncates long public text", () => {
  const context = extractPublicAssignmentContext({
    goal: "x".repeat(900),
  });
  assert.equal(context.goal.length, 700);
});


test("extractPublicAssignment recognizes identifiers by value through renamed fields", () => {
  assert.deepEqual(
    extractPublicAssignment({
      assignment: {
        target: "intro_0123456789abcdef0123456789abcdef",
        conversation: "room_abcdef0123456789abcdef0123456789",
        link: "response_00112233445566778899aabbccddeeff",
      },
    }),
    {
      introId: "intro_0123456789abcdef0123456789abcdef",
      roomId: "room_abcdef0123456789abcdef0123456789",
      requestId: null,
      responseId: "response_00112233445566778899aabbccddeeff",
      publicUrl: null,
    },
  );
});

test("recoverSpeedbotHelpThread accepts one recoverable thread", async () => {
  const result = await recoverSpeedbotHelpThread({
    apiKey: "sb_" + "a".repeat(64),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          outgoing: [
            {
              response: "response_00112233445566778899aabbccddeeff",
              intro: "intro_0123456789abcdef0123456789abcdef",
              room: "room_abcdef0123456789abcdef0123456789",
            },
          ],
        };
      },
    }),
  });

  assert.equal(result.status, "single");
  assert.equal(result.candidateCount, 1);
  assert.equal(result.ids.roomId, "room_abcdef0123456789abcdef0123456789");
  assert.equal(result.ids.introId, "intro_0123456789abcdef0123456789abcdef");
});

test("recoverSpeedbotHelpThread fails safe on multiple threads", async () => {
  const result = await recoverSpeedbotHelpThread({
    apiKey: "sb_" + "b".repeat(64),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          threads: [
            { room: "room_11111111111111111111111111111111" },
            { room: "room_22222222222222222222222222222222" },
          ],
        };
      },
    }),
  });

  assert.equal(result.status, "ambiguous");
  assert.equal(result.candidateCount, 2);
  assert.equal(result.ids, null);
});


test("extractPublicAssignment recovers IDs embedded in public Speedbot URLs", () => {
  const roomId = "room_0123456789abcdef0123456789abcdef";
  const introId = "intro_abcdef0123456789abcdef0123456789";
  const result = extractPublicAssignment({
    link: `https://speedbot.dev/work/${roomId}?intro=${introId}`,
  });

  assert.equal(result.roomId, roomId);
  assert.equal(result.introId, introId);
  assert.equal(result.publicUrl, `https://speedbot.dev/work/${roomId}?intro=${introId}`);
});

test("extractPublicAssignment never treats a private operator URL as public work", () => {
  const result = extractPublicAssignment({
    operator_link:
      "https://speedbot.dev/operator/op_" + "a".repeat(64),
  });

  assert.equal(result.publicUrl, null);
  assert.equal(result.roomId, null);
  assert.equal(result.introId, null);
});

test("recoverSpeedbotHelpFromOperatorInbox recovers one public work link without auth headers", async () => {
  const roomId = "room_11111111111111111111111111111111";
  const introId = "intro_22222222222222222222222222222222";
  let requestedUrl = "";
  let requestedHeaders = null;

  const result = await recoverSpeedbotHelpFromOperatorInbox({
    operatorLink:
      "https://speedbot.dev/operator/op_" + "b".repeat(64),
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      requestedHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            pending: [
              {
                kind: "work_reply",
                public_link: `https://speedbot.dev/work/${roomId}?intro=${introId}`,
              },
            ],
          };
        },
      };
    },
  });

  assert.equal(result.status, "single");
  assert.equal(result.candidateCount, 1);
  assert.equal(result.ids.roomId, roomId);
  assert.equal(result.ids.introId, introId);
  assert.match(requestedUrl, /\/inbox\.json$/);
  assert.equal(Object.hasOwn(requestedHeaders, "Authorization"), false);
});

test("recoverSpeedbotHelpFromOperatorInbox fails safe on multiple public work links", async () => {
  const result = await recoverSpeedbotHelpFromOperatorInbox({
    operatorLink:
      "https://speedbot.dev/operator/op_" + "c".repeat(64),
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          pending: [
            { public_link: "https://speedbot.dev/work/room_11111111111111111111111111111111" },
            { public_link: "https://speedbot.dev/work/room_22222222222222222222222222222222" },
          ],
        };
      },
    }),
  });

  assert.equal(result.status, "ambiguous");
  assert.equal(result.candidateCount, 2);
  assert.equal(result.ids, null);
});

test("recoverSpeedbotHelpFromOperatorInbox rejects non-Speedbot operator links", async () => {
  const result = await recoverSpeedbotHelpFromOperatorInbox({
    operatorLink: "https://example.com/operator/op_" + "d".repeat(64),
  });

  assert.equal(result.status, "invalid-link");
  assert.equal(result.ids, null);
});
