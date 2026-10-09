import fs from "node:fs";

const endpoint = "https://pal-marketplace-fast-api.onrender.com/api/shopify-store-audit";
const payload = {
  name: "PAL Live Shopify Store Commerce Audit",
  description: "Deep public Shopify storefront audit across up to 250 products/variants for AI-shopping/AIEO readiness, identifier gaps, catalog structure, and prioritized Merchant Center remediation. POST JSON: {url: \"https://store.example\"}.",
  category: "data",
  endpoint_url: endpoint,
  price_per_call: 25,
  payment_address: "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF",
  developer_name: "Practical Automation Lab",
  developer_email: "enricoaboujaoude@gmail.com"
};

const response = await fetch("https://agentpaystore.com/custom/api/register", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "accept": "application/json",
    "user-agent": "PAL-Revenue-Publisher/2.0"
  },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(30000)
});
const raw = await response.text();
let body;
try { body = raw ? JSON.parse(raw) : {}; } catch { body = {raw: raw.slice(0,2000)}; }

const duplicate = response.status === 409 || /already|duplicate|exists/i.test(JSON.stringify(body));
if (!response.ok && !duplicate) {
  throw new Error(`AgentStore $25 registration failed HTTP ${response.status}: ${JSON.stringify(body).slice(0,1500)}`);
}

const safeBody = {...body};
for (const key of ["api_key","apiKey","token","secret"]) delete safeBody[key];

const out = {
  marketplace: "AgentStore",
  provider: "Practical Automation Lab",
  registered_at: new Date().toISOString(),
  status_code: response.status,
  registered: response.ok || duplicate,
  duplicate,
  endpoint_url: endpoint,
  price_per_call_usdc: 25,
  payout_network: "Base",
  payout_asset: "USDC",
  payout_address: payload.payment_address,
  response: safeBody
};

fs.mkdirSync("revenue",{recursive:true});
fs.writeFileSync("revenue/agentpaystore-shopify-25.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(out,null,2));
