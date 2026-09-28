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

export function extractPublicAssignment(body) {
  const wanted = {
    introId: new Set(["intro_id", "introduction_id"]),
    roomId: new Set(["room_id", "work_room_id"]),
    requestId: new Set(["request_id", "work_request_id"]),
    publicUrl: new Set(["public_url", "request_url", "work_url"]),
  };
  const result = {
    introId: null,
    roomId: null,
    requestId: null,
    publicUrl: null,
  };
  const seen = new Set();

  function visit(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node.slice(0, 20)) visit(item, depth + 1);
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string" && value.trim()) {
        for (const [field, keys] of Object.entries(wanted)) {
          if (!result[field] && keys.has(key)) result[field] = value.trim();
        }
        if (!result.publicUrl && key === "url" && /^https:\/\/speedbot\.dev\//i.test(value.trim())) {
          result.publicUrl = value.trim();
        }
      }
      visit(value, depth + 1);
    }
  }

  visit(body);
  return result;
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
  if (existing?.status === "assigned" && existing?.assignment_json) {
    return {
      status: "assigned",
      created: false,
      ...extractPublicAssignment(existing.assignment_json),
    };
  }

  const agent = await readSpeedbotRecord(db);
  const apiKey = String(agent?.api_key || "").trim();
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
          }`,
        );
      })
      .catch((error) => {
        console.error("[pal-speedbot-help] deferred:", error?.message || error);
      });
  }, 7000).unref();
}
