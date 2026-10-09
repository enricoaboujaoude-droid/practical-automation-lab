import fs from "node:fs";

const REGISTER_URL = "https://agentpaystore.com/custom/api/register";
const PAYMENT_ADDRESS = "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF";
const DEVELOPER_NAME = "Practical Automation Lab";
const DEVELOPER_EMAIL = "enricoaboujaoude@gmail.com";

const offers = [
  {
    name: "PAL Ecommerce Catalog Audit",
    description: "Audit ecommerce catalog records for Merchant Center and AI-shopping readiness, identifiers, prices, links, availability, and feed quality.",
    category: "data",
    endpoint_url: "https://pal-marketplace-fast-api.onrender.com/api/catalog-audit",
    price_per_call: 5
  },
  {
    name: "PAL Catalog Remediation Plan",
    description: "Generate a prioritized remediation plan for ecommerce catalog and product-feed issues with concrete corrective actions.",
    category: "custom",
    endpoint_url: "https://pal-marketplace-fast-api.onrender.com/api/catalog-remediation",
    price_per_call: 15
  },
  {
    name: "PAL GTIN UPC EAN Validator",
    description: "Validate GTIN-8, UPC/GTIN-12, GTIN-13 and GTIN-14 identifiers including checksum correctness for product catalogs.",
    category: "data",
    endpoint_url: "https://pal-marketplace-fast-api.onrender.com/api/gtin-check",
    price_per_call: 3
  },
  {
    name: "PAL Product Feed Diff",
    description: "Compare ecommerce product-feed snapshots and return added, removed and changed commerce fields for automated catalog monitoring.",
    category: "data",
    endpoint_url: "https://pal-marketplace-fast-api.onrender.com/api/feed-diff",
    price_per_call: 8
  }
];

function sanitize(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const {
    api_key,
    apiKey,
    token,
    secret,
    ...safe
  } = body;
  return safe;
}

async function register(offer) {
  const response = await fetch(REGISTER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
      "user-agent": "PAL-Revenue-Publisher/1.1"
    },
    body: JSON.stringify({
      ...offer,
      payment_address: PAYMENT_ADDRESS,
      developer_name: DEVELOPER_NAME,
      developer_email: DEVELOPER_EMAIL
    }),
    signal: AbortSignal.timeout(30000)
  });

  const raw = await response.text();
  let body;
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw: raw.slice(0, 2000) };
  }

  const safeBody = sanitize(body);
  const duplicate =
    response.status === 409 ||
    /already|duplicate|exists/i.test(JSON.stringify(safeBody));

  if (!response.ok && !duplicate) {
    throw new Error(
      `AgentPay Store registration failed for ${offer.name}: HTTP ${response.status} ${JSON.stringify(safeBody).slice(0, 1500)}`
    );
  }

  return {
    ...offer,
    registered: response.ok || duplicate,
    duplicate,
    status: response.status,
    response: safeBody
  };
}

const results = [];
for (const offer of offers) {
  try {
    results.push(await register(offer));
  } catch (error) {
    results.push({
      ...offer,
      registered: false,
      duplicate: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

const successful = results.filter((x) => x.registered).length;
const output = {
  provider: DEVELOPER_NAME,
  marketplace: "AgentPay Store",
  registration_url: REGISTER_URL,
  payment_network: "Base",
  payment_asset: "USDC",
  payment_address: PAYMENT_ADDRESS,
  revenue_share_percent: 82,
  checked_at: new Date().toISOString(),
  successful,
  total: results.length,
  offers: results
};

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync(
  "revenue/agentpaystore-listings.json",
  JSON.stringify(output, null, 2) + "\n"
);

console.log(JSON.stringify(output, null, 2));

if (successful === 0) process.exit(1);
