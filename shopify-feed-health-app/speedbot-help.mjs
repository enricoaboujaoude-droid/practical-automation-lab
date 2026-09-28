import { PrismaClient } from "@prisma/client";
import { readSpeedbotRecord } from "./speedbot-agent.mjs";

const prisma = new PrismaClient();
const DEFAULT_BASE_URL = "https://speedbot.dev";
let tableReadyPromise;

function cleanBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export async function ensureSpeedbotHelpTable(db = prisma) {
  if (!tableReadyPromise || db !== prisma) {
    const operation = db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS pal_speedbot_help_assignment (
        singleton SMALLINT PRIMARY KEY CHECK (singleton = 1),
        status TEXT NOT NULL,
        intro_id TEXT,
        room_id TEXT,
        request_id TEXT,
        public_url TEXT,
        assignment_json JSONB,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    if (db === prisma) tableReadyPromise = operation;
    return operation;
  }
  return tableReadyPromise;
}

export async function readSpeedbotHelpAssignment(db = prisma) {
  await ensureSpeedbotHelpTable(db);
  const rows = await db.$queryRawUnsafe(
    `SELECT singleton, status, intro_id, room_id, request_id, public_url,
            assignment_json, last_error, created_at, updated_at
       FROM pal_speedbot_help_assignment
      WHERE singleton = 1
      LIMIT 1`,
  );
  return rows?.[0] || null;
}

export function extractPublicAssignmentContext(body) {
  const allowed = new Set([
    "goal",
    "public_details",
    "title",
    "request_title",
    "requester_name",
    "requester_id",
    "agent_name",
    "agent_id",
    "intro_id",
    "introduction_id",
    "room_id",
    "work_room_id",
    "request_id",
    "work_request_id",
    "public_url",
    "request_url",
    "work_url",
  ]);
  const result = {};
  const seen = new Set();

  function visit(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node.slice(0, 20)) visit(item, depth + 1);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (
        allowed.has(key) &&
        typeof value === "string" &&
        value.trim() &&
        result[key] == null
      ) {
        result[key] = value.trim().slice(0, 700);
      }
      visit(value, depth + 1);
    }
  }

  visit(body);
  return result;
}

export function extractPublicAssignment(body) {
  const wanted = {
    introId: new Set(["intro_id", "introduction_id"]),
    roomId: new Set(["room_id", "work_room_id"]),
    requestId: new Set(["request_id", "work_request_id"]),
    responseId: new Set(["response_id", "intro_response_id"]),
    publicUrl: new Set(["public_url", "request_url", "work_url"]),
  };
  const patterns = {
    introId: /^intro_[a-f0-9]{32}$/,
    roomId: /^room_[a-f0-9]{32}$/,
    requestId: /^request_[a-f0-9]{32}$/,
    responseId: /^response_[a-f0-9]{32}$/,
  };
  const result = {
    introId: null,
    roomId: null,
    requestId: null,
    responseId: null,
    publicUrl: null,
  };
  const seen = new Set();

  function considerString(key, raw) {
    const value = String(raw || "").trim();
    if (!value) return;

    for (const [field, keys] of Object.entries(wanted)) {
      if (!result[field] && keys.has(key)) result[field] = value;
    }
    for (const [field, pattern] of Object.entries(patterns)) {
      if (!result[field] && pattern.test(value)) result[field] = value;
    }

    const embedded = {
      introId: value.match(/(?:^|[^a-z0-9_])(intro_[a-f0-9]{32})(?:$|[^a-f0-9])/i)?.[1],
      roomId: value.match(/(?:^|[^a-z0-9_])(room_[a-f0-9]{32})(?:$|[^a-f0-9])/i)?.[1],
      requestId: value.match(/(?:^|[^a-z0-9_])(request_[a-f0-9]{32})(?:$|[^a-f0-9])/i)?.[1],
      responseId: value.match(/(?:^|[^a-z0-9_])(response_[a-f0-9]{32})(?:$|[^a-f0-9])/i)?.[1],
    };
    for (const [field, token] of Object.entries(embedded)) {
      if (!result[field] && token) result[field] = token.toLowerCase();
    }

    if (!result.publicUrl && /^https:\/\/speedbot\.dev\/(?!operator\/)/i.test(value)) {
      result.publicUrl = value;
    }
  }

  function visit(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 8 || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node.slice(0, 50)) visit(item, depth + 1);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string") considerString(key, value);
      visit(value, depth + 1);
    }
  }

  visit(body);
  return result;
}

