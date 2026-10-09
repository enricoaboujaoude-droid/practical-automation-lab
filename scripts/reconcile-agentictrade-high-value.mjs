import fs from "node:fs";

const BASE = "https://agentictrade.io/api/v1";
const TARGETS = [
  {
    service_id: "85762eec-1b47-41b7-afe4-601de8bd1b29",
    provider_id: "agent_88ea32935b5d",
    name: "PAL Paid Full Catalog Remediation",
    price_usdc: 20
  },
  {
    service_id: "a370c578-beed-4e04-afd9-bdc6f1da4f79",
    provider_id: "agent_1189d194ec4c",
    name: "PAL Live Shopify Store Commerce Audit",
    price_usdc: 25
  },
  {
    service_id: "9ca1ac6b-ff8d-4ef2-945f-8c1c7aa31ba9",
    provider_id: "agent_0f36c868bd90",
    name: "PAL Agent Commerce Launch Kit",
    price_usdc: 99
  },
  {
    service_id: "3f06bc02-ce96-40b9-98d8-091f82f580dd",
    provider_id: "agent_427825c9decb",
    name: "PAL Agent Commerce Go-Live",
    price_usdc: 100
  }
];

async function json(path, { method = "GET", token = "", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000)
  });
  const raw = await res.text();
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; }
  catch { payload = { raw: raw.slice(0, 1000) }; }
  if (!res.ok) {
    throw new Error(`${method} ${path} HTTP ${res.status}: ${JSON.stringify(payload).slice(0, 700)}`);
  }
  return payload;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/secret|api.?key|token|authorization|password/i.test(k)) continue;
      out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}

const results = [];
for (const target of TARGETS) {
  const result = { ...target, checked_at: new Date().toISOString() };
  try {
    const key = await json("/keys", {
      method: "POST",
      body: { owner_id: target.provider_id, role: "provider" }
    });
    const keyId = String(key.key_id || "");
    const secret = String(key.secret || "");
    if (!keyId || !secret) throw new Error("provider key bootstrap returned incomplete credentials");
    const token = `${keyId}:${secret}`;

    const [dashboard, earnings, analytics, health, onboarding] = await Promise.all([
      json("/provider/dashboard", { token }),
      json("/provider/earnings", { token }),
      json(`/provider/services/${target.service_id}/analytics`, { token }),
      json("/provider/health", { token }),
      json("/provider/onboarding", { token })
    ]);

    result.ok = true;
    result.dashboard = sanitize(dashboard);
    result.earnings = sanitize(earnings);
    result.analytics = sanitize(analytics);
    result.health = sanitize(health);
    result.onboarding = sanitize(onboarding);
  } catch (error) {
    result.ok = false;
    result.error = error instanceof Error ? error.message : String(error);
  }
  results.push(result);
}

const extractNumber = (obj, keys) => {
  for (const key of keys) {
    const parts = key.split(".");
    let cur = obj;
    for (const p of parts) cur = cur?.[p];
    const n = Number(cur);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

const summary = results.map((r) => ({
  service_id: r.service_id,
  name: r.name,
  price_usdc: r.price_usdc,
  ok: r.ok,
  total_calls: extractNumber(r, [
    "analytics.total_calls", "analytics.totalCalls", "dashboard.total_calls", "dashboard.totalCalls"
  ]),
  revenue_usdc: extractNumber(r, [
    "analytics.revenue", "analytics.revenue_usdc", "analytics.total_revenue",
    "earnings.total_earnings", "earnings.total", "dashboard.revenue", "dashboard.total_revenue"
  ]),
  pending_usdc: extractNumber(r, [
    "earnings.pending", "earnings.pending_amount", "earnings.pending_earnings"
  ]),
  settled_usdc: extractNumber(r, [
    "earnings.settled", "earnings.settled_amount", "earnings.paid", "earnings.paid_amount"
  ]),
  error: r.error || null
}));

const out = {
  checked_at: new Date().toISOString(),
  services: results,
  summary
};
fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync("revenue/agentictrade-high-value-revenue.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ checked_at: out.checked_at, summary }, null, 2));
