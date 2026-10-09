import fs from "node:fs";

const BASE = "https://agentictrade.io/api/v1";
const PROVIDER_ID = "e6251fd3-fe50-4d17-9950-2bfd402c1ad7";
const TOKEN = String(process.env.AGENTICTRADE_PROVIDER_TOKEN || "").trim();

async function json(path, { token = "", ...options } = {}) {
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  const raw = await res.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; }
  catch { body = { raw: raw.slice(0, 1000) }; }
  if (!res.ok) throw new Error(`${options.method || "GET"} ${path} -> ${res.status}: ${JSON.stringify(body).slice(0, 800)}`);
  return body;
}

const sanitize = (value) => {
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
};

let publicServices = [];
let publicError = null;
try {
  const body = await json("/services?query=PAL&limit=100");
  const all = Array.isArray(body.services) ? body.services : Array.isArray(body) ? body : [];
  publicServices = all.filter((s) =>
    String(s.provider_id || s.providerId || "") === PROVIDER_ID ||
    /\bPAL\b/i.test(String(s.name || s.title || ""))
  );
} catch (error) {
  publicError = error instanceof Error ? error.message : String(error);
}

const results = {};
let authenticatedMetricsAvailable = false;
let authenticatedError = null;

if (TOKEN) {
  authenticatedMetricsAvailable = true;
  for (const [name, path] of [
    ["dashboard", "/provider/dashboard"],
    ["earnings", "/provider/earnings"],
    ["onboarding", "/provider/onboarding"],
    ["health", "/provider/health"],
    ["services", "/provider/services"],
  ]) {
    try {
      results[name] = sanitize(await json(path, { token: TOKEN }));
    } catch (error) {
      results[name] = { error: error instanceof Error ? error.message : String(error) };
    }
  }
} else {
  authenticatedError =
    "AGENTICTRADE_PROVIDER_TOKEN is not configured; provider-private metrics were not queried. Public evidence was still captured.";
}

const out = {
  checked_at: new Date().toISOString(),
  provider_id: PROVIDER_ID,
  mode: TOKEN ? "authenticated_plus_public" : "public_only",
  authenticated_metrics_available: authenticatedMetricsAvailable,
  authenticated_error: authenticatedError,
  public_error: publicError,
  public_services: sanitize(publicServices),
  private_results: results,
  revenue_accounting_rule:
    "Do not infer revenue from listing presence, ratings, calls without an explicit paid field, or test traffic. Count only explicit paid/revenue metrics or independently settled receipts.",
};

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync("revenue/agentictrade-provider-snapshot.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({
  checked_at: out.checked_at,
  provider_id: PROVIDER_ID,
  mode: out.mode,
  authenticated_metrics_available: out.authenticated_metrics_available,
  public_service_count: out.public_services.length,
  authenticated_error: out.authenticated_error,
  earnings: out.private_results.earnings ?? null,
}, null, 2));
