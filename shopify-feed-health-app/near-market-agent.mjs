const DEFAULT_BASE_URL = "https://market.near.ai";
const DEFAULT_MIN_USD = "5.00";
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 60 * 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;

const KNOWN_SAFE_PROPOSALS = new Map([
  [
    "1725b126-c552-4eb5-b640-de55fe5cb07d",
    "I can deliver the requested deterministic Sentinel-style capability audit as JSON only: AST/change facts, unmentioned network/process capabilities, risk findings, gate status, and file/line evidence. I will not modify or execute the target artifact.",
  ],
  [
    "1652585a-ed2a-428b-8f66-4c20dabbcf6a",
    "I can perform the independent safety evaluation exactly within the stated observer role and return structured JSON covering actual changes, new capabilities, security/constraint findings, decision, evidence, and confidence. No optimization or artifact modification.",
  ],
]);

const SPEND_RISK =
  /\b(book|booking|buy|purchase|order|checkout|hotel|flight|train ticket|uber|do not bid|deposit|stake|gas fee|membership)\b/i;

function cleanBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function safeText(value, max = 500) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : null;
}

function normalizeDecimal(value, fallback = DEFAULT_MIN_USD) {
  const text = String(value ?? fallback).trim();
  if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(text)) return fallback;
  return Number(text) >= 0 ? text : fallback;
}

export function parseNearMarketAutoBidJobIds(
  value = process.env.NEAR_MARKET_AUTO_BID_JOB_IDS,
) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function resolveNearMarketIntervalMs(
  value = process.env.NEAR_MARKET_SCOUT_INTERVAL_MS,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_INTERVAL_MS;
  return Math.min(
    MAX_INTERVAL_MS,
    Math.max(MIN_INTERVAL_MS, Math.floor(parsed)),
  );
}

export function publicNearMarketJobSummary(job) {
  return {
    id: safeText(job?.jobId || job?.job_id || job?.id, 160),
    title: safeText(job?.title, 180),
    description: safeText(job?.description, 500),
    budgetAmount: safeText(
      job?.budgetAmount ?? job?.budget_amount ?? job?.budget,
      40,
    ),
    budgetToken: safeText(
      job?.budgetToken ?? job?.budget_token ?? job?.currency,
      20,
    ),
    status: safeText(job?.status, 40),
    tags: Array.isArray(job?.tags)
      ? job.tags.map((tag) => safeText(tag, 60)).filter(Boolean).slice(0, 12)
      : [],
    createdAt: safeText(job?.createdAt ?? job?.created_at, 100),
  };
}