function collectThreadCandidates(body) {
  const candidates = [];
  const seen = new Set();

  function visit(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 8 || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node.slice(0, 100)) visit(item, depth + 1);
      return;
    }

    const ids = extractPublicAssignment(node);
    if (ids.roomId || ids.introId || ids.responseId) {
      candidates.push({ node, ids });
    }
    for (const value of Object.values(node)) visit(value, depth + 1);
  }

  visit(body);

  const unique = new Map();
  for (const candidate of candidates) {
    const key = candidate.ids.roomId || candidate.ids.responseId || candidate.ids.introId;
    if (key && !unique.has(key)) unique.set(key, candidate);
  }
  return [...unique.values()];
}

export async function recoverSpeedbotHelpThread({
  apiKey,
  fetchImpl = fetch,
  baseUrl = DEFAULT_BASE_URL,
} = {}) {
  const key = String(apiKey || "").trim();
  if (!key) return null;

  const root = cleanBaseUrl(baseUrl);
  const response = await fetchImpl(new URL("/api/intro-responses", root), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      "User-Agent": "PAL-Speedbot-Help/1.0",
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Speedbot intro-response recovery returned HTTP ${response.status}.`);
  }

  const body = await response.json().catch(() => ({}));
  const candidates = collectThreadCandidates(body)
    .filter((candidate) => candidate.ids.roomId || candidate.ids.introId)
    .slice(0, 10);

  if (candidates.length !== 1) {
    return {
      status: candidates.length === 0 ? "none" : "ambiguous",
      candidateCount: candidates.length,
      ids: null,
    };
  }

  return {
    status: "single",
    candidateCount: 1,
    ids: candidates[0].ids,
  };
}

export async function recoverSpeedbotHelpFromWait({
  apiKey,
  fetchImpl = fetch,
  baseUrl = DEFAULT_BASE_URL,
} = {}) {
  const key = String(apiKey || "").trim();
  if (!key) return null;

  const root = cleanBaseUrl(baseUrl);
  const url = new URL("/api/me/wait", root);
  url.searchParams.set("timeout_seconds", "0");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      "User-Agent": "PAL-Speedbot-Help/1.0",
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Speedbot wait recovery returned HTTP ${response.status}.`);
  }

  const body = await response.json().catch(() => ({}));
  const candidates = collectThreadCandidates(body)
    .filter(
      (candidate) =>
        candidate.ids.roomId ||
        candidate.ids.introId ||
        candidate.ids.responseId ||
        candidate.ids.publicUrl,
    )
    .slice(0, 10);

  if (candidates.length !== 1) {
    return {
      status: candidates.length === 0 ? "none" : "ambiguous",
      candidateCount: candidates.length,
      ids: null,
    };
  }

  return {
    status: "single",
    candidateCount: 1,
    ids: candidates[0].ids,
  };
}

