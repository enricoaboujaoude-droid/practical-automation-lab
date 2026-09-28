import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_BASE_URL = "https://superteam.fun";
const AGENT_NAME = "Practical Automation Lab";
let tableReadyPromise;

function cleanBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function boundedText(value, max = 500) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

export async function ensureSuperteamTable(db = prisma) {
  if (!tableReadyPromise || db !== prisma) {
    const op = db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS pal_superteam_agent (
        singleton SMALLINT PRIMARY KEY CHECK (singleton = 1),
        status TEXT NOT NULL,
        agent_id TEXT,
        username TEXT,
        api_key TEXT,
        claim_code TEXT,
        listings_json JSONB,
        last_error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    if (db === prisma) tableReadyPromise = op;
    return op;
  }
  return tableReadyPromise;
}

export async function readSuperteamRecord(db = prisma) {
  await ensureSuperteamTable(db);
  const rows = await db.$queryRawUnsafe(
    `SELECT singleton, status, agent_id, username, api_key, claim_code,
            listings_json, last_error, created_at, updated_at
       FROM pal_superteam_agent
      WHERE singleton = 1
      LIMIT 1`,
  );
  return rows?.[0] || null;
}

async function savePending(db = prisma) {
  await ensureSuperteamTable(db);
  const rows = await db.$queryRawUnsafe(
    `INSERT INTO pal_superteam_agent (singleton, status, updated_at)
     VALUES (1, 'pending', NOW())
     ON CONFLICT (singleton) DO UPDATE
       SET status = CASE
             WHEN pal_superteam_agent.api_key IS NULL THEN 'pending'
             ELSE pal_superteam_agent.status
           END,
           last_error = CASE
             WHEN pal_superteam_agent.api_key IS NULL THEN NULL
             ELSE pal_superteam_agent.last_error
           END,
           updated_at = NOW()
     RETURNING api_key`,
  );
  return rows?.[0] || null;
}

async function saveRegistration(db, payload) {
  await ensureSuperteamTable(db);
  await db.$executeRawUnsafe(
    `UPDATE pal_superteam_agent
        SET status = 'registered',
            agent_id = $1,
            username = $2,
            api_key = $3,
            claim_code = $4,
            last_error = NULL,
            updated_at = NOW()
      WHERE singleton = 1`,
    payload.agentId,
    payload.username,
    payload.apiKey,
    payload.claimCode,
  );
}

async function saveListings(db, listings) {
  await ensureSuperteamTable(db);
  await db.$executeRawUnsafe(
    `UPDATE pal_superteam_agent
        SET status = 'ready',
            listings_json = $1::jsonb,
            last_error = NULL,
            updated_at = NOW()
      WHERE singleton = 1`,
    JSON.stringify(listings),
  );
}

async function saveError(db, error) {
  await ensureSuperteamTable(db);
  await db.$executeRawUnsafe(
    `INSERT INTO pal_superteam_agent (singleton, status, last_error, updated_at)
     VALUES (1, 'error', $1, NOW())
     ON CONFLICT (singleton) DO UPDATE
       SET status = CASE
             WHEN pal_superteam_agent.api_key IS NULL THEN 'error'
             ELSE pal_superteam_agent.status
           END,
           last_error = $1,
           updated_at = NOW()`,
    String(error || "Superteam scout failed.").slice(0, 1000),
  );
}

export function normalizeAgentListings(body) {
  const candidates = [
    body?.listings,
    body?.data,
    body?.result,
    body?.items,
    Array.isArray(body) ? body : null,
  ];
  return candidates.find(Array.isArray) || [];
}

export function publicListingSummary(listing) {
  const rewardCandidates = [
    listing?.totalReward,
    listing?.totalRewardUsd,
    listing?.totalPrizes,
    listing?.reward,
    listing?.rewards,
    listing?.compensation,
    listing?.compensationAmount,
    listing?.prize,
  ].filter((value) => value != null);

  return {
    id: boundedText(listing?.id ?? listing?.listingId, 120),
    slug: boundedText(listing?.slug, 180),
    title: boundedText(listing?.title ?? listing?.name, 240),
    type: boundedText(listing?.type ?? listing?.listingType, 80),
    agentAccess: boundedText(listing?.agentAccess, 80),
    deadline: boundedText(
      listing?.deadline ?? listing?.submissionDeadline ?? listing?.deadlineAt,
      100,
    ),
    reward: rewardCandidates.length ? rewardCandidates[0] : null,
    sponsor: boundedText(
      listing?.sponsor?.name ??
        listing?.sponsorName ??
        listing?.poc?.name ??
        listing?.organization?.name,
      180,
    ),
  };
}

async function registerAgent({ fetchImpl, baseUrl }) {
  const response = await fetchImpl(new URL("/api/agents", baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "PAL-Superteam-Scout/1.0",
    },
    body: JSON.stringify({ name: AGENT_NAME }),
    signal: AbortSignal.timeout(12000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Superteam registration returned HTTP ${response.status}: ${String(
        body?.error || body?.message || "registration rejected",
      ).slice(0, 300)}`,
    );
  }

  const agentId = boundedText(body?.agentId ?? body?.agent?.id, 200);
  const username = boundedText(body?.username ?? body?.agent?.username, 200);
  const apiKey = boundedText(body?.apiKey, 1000);
  const claimCode = boundedText(body?.claimCode, 1000);

  if (!agentId || !apiKey || !claimCode) {
    throw new Error("Superteam registration response missed agentId, apiKey or claimCode.");
  }

  return { agentId, username, apiKey, claimCode };
}

export async function fetchAgentListings({
  apiKey,
  fetchImpl = fetch,
  baseUrl = DEFAULT_BASE_URL,
} = {}) {
  const key = String(apiKey || "").trim();
  if (!key) throw new Error("Superteam API key is required.");

  const root = cleanBaseUrl(baseUrl);
  const url = new URL("/api/agents/listings/live", root);
  url.searchParams.set("take", "20");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      "User-Agent": "PAL-Superteam-Scout/1.0",
    },
    signal: AbortSignal.timeout(12000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Superteam listings returned HTTP ${response.status}: ${String(
        body?.error || body?.message || "listing request rejected",
      ).slice(0, 300)}`,
    );
  }

  return normalizeAgentListings(body);
}

export async function runSuperteamScout({
  db = prisma,
  fetchImpl = fetch,
  baseUrl = process.env.SUPERTEAM_BASE_URL || DEFAULT_BASE_URL,
} = {}) {
  const root = cleanBaseUrl(baseUrl);
  let record = await readSuperteamRecord(db);

  if (!record?.api_key) {
    await savePending(db);
    try {
      const registration = await registerAgent({ fetchImpl, baseUrl: root });
      await saveRegistration(db, registration);
      record = await readSuperteamRecord(db);
    } catch (error) {
      await saveError(db, error?.message);
      throw error;
    }
  }

  const apiKey = String(record?.api_key || "").trim();
  if (!apiKey) throw new Error("Superteam registration did not persist an API key.");

  try {
    const listings = await fetchAgentListings({
      apiKey,
      fetchImpl,
      baseUrl: root,
    });
    await saveListings(db, listings);

    return {
      status: "ready",
      agentId: record?.agent_id || null,
      username: record?.username || null,
      count: listings.length,
      listings: listings.map(publicListingSummary),
    };
  } catch (error) {
    await saveError(db, error?.message);
    throw error;
  }
}

export function startSuperteamScout() {
  if (
    String(process.env.SUPERTEAM_SCOUT_ENABLED || "true").toLowerCase() ===
    "false"
  ) {
    console.log("[pal-superteam] scout disabled");
    return;
  }

  setTimeout(() => {
    runSuperteamScout()
      .then((result) => {
        console.log(
          `[pal-superteam] status=${result.status} agent=${
            result.agentId || "none"
          } username=${result.username || "none"} count=${
            result.count
          } listings=${JSON.stringify(result.listings)}`,
        );
      })
      .catch((error) => {
        console.error("[pal-superteam] scout deferred:", error?.message || error);
      });
  }, 9000).unref();
}
