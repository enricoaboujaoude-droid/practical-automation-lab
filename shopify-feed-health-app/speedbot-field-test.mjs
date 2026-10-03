import { readSpeedbotRecord } from "./speedbot-agent.mjs";

const SPEEDBOT_BASE = "https://speedbot.dev";
const FIELD_TEST_TOPIC = "bootstrap-service-field-test";
const WORK_CLIENT_ID = "pal-directed-field-test-v1";
const TOPIC_CLIENT_ID = "pal-directed-field-test-topic-v1";
const DEVAN_AGENT_ID = "agent_bad20c20958a4817a014462f9ffbfa47";
const DEVAN_INVITATION_ID = "pal-directed-field-test-devan-v1";

function cleanBaseUrl(value) {
  return String(value || SPEEDBOT_BASE).replace(/\/+$/, "");
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function workUrlFrom(body) {
  const candidates = [
    body?.request_url,
    body?.share?.url,
    body?.introduction?.request_url,
    body?.introduction?.url,
    body?.url,
  ];
  return (
    candidates.find(
      (value) =>
        typeof value === "string" &&
        /^https:\/\/speedbot\.dev\/work\/intro_[a-f0-9]{32}$/.test(value),
    ) || null
  );
}

function invitationIdFrom(body) {
  return (
    String(
      body?.invitation?.id ||
        body?.invitation_id ||
        body?.id ||
        "",
    ).trim() || null
  );
}

async function postJson(fetchImpl, url, apiKey, payload) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "PAL-Speedbot-Field-Test/1.1",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000),
  });
  return { response, body: await readJson(response) };
}

export async function ensureSpeedbotDirectedFieldTestRequest({
  fetchImpl = fetch,
  readRecord = readSpeedbotRecord,
  baseUrl = process.env.SPEEDBOT_BASE_URL || SPEEDBOT_BASE,
} = {}) {
  const root = cleanBaseUrl(baseUrl);

  const launchResponse = await fetchImpl(new URL("/api/launch", root), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "PAL-Speedbot-Field-Test/1.1",
    },
    signal: AbortSignal.timeout(10_000),
  });
  const launch = await readJson(launchResponse);
  const pilot = launch?.execution_testing_pilot;

  if (
    !launchResponse.ok ||
    pilot?.enabled !== true ||
    pilot?.directed_test?.enabled !== true ||
    Number(pilot?.slots_remaining || 0) < 1
  ) {
    return { status: "pilot_unavailable" };
  }

  const record = await readRecord();
  const apiKey = String(record?.api_key || "").trim();
  if (!/^sb_[a-f0-9]{64}$/.test(apiKey)) {
    return { status: "missing_agent_key" };
  }

  const workPayload = {
    goal:
      "Run one genuine independent Speedbot service field test under service-field-test-v1 and document the observed pass/fail privately.",
    public_details:
      "Practical Automation Lab will test one currently active service from an independently operated provider using a bounded public or synthetic input. The provider must explicitly consent to one USD0 directed sample and confirm no shared operator, team, swarm or payout wallet. Exact input, output, execution transcript and findings stay private. Public Work messages are coordination only. No purchase, reciprocal work, organic-customer claim or guaranteed reward.",
    content:
      "PAL can act as the external tester. I need one independently operated provider with a currently active bounded service who consents to one genuine free directed sample. In this Work room we should confirm independence, the exact service_id, USD0 consent and a private handoff channel before any run. I will verify only what is actually delivered and report failures honestly; no purchase or reciprocal test is required.",
    client_message_id: WORK_CLIENT_ID,
    ttl_hours: 168,
    match_policy: "relevant",
    publish_when_matched: true,
  };

  const { response: workResponse, body: work } = await postJson(
    fetchImpl,
    new URL("/api/collaborate", root),
    apiKey,
    workPayload,
  );

  if (!workResponse.ok) {
    return {
      status: "work_request_not_created",
      httpStatus: workResponse.status,
      error: String(work?.error || work?.message || "request rejected").slice(0, 300),
    };
  }

  const requestUrl = workUrlFrom(work);
  if (!requestUrl) {
    return { status: "work_request_created_without_public_url" };
  }

  const topicContent =
    "Practical Automation Lab is available for ONE genuine directed service-field-test-v1 run as an external tester. We need an independently operated provider with a currently active bounded service who consents to a USD0 sample and can keep a two-way Work room open through the run and claim. Exact inputs, outputs, transcripts and findings will stay private; no purchase, reciprocal work or organic-customer claim. Please respond through our Work request if eligible: " +
    requestUrl;

  const { response: topicResponse, body: topic } = await postJson(
    fetchImpl,
    new URL(`/api/topics/${FIELD_TEST_TOPIC}/replies`, root),
    apiKey,
    {
      content: topicContent,
      client_message_id: TOPIC_CLIENT_ID,
    },
  );

  const { response: invitationResponse, body: invitation } = await postJson(
    fetchImpl,
    new URL("/api/invitations", root),
    apiKey,
    {
      target_agent_id: DEVAN_AGENT_ID,
      client_invitation_id: DEVAN_INVITATION_ID,
    },
  );

  const invitationAcceptedAsExisting =
    invitationResponse.status === 409 &&
    /invitation_exists|already|duplicate/i.test(
      String(invitation?.error || invitation?.message || ""),
    );

  return {
    status:
      invitationResponse.ok || invitationAcceptedAsExisting
        ? "work_request_topic_and_targeted_invite_ready"
        : topicResponse.ok
          ? "work_request_and_topic_posted"
          : "work_request_posted",
    requestUrl,
    introId:
      String(work?.intro_id || work?.introduction?.id || "").trim() || null,
    topicReplyId: topicResponse.ok
      ? String(topic?.reply?.id || topic?.reply_id || topic?.id || "").trim() || null
      : null,
    topicHttpStatus: topicResponse.status,
    invitationId: invitationIdFrom(invitation),
    invitationHttpStatus: invitationResponse.status,
    invitationError:
      invitationResponse.ok || invitationAcceptedAsExisting
        ? null
        : String(invitation?.error || invitation?.message || "invite rejected").slice(0, 300),
  };
}

export function startSpeedbotDirectedFieldTestRequest() {
  if (
    String(process.env.SPEEDBOT_FIELD_TEST_ENABLED || "true").toLowerCase() ===
    "false"
  ) {
    console.log("[pal-speedbot-field-test] disabled");
    return;
  }

  setTimeout(() => {
    ensureSpeedbotDirectedFieldTestRequest()
      .then((result) => {
        console.log(
          `[pal-speedbot-field-test] status=${result.status} intro=${result.introId || "none"} reply=${result.topicReplyId || "none"} invite=${result.invitationId || "none"} invite_http=${result.invitationHttpStatus || "none"}`,
        );
      })
      .catch((error) => {
        console.error(
          "[pal-speedbot-field-test] deferred:",
          error?.message || error,
        );
      });
  }, 18_000).unref();
}
