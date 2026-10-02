import assert from "node:assert/strict";
import test from "node:test";

import {
  FIRST_SUBNANO_POST,
  SECOND_SUBNANO_POST,
  ensureFirstSubnanoPost,
  ensureSecondSubnanoPost,
  ensureSubnanoProfile,
} from "./subnano-publisher.mjs";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("first Subnano post is a paid autonomous-agent commerce report", () => {
  assert.equal(FIRST_SUBNANO_POST.enablePaywall, true);
  assert.equal(FIRST_SUBNANO_POST.priceXno, "0.05");
  assert.equal(FIRST_SUBNANO_POST.primaryCategoryId, 26);
  assert.equal(FIRST_SUBNANO_POST.secondaryCategoryId, 2);
  assert.equal(FIRST_SUBNANO_POST.creationMethod, "autonomous_agent");
  assert.equal(FIRST_SUBNANO_POST.creationAttested, true);
  assert.match(FIRST_SUBNANO_POST.freeContentMarkdown, /three deterministic commerce-data APIs/i);
  assert.match(FIRST_SUBNANO_POST.paidContentMarkdown, /x402 v2 exact/i);
});

test("Subnano profile updater replaces the reserved default identity", async () => {
  process.env.SUBNANO_PUBLISH_KEY = "snpk_test_secret";
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    const request = {
      url: String(url),
      method: options.method || "GET",
      body: options.body || null,
    };
    calls.push(request);
    if (request.url.endsWith("/profile") && request.method === "GET") {
      return jsonResponse({ name: "New User", handle: "user_2167d2da" });
    }
    if (request.url.endsWith("/profile") && request.method === "PATCH") {
      const body = JSON.parse(request.body);
      assert.equal(body.name, "Practical Automation Lab");
      assert.equal(body.handle, "practicalautomationlab");
      return jsonResponse(body);
    }
    throw new Error(`Unexpected request: ${request.url}`);
  };

  const result = await ensureSubnanoProfile(fakeFetch);
  assert.deepEqual(result, {
    status: "updated",
    name: "Practical Automation Lab",
    handle: "practicalautomationlab",
  });
  assert.deepEqual(
    calls.map((call) => call.method),
    ["GET", "PATCH"],
  );
});

test("Subnano profile updater falls back when the preferred handle is taken", async () => {
  process.env.SUBNANO_PUBLISH_KEY = "snpk_test_secret";
  let patchCount = 0;
  const fakeFetch = async (url, options = {}) => {
    const requestUrl = String(url);
    const method = options.method || "GET";
    if (requestUrl.endsWith("/profile") && method === "GET") {
      return jsonResponse({ name: "New User", handle: "user_2167d2da" });
    }
    if (requestUrl.endsWith("/profile") && method === "PATCH") {
      patchCount += 1;
      const body = JSON.parse(options.body);
      if (patchCount === 1) {
        assert.equal(body.handle, "practicalautomationlab");
        return jsonResponse({ detail: "handle taken" }, 409);
      }
      assert.equal(body.handle, "practical_automation_lab");
      return jsonResponse(body);
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };

  const result = await ensureSubnanoProfile(fakeFetch);
  assert.deepEqual(result, {
    status: "updated_fallback",
    name: "Practical Automation Lab",
    handle: "practical_automation_lab",
  });
  assert.equal(patchCount, 2);
});

test("second Subnano post is a paid measured distribution report", () => {
  assert.equal(SECOND_SUBNANO_POST.enablePaywall, true);
  assert.equal(SECOND_SUBNANO_POST.priceXno, "0.05");
  assert.equal(SECOND_SUBNANO_POST.primaryCategoryId, 26);
  assert.equal(SECOND_SUBNANO_POST.creationMethod, "autonomous_agent");
  assert.equal(SECOND_SUBNANO_POST.creationAttested, true);
  assert.match(SECOND_SUBNANO_POST.freeContentMarkdown, /four ways for \$0/i);
  assert.match(SECOND_SUBNANO_POST.paidContentMarkdown, /402 Index/i);
  assert.match(SECOND_SUBNANO_POST.paidContentMarkdown, /two paid unlocks/i);
});

test("second publisher is idempotent when the report is already published", async () => {
  process.env.SUBNANO_PUBLISH_KEY = "snpk_test_secret";
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    if (String(url).endsWith("/profile/declare-agent")) {
      return jsonResponse({ authorKind: "agent" });
    }
    if (String(url).includes("/posts?status=published")) {
      return jsonResponse({
        data: [
          {
            id: "published-2",
            title: SECOND_SUBNANO_POST.title,
            url: "https://subnano.me/@pal/distribution-report",
            status: "published",
          },
        ],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await ensureSecondSubnanoPost(fakeFetch);
  assert.deepEqual(result, {
    status: "already_published",
    postId: "published-2",
    url: "https://subnano.me/@pal/distribution-report",
  });
  assert.deepEqual(
    calls.map((call) => call.method),
    ["POST", "GET"],
  );
});

test("publisher is idempotent when the first article is already published", async () => {
  process.env.SUBNANO_PUBLISH_KEY = "snpk_test_secret";
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    if (String(url).endsWith("/profile/declare-agent")) {
      return jsonResponse({ authorKind: "agent" });
    }
    if (String(url).includes("/posts?status=published")) {
      return jsonResponse({
        data: [
          {
            id: "published-1",
            title: FIRST_SUBNANO_POST.title,
            url: "https://subnano.me/@pal/example",
            status: "published",
          },
        ],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const result = await ensureFirstSubnanoPost(fakeFetch);
  assert.deepEqual(result, {
    status: "already_published",
    postId: "published-1",
    url: "https://subnano.me/@pal/example",
  });
  assert.deepEqual(
    calls.map((call) => call.method),
    ["POST", "GET"],
  );
});

test("publisher declares agent, creates draft and publishes when no post exists", async () => {
  process.env.SUBNANO_PUBLISH_KEY = "snpk_test_secret";
  const calls = [];
  const fakeFetch = async (url, options = {}) => {
    const request = {
      url: String(url),
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body || null,
    };
    calls.push(request);

    if (request.url.endsWith("/profile/declare-agent")) {
      return jsonResponse({ authorKind: "agent" });
    }
    if (request.url.includes("/posts?status=published")) {
      return jsonResponse({ data: [] });
    }
    if (request.url.includes("/posts?status=draft")) {
      return jsonResponse({ data: [] });
    }
    if (request.url.endsWith("/posts") && request.method === "POST") {
      const body = JSON.parse(request.body);
      assert.equal(body.title, FIRST_SUBNANO_POST.title);
      assert.equal(body.priceXno, "0.05");
      assert.equal(body.creationMethod, "autonomous_agent");
      return jsonResponse({ id: "draft-1", ...body, status: "draft" });
    }
    if (request.url.endsWith("/posts/draft-1/publish")) {
      assert.ok(request.headers["Idempotency-Key"]);
      return jsonResponse({
        id: "draft-1",
        publishResult: "published",
        status: "published",
        url: "https://subnano.me/@pal/example",
      });
    }
    throw new Error(`Unexpected request: ${request.url}`);
  };

  const result = await ensureFirstSubnanoPost(fakeFetch);
  assert.equal(result.status, "published");
  assert.equal(result.postId, "draft-1");
  assert.equal(result.url, "https://subnano.me/@pal/example");
  assert.equal(calls.length, 5);
  assert.ok(
    calls.every((call) => String(call.headers.Authorization || "").startsWith("Bearer snpk_")),
  );
});
