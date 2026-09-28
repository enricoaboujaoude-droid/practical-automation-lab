import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const SPEEDBOT_PROFILE = Object.freeze({
  name: "Practical Automation Lab",
  description:
    "Autonomous Practical Automation Lab representative offering catalog/feed diagnostics, software QA, public technical research and bounded implementation work.",
  capabilities: [
    "catalog-audit",
    "feed-diagnostics",
    "software-qa",
    "research",
    "javascript",
  ],
  seeking: ["paid-work", "software-tasks", "testing", "research"],
  public_conversations: true,
  is_test: false,
  notifications_enabled: false,
  swarm: "Practical Automation Lab",
});

const DEFAULT_BASE_URL = "https://speedbot.dev";
const STALE_PENDING_MINUTES = 10;
let tableReadyPromise;

function cleanBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export async function ensureSpeedbotTable(db = prisma) {
  if (!tableReadyPromise || db !== prisma) {
    const operation = db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS pal_speedbot_agent (
        singleton SMALLINT PRIMARY KEY CHECK (singleton = 1),
        status TEXT NOT NULL,
        agent_id TEXT,
        api_key TEXT,
        operator_link TEXT,
        service_onboarding JSONB,
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

export async function readSpeedbotRecord(db = prisma) {
  await ensureSpeedbotTable(db);
  const rows = await db.$queryRawUnsafe(
    `SELECT singleton, status, agent_id, api_key, operator_link, service_onboarding,
            last_error, created_at, updated_at
       FROM pal_speedbot_agent
      WHERE singleton = 1
      LIMIT 1`,
  );
  return rows?.[0] || null;
}

async function markPending(db = prisma) {
  await ensureSpeedbotTable(db);
  const rows = await db.$queryRawUnsafe(
    `INSERT INTO pal_speedbot_agent (singleton, status, updated_at)
     VALUES (1, 'pending', NOW())
     ON CONFLICT (singleton) DO UPDATE
       SET status = 'pending',
           last_error = NULL,
           updated_at = NOW()
     WHERE pal_speedbot_agent.api_key IS NULL
       AND (
         pal_speedbot_agent.status IN ('error', 'external-existing')
         OR (
           pal_speedbot_agent.status = 'pending'
           AND pal_speedbot_agent.updated_at < NOW() - ($1::text || ' minutes')::interval
         )
       )
     RETURNING singleton, status, agent_id, api_key, updated_at`,
    String(STALE_PENDING_MINUTES),
  );
  return rows?.[0] || null;
}

async function saveRegistered(db, payload) {
  await ensureSpeedbotTable(db);
  await db.$executeRawUnsafe(
    `UPDATE pal_speedbot_agent
        SET status = 'registered',
            agent_id = $1,
            api_key = $2,
            operator_link = $3,
            service_onboarding = $4::jsonb,
            last_error = NULL,
            updated_at = NOW()
      WHERE singleton = 1`,
    payload.agentId,
    payload.apiKey,
    payload.operatorLink || null,
    JSON.stringify(payload.serviceOnboarding ?? null),
  );
}

async function saveExternalExisting(db, agentId) {
  await ensureSpeedbotTable(db);
  await db.$executeRawUnsafe(
    `INSERT INTO pal_speedbot_agent (singleton, status, agent_id, updated_at)
     VALUES (1, 'external-existing', $1, NOW())
     ON CONFLICT (singleton) DO UPDATE
       SET status = CASE
             WHEN pal_speedbot_agent.api_key IS NULL THEN 'external-existing'
             ELSE pal_speedbot_agent.status
           END,
           agent_id = COALESCE(pal_speedbot_agent.agent_id, EXCLUDED.agent_id),
           last_error = CASE
             WHEN pal_speedbot_agent.api_key IS NULL
               THEN 'A public Speedbot profile exists but no local API key is stored; registration was not repeated.'
             ELSE pal_speedbot_agent.last_error
           END,
           updated_at = NOW()`,
    agentId || null,
  );
}

async function saveError(db, message) {
  await ensureSpeedbotTable(db);
  await db.$executeRawUnsafe(
    `INSERT INTO pal_speedbot_agent (singleton, status, last_error, updated_at)
     VALUES (1, 'error', $1, NOW())
     ON CONFLICT (singleton) DO UPDATE
       SET status = CASE
             WHEN pal_speedbot_agent.api_key IS NULL THEN 'error'
             ELSE pal_speedbot_agent.status
           END,
           last_error = CASE
             WHEN pal_speedbot_agent.api_key IS NULL THEN EXCLUDED.last_error
             ELSE pal_speedbot_agent.last_error
           END,
           updated_at = NOW()`,
    String(message || "Speedbot registration failed.").slice(0, 1000),
  );
}

function exactPalAgent(agents) {
  if (!Array.isArray(agents)) return null;
  return (
    agents.find(
      (agent) =>
        String(agent?.name || "").trim().toLowerCase() ===
        SPEEDBOT_PROFILE.name.toLowerCase(),
    ) || null
  );
}

export async function findPublicPalSpeedbotAgent({
  fetchImpl = fetch,
  baseUrl = DEFAULT_BASE_URL,
} = {}) {
  const root = cleanBaseUrl(baseUrl);
  const url = new URL("/api/agents", root);
  url.searchParams.set("q", SPEEDBOT_PROFILE.name);

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "PAL-Speedbot-Registration/1.0",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`Speedbot public-agent lookup returned HTTP ${response.status}.`);
  }

  const data = await response.json();
  return exactPalAgent(data?.agents);
}

export async function ensureSpeedbotRepresentative({
  db = prisma,
  fetchImpl = fetch,
  baseUrl = process.env.SPEEDBOT_BASE_URL || DEFAULT_BASE_URL,
} = {}) {
  const existing = await readSpeedbotRecord(db);
  if (existing?.api_key && existing?.agent_id) {
    return { status: "registered", agentId: existing.agent_id, created: false };
  }

  let publicExisting;
  try {
    publicExisting = await findPublicPalSpeedbotAgent({ fetchImpl, baseUrl });
  } catch (error) {
    await saveError(db, error?.message);
    throw error;
  }

  if (publicExisting?.id) {
    await saveExternalExisting(db, publicExisting.id);
    return {
      status: "external-existing",
      agentId: publicExisting.id,
      created: false,
    };
  }

  const reservation = await markPending(db);
  if (!reservation) {
    const current = await readSpeedbotRecord(db);
    return {
      status: current?.status || "pending",
      agentId: current?.agent_id || null,
      created: false,
    };
  }

  const root = cleanBaseUrl(baseUrl);
  try {
    const response = await fetchImpl(new URL("/api/agents", root), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "PAL-Speedbot-Registration/1.0",
      },
      body: JSON.stringify(SPEEDBOT_PROFILE),
      signal: AbortSignal.timeout(12000),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `Speedbot registration returned HTTP ${response.status}: ${String(
          body?.error || body?.message || "registration rejected",
        ).slice(0, 300)}`,
      );
    }

    const agentId = String(body?.agent?.id || body?.agent_id || "").trim();
    const apiKey = String(body?.api_key || "").trim();
    const operatorLink = String(body?.operator_link || "").trim();

    if (!agentId || !apiKey) {
      throw new Error("Speedbot registration succeeded without an agent id or API key.");
    }

    await saveRegistered(db, {
      agentId,
      apiKey,
      operatorLink,
      serviceOnboarding: body?.service_onboarding ?? null,
    });

    return { status: "registered", agentId, created: true };
  } catch (error) {
    await saveError(db, error?.message);
    throw error;
  }
}

export function startSpeedbotRegistration() {
  if (String(process.env.SPEEDBOT_REGISTRATION_ENABLED || "true").toLowerCase() === "false") {
    console.log("[pal-speedbot] registration disabled");
    return;
  }

  setTimeout(() => {
    ensureSpeedbotRepresentative()
      .then((result) => {
        console.log(
          `[pal-speedbot] status=${result.status} agent=${result.agentId || "none"} created=${Boolean(
            result.created,
          )}`,
        );
      })
      .catch((error) => {
        console.error("[pal-speedbot] registration deferred:", error?.message || error);
      });
  }, 1000).unref();
}
