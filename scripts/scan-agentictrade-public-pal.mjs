import fs from "node:fs";

const BASE = "https://agentictrade.io/api/v1";
const PROVIDER_ID = "e6251fd3-fe50-4d17-9950-2bfd402c1ad7";
const PAL_NAME = /\bPAL\b/i;

async function readJson(url) {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "PAL-Public-Revenue-Audit/2.0" },
    signal: AbortSignal.timeout(15000),
  });
  const raw = await res.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; }
  catch { body = { raw: raw.slice(0, 1000) }; }
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}: ${JSON.stringify(body).slice(0, 800)}`);
  return body;
}

const body = await readJson(`${BASE}/services?query=PAL&limit=100`);
const services = Array.isArray(body.services) ? body.services : Array.isArray(body) ? body : [];
const pal = services.filter((s) =>
  String(s.provider_id || s.providerId || "") === PROVIDER_ID ||
  PAL_NAME.test(String(s.name || s.title || ""))
);

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clean = pal.map((s) => ({
  id: s.id || s.service_id || null,
  name: s.name || s.title || null,
  description: s.description || null,
  provider_id: s.provider_id || s.providerId || null,
  endpoint: s.endpoint || s.endpoint_url || null,
  price_per_call: numberOrNull(s.price_per_call ?? s.pricing?.price_per_call ?? s.price),
  currency: s.currency || s.pricing?.currency || null,
  free_tier_calls: numberOrNull(s.free_tier_calls ?? s.free_calls ?? s.pricing?.free_tier_calls),
  total_calls: numberOrNull(s.total_calls ?? s.call_count ?? s.calls ?? s.usage_count),
  paid_calls: numberOrNull(s.paid_calls ?? s.paid_call_count),
  revenue_usd: numberOrNull(s.revenue_usd ?? s.revenue ?? s.total_revenue),
  status: s.status || null,
  health_score: s.health_score ?? s.health?.score ?? null,
  created_at: s.created_at || null,
  updated_at: s.updated_at || null,
}));

const reputations = {};
for (const s of clean) {
  if (!s.id) continue;
  try {
    const url = `${BASE}/services/${encodeURIComponent(s.id)}/reputation?period=all-time`;
    reputations[s.id] = await readJson(url);
  } catch (error) {
    reputations[s.id] = { error: error instanceof Error ? error.message : String(error) };
  }
}

const publicTotals = clean.reduce((acc, s) => {
  if (Number.isFinite(s.total_calls)) acc.total_calls += s.total_calls;
  if (Number.isFinite(s.paid_calls)) acc.paid_calls += s.paid_calls;
  if (Number.isFinite(s.revenue_usd)) acc.revenue_usd += s.revenue_usd;
  return acc;
}, { total_calls: 0, paid_calls: 0, revenue_usd: 0 });

const out = {
  checked_at: new Date().toISOString(),
  mode: "public",
  provider_id: PROVIDER_ID,
  authenticated_metrics_available: false,
  service_count: clean.length,
  public_totals: publicTotals,
  services: clean,
  reputations,
  evidence_note:
    "Revenue is counted only when AgenticTrade exposes an explicit revenue/paid-call field. Missing public fields are null, never inferred from views, ratings, or listing presence.",
};

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync("revenue/agentictrade-public-pal-services.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out, null, 2));
