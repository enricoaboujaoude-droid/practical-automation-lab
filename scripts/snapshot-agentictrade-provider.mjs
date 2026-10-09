import fs from "node:fs";

const BASE = "https://agentictrade.io/api/v1";
const PROVIDER_ID = "e6251fd3-fe50-4d17-9950-2bfd402c1ad7";
const SERVICE_ID = "a370c578-beed-4e04-afd9-bdc6f1da4f79";

async function json(path, options = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  const raw = await res.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw: raw.slice(0, 1000) }; }
  if (!res.ok) throw new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${JSON.stringify(body).slice(0,800)}`);
  return body;
}

const key = await json("/keys", {
  method: "POST",
  body: JSON.stringify({ owner_id: PROVIDER_ID, role: "provider" }),
});

if (!key?.key_id || !key?.secret) throw new Error("provider key creation returned no usable credentials");
const auth = { Authorization: `Bearer ${key.key_id}:${key.secret}` };

const results = {};
for (const [name, path] of [
  ["dashboard", "/provider/dashboard"],
  ["earnings", "/provider/earnings"],
  ["onboarding", "/provider/onboarding"],
  ["health", "/provider/health"],
  ["services", "/provider/services"],
  ["shopify_25_analytics", `/provider/services/${SERVICE_ID}/analytics`],
]) {
  try {
    results[name] = await json(path, { headers: auth });
  } catch (error) {
    results[name] = { error: error instanceof Error ? error.message : String(error) };
  }
}

const safe = {
  checked_at: new Date().toISOString(),
  provider_id: PROVIDER_ID,
  service_id: SERVICE_ID,
  service_title: "PAL Live Shopify Store Commerce Audit",
  price_usdc: 25,
  results,
};

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync("revenue/agentictrade-provider-snapshot.json", JSON.stringify(safe, null, 2) + "\n");
console.log(JSON.stringify({
  checked_at: safe.checked_at,
  provider_id: PROVIDER_ID,
  service_id: SERVICE_ID,
  dashboard: results.dashboard,
  earnings: results.earnings,
  onboarding: results.onboarding,
  shopify_25_analytics: results.shopify_25_analytics
}, null, 2));