function budgetNumber(job) {
  const raw =
    job?.budgetAmount ?? job?.budget_amount ?? job?.budget ?? job?.amount;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function jobIdOf(job) {
  return safeText(job?.jobId || job?.job_id || job?.id, 160);
}

function combinedJobText(job) {
  return [
    job?.title,
    job?.description,
    ...(Array.isArray(job?.tags) ? job.tags : []),
  ]
    .filter(Boolean)
    .join(" ");
}

export function selectNearMarketPaidJobs(
  jobs,
  {
    minUsd = DEFAULT_MIN_USD,
    autoBidJobIds = parseNearMarketAutoBidJobIds(),
  } = {},
) {
  if (!Array.isArray(jobs)) return [];
  const minimum = Number(normalizeDecimal(minUsd));
  const allowed =
    autoBidJobIds instanceof Set ? autoBidJobIds : new Set(autoBidJobIds || []);

  return jobs
    .filter((job) => {
      const id = jobIdOf(job);
      if (!id || !allowed.has(id)) return false;
      if (String(job?.status || "").toLowerCase() !== "open") return false;

      const budget = budgetNumber(job);
      if (budget === null || budget < minimum) return false;

      if (!KNOWN_SAFE_PROPOSALS.has(id)) return false;
      if (SPEND_RISK.test(combinedJobText(job))) return false;

      return true;
    })
    .map(publicNearMarketJobSummary);
}

function listFromPayload(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function bidJobId(bid) {
  return safeText(
    bid?.jobId ||
      bid?.job_id ||
      bid?.job?.jobId ||
      bid?.job?.job_id ||
      bid?.job?.id,
    160,
  );
}

async function jsonRequest(
  url,
  {
    fetchImpl = fetch,
    token,
    method = "GET",
    body,
    timeoutMs = 15000,
  } = {},
) {
  const headers = {
    Accept: "application/json",
    "User-Agent": "PAL-NEAR-Market-Agent/1.0",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetchImpl(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const detail = safeText(
      payload?.error || payload?.message || "request rejected",
      300,
    );
    throw new Error(`NEAR Agent Market HTTP ${response.status}: ${detail}`);
  }

  return payload;
}

export async function fetchNearMarketJobBoard({
  fetchImpl = fetch,
  token = process.env.NEAR_MARKET_AGENT_TOKEN,
  baseUrl = process.env.NEAR_MARKET_BASE_URL || DEFAULT_BASE_URL,
} = {}) {
  if (!token) throw new Error("NEAR_MARKET_AGENT_TOKEN is not configured.");

  const url = new URL("/v1/jobs/board", cleanBaseUrl(baseUrl));
  url.searchParams.set("sort", "budget");
  url.searchParams.set("limit", "100");

  const payload = await jsonRequest(url, { fetchImpl, token });
  return listFromPayload(payload, "jobs");
}

export async function fetchNearMarketBids({
  fetchImpl = fetch,
  token = process.env.NEAR_MARKET_AGENT_TOKEN,
  baseUrl = process.env.NEAR_MARKET_BASE_URL || DEFAULT_BASE_URL,
} = {}) {
  if (!token) throw new Error("NEAR_MARKET_AGENT_TOKEN is not configured.");

  const url = new URL("/v1/agents/me/bids", cleanBaseUrl(baseUrl));
  const payload = await jsonRequest(url, { fetchImpl, token });
  return listFromPayload(payload, "bids");
}

export async function placeNearMarketBid(
  jobId,
  {
    fetchImpl = fetch,
    token = process.env.NEAR_MARKET_AGENT_TOKEN,
    baseUrl = process.env.NEAR_MARKET_BASE_URL || DEFAULT_BASE_URL,
    amount,
    proposal,
  } = {},
) {
  if (!token) throw new Error("NEAR_MARKET_AGENT_TOKEN is not configured.");
  if (!jobId) throw new Error("jobId is required.");
  if (!proposal) throw new Error("proposal is required.");

  const url = new URL(
    `/v1/jobs/${encodeURIComponent(jobId)}/bids`,
    cleanBaseUrl(baseUrl),
  );

  return jsonRequest(url, {
    fetchImpl,
    token,
    method: "POST",
    body: {
      amount: normalizeDecimal(amount, DEFAULT_MIN_USD),
      proposal,
    },
  });
}

export async function runNearMarketAgent({
  fetchImpl = fetch,
  token = process.env.NEAR_MARKET_AGENT_TOKEN,
  baseUrl = process.env.NEAR_MARKET_BASE_URL || DEFAULT_BASE_URL,
  minUsd = process.env.NEAR_MARKET_MIN_USD || DEFAULT_MIN_USD,
  autoBidJobIds = parseNearMarketAutoBidJobIds(),
  autoBidEnabled = String(
    process.env.NEAR_MARKET_AUTO_BID_ENABLED || "false",
  ).toLowerCase() === "true",
} = {}) {
  if (!token) {
    return {
      status: "deferred",
      reason: "missing_agent_token",
      candidates: [],
      bids: [],
    };
  }

  const jobs = await fetchNearMarketJobBoard({ fetchImpl, token, baseUrl });
  const candidates = selectNearMarketPaidJobs(jobs, {
    minUsd,
    autoBidJobIds,
  });

  if (!autoBidEnabled || candidates.length === 0) {
    return {
      status: "ready",
      autoBidEnabled,
      candidates,
      bids: [],
    };
  }

  const existingBids = await fetchNearMarketBids({
    fetchImpl,
    token,
    baseUrl,
  });
  const alreadyBid = new Set(existingBids.map(bidJobId).filter(Boolean));
  const bids = [];

  for (const job of candidates) {
    if (alreadyBid.has(job.id)) {
      bids.push({
        jobId: job.id,
        title: job.title,
        amount: job.budgetAmount,
        status: "already_bid",
      });
      continue;
    }

    const proposal = KNOWN_SAFE_PROPOSALS.get(job.id);
    if (!proposal) {
      bids.push({
        jobId: job.id,
        title: job.title,
        amount: job.budgetAmount,
        status: "skipped_no_approved_proposal",
      });
      continue;
    }

    try {
      const result = await placeNearMarketBid(job.id, {
        fetchImpl,
        token,
        baseUrl,
        amount: job.budgetAmount,
        proposal,
      });

      bids.push({
        jobId: job.id,
        title: job.title,
        amount: job.budgetAmount,
        status: "submitted",
        bidId: safeText(result?.bidId || result?.bid_id || result?.id, 160),
      });
      alreadyBid.add(job.id);
    } catch (error) {
      bids.push({
        jobId: job.id,
        title: job.title,
        amount: job.budgetAmount,
        status: "error",
        error: safeText(error?.message || error, 300),
      });
    }
  }

  return {
    status: "ready",
    autoBidEnabled,
    candidates,
    bids,
  };
}

export function startNearMarketAgent() {
  if (
    String(process.env.NEAR_MARKET_SCOUT_ENABLED || "true").toLowerCase() ===
    "false"
  ) {
    console.log("[pal-near-market] agent disabled");
    return;
  }

  const intervalMs = resolveNearMarketIntervalMs();

  const run = () => {
    runNearMarketAgent()
      .then((result) => {
        console.log(
          `[pal-near-market] status=${result.status} autoBid=${
            result.autoBidEnabled === true
          } candidates=${JSON.stringify(
            result.candidates || [],
          )} bids=${JSON.stringify(result.bids || [])}`,
        );
      })
      .catch((error) => {
        console.error(
          "[pal-near-market] agent deferred:",
          error?.message || error,
        );
      })
      .finally(() => {
        const next = setTimeout(run, intervalMs);
        next.unref?.();
      });
  };

  const initial = setTimeout(run, 20000);
  initial.unref?.();
}
