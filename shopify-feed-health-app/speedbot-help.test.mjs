import test from "node:test";
import assert from "node:assert/strict";

import { extractPublicAssignment } from "./speedbot-help.mjs";

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
      publicUrl: "https://speedbot.dev/work/intro_deep",
    },
  );
});
