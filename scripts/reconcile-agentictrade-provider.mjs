import fs from "node:fs";

const BASE = "https://agentictrade.io/api/v1";
const PROVIDER_ID = "e6251fd3-fe50-4d17-9950-2bfd402c1ad7";
const TOKEN = String(process.env.AGENTICTRADE_PROVIDER_TOKEN || "").trim();

async function req(path, { method = "GET", token = "", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "user-agent": "PAL-AgenticTrade-Revenue-Reconciler/2.0",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; }
  catch { payload = { raw: text.slice(0, 1000) }; }
  if (!res.ok) throw new Error(`${method} ${path} HTTP ${res.status}: ${JSON.stringify(payload).slice(0, 600)}`);
  return payload;
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
  const body = await req("/services?query=PAL&limit=100");
  const all = Array.isArray(body.services) ? body.services : Array.isArray(body) ? body : [];
  publicServices = all.filter((s) =>
    String(s.provider_id || s.providerId || "") === PROVIDER_ID ||
    /\bPAL\b/i.test(String(s.name || s.title || ""))
  );
} catch (error) {
  publicError = error instanceof Error ? error.message : String(error);
}

const privateResults = {};
let privateError = null;
if (TOKEN) {
  for (const [name, path] of [
    ["dashboard", "/provider/dashboard"],
    ["services", "/provider/services"],
    ["earnings", "/provider/earnings"],
    ["health", "/provider/health"],
    ["onboarding", "/provider/onboarding"],
  ]) {
    try { privateResults[name] = sanitize(await req(path, { token: TOKEN })); }
    catch (error) { privateResults[name] = { error: error instanceof Error ? error.message : String(error) }; }
  }
} else {
  privateError =
    "No AGENTICTRADE_PROVIDER_TOKEN secret is configured. The reconciler intentionally skipped private endpoints instead of attempting unauthenticated key creation.";
}

const out = {
  checked_at: new Date().toISOString(),
  provider_id: PROVIDER_ID,
  mode: TOKEN ? "authenticated_plus_public" : "public_only",
  authenticated_metrics_available: Boolean(TOKEN),
  authenticated_error: privateError,
  public_error: publicError,
  public_services: sanitize(publicServices),
  private_results: privateResults,
  revenue_accounting_rule:
    "Only explicit paid/revenue metrics or independent settlement evidence count as revenue. Public listing state alone does not.",
};

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync("revenue/agentictrade-provider-revenue.json", JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({
  checked_at: out.checked_at,
  mode: out.mode,
  public_service_count: out.public_services.length,
  authenticated_metrics_available: out.authenticated_metrics_available,
  earnings: out.private_results.earnings ?? null,
  authenticated_error: out.authenticated_error,
}, null, 2));