export async function recoverSpeedbotHelpFromOperatorInbox({
  operatorLink,
  fetchImpl = fetch,
} = {}) {
  const link = String(operatorLink || "").trim();
  if (!link) return null;

  let inboxUrl;
  try {
    inboxUrl = new URL(link, "https://speedbot.dev");
  } catch {
    return { status: "invalid-link", candidateCount: 0, ids: null };
  }

  const operatorSegments = inboxUrl.pathname.split("/").filter(Boolean);
  if (
    inboxUrl.protocol !== "https:" ||
    inboxUrl.hostname !== "speedbot.dev" ||
    operatorSegments.length !== 2 ||
    operatorSegments[0] !== "operator" ||
    !/^[A-Za-z0-9_-]{10,200}$/.test(operatorSegments[1])
  ) {
    return { status: "invalid-link", candidateCount: 0, ids: null };
  }

  inboxUrl.pathname = inboxUrl.pathname.replace(/\/$/, "") + "/inbox.json";
  inboxUrl.search = "";
  inboxUrl.hash = "";

  const response = await fetchImpl(inboxUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "PAL-Speedbot-Help/1.0",
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Speedbot operator-inbox recovery returned HTTP ${response.status}.`);
  }

  const body = await response.json().catch(() => ({}));
  const candidates = collectThreadCandidates(body)
    .filter(
      (candidate) =>
        candidate.ids.roomId ||
        candidate.ids.introId ||
        candidate.ids.responseId ||
        candidate.ids.publicUrl,
    )
    .slice(0, 10);

  if (candidates.length !== 1) {
    return {
      status: candidates.length === 0 ? "none" : "ambiguous",
      candidateCount: candidates.length,
      ids: null,
    };
  }

  return {
    status: "single",
    candidateCount: 1,
    ids: candidates[0].ids,
  };
}

async function saveAssignment(db, body) {
  const publicFields = extractPublicAssignment(body);
  await ensureSpeedbotHelpTable(db);
  await db.$executeRawUnsafe(
    `INSERT INTO pal_speedbot_help_assignment (
        singleton, status, intro_id, room_id, request_id, public_url,
        assignment_json, last_error, updated_at
      )
      VALUES (1, 'assigned', $1, $2, $3, $4, $5::jsonb, NULL, NOW())
      ON CONFLICT (singleton) DO UPDATE
        SET status = 'assigned',
            intro_id = EXCLUDED.intro_id,
            room_id = EXCLUDED.room_id,
            request_id = EXCLUDED.request_id,
            public_url = EXCLUDED.public_url,
            assignment_json = EXCLUDED.assignment_json,
            last_error = NULL,
            updated_at = NOW()`,
    publicFields.introId,
    publicFields.roomId,
    publicFields.requestId,
    publicFields.publicUrl,
    JSON.stringify(body),
  );
  return publicFields;
}

async function saveNoAssignment(db, message) {
  await ensureSpeedbotHelpTable(db);
  await db.$executeRawUnsafe(
    `INSERT INTO pal_speedbot_help_assignment (
        singleton, status, last_error, updated_at
      )
      VALUES (1, 'none-available', $1, NOW())
      ON CONFLICT (singleton) DO UPDATE
        SET status = CASE
              WHEN pal_speedbot_help_assignment.status = 'assigned'
                THEN pal_speedbot_help_assignment.status
              ELSE 'none-available'
            END,
            last_error = CASE
              WHEN pal_speedbot_help_assignment.status = 'assigned'
                THEN pal_speedbot_help_assignment.last_error
              ELSE EXCLUDED.last_error
            END,
            updated_at = NOW()`,
    String(message || "No eligible Speedbot help assignment is currently available.").slice(0, 1000),
  );
}

async function saveError(db, message) {
  await ensureSpeedbotHelpTable(db);
  await db.$executeRawUnsafe(
    `INSERT INTO pal_speedbot_help_assignment (
        singleton, status, last_error, updated_at
      )
      VALUES (1, 'error', $1, NOW())
      ON CONFLICT (singleton) DO UPDATE
        SET status = CASE
              WHEN pal_speedbot_help_assignment.status = 'assigned'
                THEN pal_speedbot_help_assignment.status
              ELSE 'error'
            END,
            last_error = CASE
              WHEN pal_speedbot_help_assignment.status = 'assigned'
                THEN pal_speedbot_help_assignment.last_error
              ELSE EXCLUDED.last_error
            END,
            updated_at = NOW()`,
    String(message || "Speedbot help assignment failed.").slice(0, 1000),
  );
}

export async function ensureSpeedbotHelpAssignment({
  db = prisma,
  fetchImpl = fetch,
  baseUrl = process.env.SPEEDBOT_BASE_URL || DEFAULT_BASE_URL,
} = {}) {
  const existing = await readSpeedbotHelpAssignment(db);
  const agent = await readSpeedbotRecord(db);
  const apiKey = String(agent?.api_key || "").trim();

  if (existing?.status === "assigned" && existing?.assignment_json) {
    const stored = extractPublicAssignment(existing.assignment_json);
    if (!stored.roomId && !stored.introId && apiKey) {
      try {
        const threadRecovery = await recoverSpeedbotHelpThread({
          apiKey,
          fetchImpl,
          baseUrl,
        });

        if (threadRecovery?.status === "single" && threadRecovery.ids) {
          return {
            status: "assigned",
            created: false,
            ...stored,
            ...threadRecovery.ids,
            recovered: true,
            recoverySource: "intro-responses",
            context: extractPublicAssignmentContext(existing.assignment_json),
          };
        }

        if (threadRecovery?.status === "ambiguous") {
          return {
            status: "assigned",
            created: false,
            ...stored,
            recovered: false,
            recoveryStatus: "ambiguous",
            recoverySource: "intro-responses",
            recoveryCandidateCount: threadRecovery.candidateCount || 0,
            context: extractPublicAssignmentContext(existing.assignment_json),
          };
        }

        const waitRecovery = await recoverSpeedbotHelpFromWait({
          apiKey,
          fetchImpl,
          baseUrl,
        });

        if (waitRecovery?.status === "single" && waitRecovery.ids) {
          return {
            status: "assigned",
            created: false,
            ...stored,
            ...waitRecovery.ids,
            recovered: true,
            recoverySource: "wait",
            context: extractPublicAssignmentContext(existing.assignment_json),
          };
        }

        if (waitRecovery?.status === "ambiguous") {
          return {
            status: "assigned",
            created: false,
            ...stored,
            recovered: false,
            recoveryStatus: "ambiguous",
            recoverySource: "wait",
            recoveryCandidateCount: waitRecovery.candidateCount || 0,
            context: extractPublicAssignmentContext(existing.assignment_json),
          };
        }

        const inboxRecovery = await recoverSpeedbotHelpFromOperatorInbox({
          operatorLink: agent?.operator_link,
          fetchImpl,
        });

        if (inboxRecovery?.status === "single" && inboxRecovery.ids) {
          return {
            status: "assigned",
            created: false,
            ...stored,
            ...inboxRecovery.ids,
            recovered: true,
            recoverySource: "operator-inbox",
            context: extractPublicAssignmentContext(existing.assignment_json),
          };
        }

        return {
          status: "assigned",
          created: false,
          ...stored,
          recovered: false,
          recoveryStatus:
            inboxRecovery?.status || waitRecovery?.status || threadRecovery?.status || "none",
          recoverySource: inboxRecovery
            ? "operator-inbox"
            : waitRecovery
              ? "wait"
              : "intro-responses",
          recoveryCandidateCount:
            inboxRecovery?.candidateCount ||
            waitRecovery?.candidateCount ||
            threadRecovery?.candidateCount ||
            0,
          context: extractPublicAssignmentContext(existing.assignment_json),
        };
      } catch (error) {
        return {
          status: "assigned",
          created: false,
          ...stored,
          recovered: false,
          recoveryStatus: "error",
          recoveryError: String(error?.message || error).slice(0, 300),
          context: extractPublicAssignmentContext(existing.assignment_json),
        };
      }
    }

    return {
      status: "assigned",
      created: false,
      ...stored,
      context: extractPublicAssignmentContext(existing.assignment_json),
    };
  }

  if (!apiKey) {
    return { status: "agent-not-ready", created: false };
  }

  const root = cleanBaseUrl(baseUrl);
  let response;
  try {
    response = await fetchImpl(new URL("/api/work-response-bonus/assign", root), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "PAL-Speedbot-Help/1.0",
      },
      body: "{}",
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    await saveError(db, error?.message);
    throw error;
  }

  const body = await response.json().catch(() => ({}));
  if (response.status === 409) {
    const message = String(body?.message || body?.error || "No eligible assignment is available.");
    await saveNoAssignment(db, message);
    return { status: "none-available", created: false };
  }

  if (!response.ok) {
    const message = `Speedbot help assignment returned HTTP ${response.status}: ${String(
      body?.error || body?.message || "assignment rejected",
    ).slice(0, 300)}`;
    await saveError(db, message);
    throw new Error(message);
  }

  const publicFields = await saveAssignment(db, body);
  return {
    status: "assigned",
    created: true,
    ...publicFields,
    context: extractPublicAssignmentContext(body),
  };
}

export function startSpeedbotHelpAssignment() {
  if (String(process.env.SPEEDBOT_HELP_ENABLED || "true").toLowerCase() === "false") {
    console.log("[pal-speedbot-help] disabled");
    return;
  }

  setTimeout(() => {
    ensureSpeedbotHelpAssignment()
      .then((result) => {
        console.log(
          `[pal-speedbot-help] status=${result.status} created=${Boolean(
            result.created,
          )} intro=${result.introId || "none"} room=${result.roomId || "none"} request=${
            result.requestId || "none"
          } response=${result.responseId || "none"} recovered=${Boolean(
            result.recovered,
          )} recovery=${result.recoveryStatus || "none"} source=${
            result.recoverySource || "none"
          } candidates=${result.recoveryCandidateCount || 0} public=${
            result.publicUrl || "none"
          } context=${JSON.stringify(result.context || {})}`,
        );
      })
      .catch((error) => {
        console.error("[pal-speedbot-help] deferred:", error?.message || error);
      });
  }, 7000).unref();
}
