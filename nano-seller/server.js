import express from "express";
import { facilitator } from "@payai/facilitator";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const PORT = Number(process.env.PORT || 10000);
const PRICE_RAW = process.env.PRICE_RAW || "10000000000000000000000000000";
const PRICE_NANO = "0.01";
const VERIFY_BASE = process.env.NANO_VERIFY_BASE || "https://pursekeeper.dev/v1/verify";
const PAY_TO = String(process.env.NANO_ADDRESS || "").trim();
const BASE_PAYOUT_ADDRESS = String(process.env.PAL_BASE_PAYOUT_ADDRESS || "").trim();
const PAYANAGENT_BOOTSTRAP = process.env.PAYANAGENT_BOOTSTRAP === "1";
const PAYANAGENT_BASE = "https://payanagent.com";
const PUBLIC_BASE_URL = String(
  process.env.PUBLIC_BASE_URL || "https://pal-nano-catalog-audit.onrender.com"
).replace(/\/$/, "");
const PAYANAGENT_OFFER_TITLE = "PAL Catalog Feed Identifier Audit";
const PAYANAGENT_OFFER_ENDPOINT = `${PUBLIC_BASE_URL}/v1/payanagent/catalog-audit`;
const X402_NETWORK = "eip155:8453";
const X402_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const X402_PRICE_USD = "$0.01";
const X402_PRICE_ATOMIC = "10000";
const X402_FACILITATOR_URL = String(
  process.env.X402_FACILITATOR_URL || "https://facilitator.payai.network"
).replace(/\/$/, "");
const X402_AUDIT_PATH = "/v1/usdc/catalog-audit";
const X402_GTIN_PATH = "/v1/usdc/gtin-check";
const X402_FEED_DIFF_PATH = "/v1/usdc/feed-diff";
const X402_VALIDATE_PATH = "/v1/usdc/x402-validate";
const X402_VALIDATE_PRICE_USD = "$0.05";
const X402_VALIDATE_PRICE_ATOMIC = "50000";
const X402_AUDIT_URL = `${PUBLIC_BASE_URL}${X402_AUDIT_PATH}`;
const X402_GTIN_URL = `${PUBLIC_BASE_URL}${X402_GTIN_PATH}`;
const X402_FEED_DIFF_URL = `${PUBLIC_BASE_URL}${X402_FEED_DIFF_PATH}`;
const X402_VALIDATE_URL = `${PUBLIC_BASE_URL}${X402_VALIDATE_PATH}`;
const AGENT402_BOOTSTRAP = process.env.AGENT402_BOOTSTRAP === "1";
const AGENT402_REGISTER_URL = "https://agent402.tools/api/index/register";
const INDEX402_BOOTSTRAP = process.env.INDEX402_BOOTSTRAP === "1";
const INDEX402_REGISTER_URL = "https://402index.io/api/v1/register";
const INDEX402_CLAIM_BOOTSTRAP = process.env.INDEX402_CLAIM_BOOTSTRAP === "1";
const INDEX402_CLAIM_URL = "https://402index.io/api/v1/claim";
const INDEX402_CLAIM_VERIFY_URL = "https://402index.io/api/v1/claim/verify";
const INDEX402_SERVICE_ID = "760dafd0-10d1-4db9-9688-efbd184cb46f";
const INDEX402_DOMAIN = "pal-nano-catalog-audit.onrender.com";
const X402SCOUT_BOOTSTRAP = process.env.X402SCOUT_BOOTSTRAP === "1";
const X402SCOUT_REGISTER_URL = "https://x402scout.com/register";
const AGENTTOOLS_BOOTSTRAP = process.env.AGENTTOOLS_BOOTSTRAP === "1";
const AGENTTOOLS_REGISTER_URL = "https://agent-tools.cloud/api/v1/submit";
const OPENDEXTER_AUDITION_BOOTSTRAP = process.env.OPENDEXTER_AUDITION_BOOTSTRAP === "1";
const OPENDEXTER_AUDITION_URL = "https://x402.dexter.cash/api/public/discoverable";
const TRUE402_BOOTSTRAP = process.env.TRUE402_BOOTSTRAP === "1";
const TRUE402_SERVICES_URL = "https://true402.dev/api/v1/services";
const MARKET402_BOOTSTRAP = process.env.MARKET402_BOOTSTRAP === "1";
const MARKET402_SUBMIT_URL = "https://market402.com/submit";
const USDC_X402_ENDPOINT = `${PUBLIC_BASE_URL}/v1/usdc/catalog-audit`;
const USDC_X402_PRICE = "$0.01";
const USDC_X402_NETWORK = "eip155:8453";

if (!/^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(PAY_TO)) {
  throw new Error("NANO_ADDRESS must be a valid public Nano address");
}
if (!/^0x[a-fA-F0-9]{40}$/.test(BASE_PAYOUT_ADDRESS)) {
  throw new Error("PAL_BASE_PAYOUT_ADDRESS must be a valid public EVM address");
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "128kb" }));

const USDC_X402_PATHS = new Set([
  X402_AUDIT_PATH,
  X402_GTIN_PATH,
  X402_FEED_DIFF_PATH,
  X402_VALIDATE_PATH,
]);

function mirrorX402PaymentRequiredBody(req, res, next) {
  if (req.method !== "POST" || !USDC_X402_PATHS.has(req.path)) {
    next();
    return;
  }

  const originalSend = res.send.bind(res);
  res.send = function sendWithMirroredPaymentRequirements(body) {
    if (res.statusCode === 402) {
      const header = res.getHeader("PAYMENT-REQUIRED") || res.getHeader("payment-required");
      if (header) {
        try {
          const encoded = Array.isArray(header) ? header[0] : String(header);
          const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
          res.type("application/json");
          return originalSend(JSON.stringify(decoded));
        } catch (error) {
          console.warn("[x402] could not mirror PAYMENT-REQUIRED into response body:", error?.message || error);
        }
      }
    }
    return originalSend(body);
  };

  next();
}

app.use(mirrorX402PaymentRequiredBody);

const usdcFacilitatorClient = new HTTPFacilitatorClient(facilitator);
const usdcResourceServer = new x402ResourceServer(usdcFacilitatorClient)
  .register(USDC_X402_NETWORK, new ExactEvmScheme());

app.use(
  paymentMiddleware(
    {
      "POST /v1/usdc/catalog-audit": {
        accepts: [
          { scheme: "exact", price: USDC_X402_PRICE, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Google Merchant Center and Google Shopping product-feed audit for 1-100 catalog records: duplicate IDs, GTIN validation/checksum, URLs, prices, availability, and brand/MPN consistency.",
        mimeType: "application/json",
        serviceName: "PAL Catalog Feed Identifier Audit",
        tags: ["catalog", "product-feed", "merchant-feed", "ecommerce", "validation", "merchant-center", "google-shopping", "gtin"],
        extensions: {
          ...declareDiscoveryExtension({
            input: {
              records: [
                {
                  id: "sku-100",
                  title: "Example Product",
                  gtin: "4006381333931",
                  brand: "Example",
                  mpn: "SKU-100",
                  price: "19.99 USD",
                  availability: "in_stock",
                  identifier_exists: true,
                },
              ],
            },
            inputSchema: {
              type: "object",
              properties: {
                records: {
                  type: "array",
                  minItems: 1,
                  maxItems: 100,
                  items: { type: "object", additionalProperties: true },
                },
              },
              required: ["records"],
            },
            bodyType: "json",
            output: {
              example: {
                ok: true,
                record_count: 1,
                issue_count: 0,
                error_count: 0,
                warning_count: 0,
                issues: [],
              },
            },
          }),
        },
      },
      "POST /v1/usdc/gtin-check": {
        accepts: [
          { scheme: "exact", price: USDC_X402_PRICE, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Validate up to 100 GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 identifiers including check digits.",
        mimeType: "application/json",
        serviceName: "PAL GTIN Check",
        tags: ["gtin", "upc", "ean", "identifier", "ecommerce", "validation"],
        extensions: {
          ...declareDiscoveryExtension({
            input: { gtins: ["4006381333931", "036000291452"] },
            inputSchema: {
              type: "object",
              properties: {
                gtins: {
                  type: "array",
                  minItems: 1,
                  maxItems: 100,
                  items: { anyOf: [{ type: "string" }, { type: "number" }] },
                },
              },
              required: ["gtins"],
            },
            bodyType: "json",
            output: {
              example: {
                service: "PAL GTIN Check",
                summary: { checked: 2, valid: 2, invalid: 0 },
                results: [],
              },
            },
          }),
        },
      },
      "POST /v1/usdc/feed-diff": {
        accepts: [
          { scheme: "exact", price: USDC_X402_PRICE, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Compare two product-feed snapshots and return added, removed, and changed commerce fields for up to 100 rows per side.",
        mimeType: "application/json",
        serviceName: "PAL Feed Diff",
        tags: ["catalog", "product-feed", "feed-diff", "ecommerce", "change-detection"],
        extensions: {
          ...declareDiscoveryExtension({
            input: {
              before: [{ id: "sku-1", price: "19.99 USD", availability: "in_stock" }],
              after: [{ id: "sku-1", price: "17.99 USD", availability: "in_stock" }],
            },
            inputSchema: {
              type: "object",
              properties: {
                before: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
                after: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
              },
              required: ["before", "after"],
            },
            bodyType: "json",
            output: {
              example: {
                service: "PAL Feed Diff",
                summary: { before_rows: 1, after_rows: 1, added: 0, removed: 0, changed: 1, unchanged: 0 },
                changed: [{ id: "sku-1", changes: [{ field: "price", before: "19.99 USD", after: "17.99 USD" }] }],
              },
            },
          }),
        },
      },
      "POST /v1/usdc/x402-validate": {
        accepts: [
          { scheme: "exact", price: X402_VALIDATE_PRICE_USD, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Statically validate x402 v2 payment declarations and report protocol-shape, EVM/Base, amount, asset, recipient, timeout, and duplicate-accept findings without fetching or paying the declared resource.",
        mimeType: "application/json",
        serviceName: "PAL x402 Declaration Validator",
        tags: ["x402", "payments", "validation", "developer-tools", "base", "usdc"],
        extensions: {
          ...declareDiscoveryExtension({
            input: {
              x402Version: 2,
              resource: { url: "https://example.com/api/data" },
              accepts: [
                {
                  scheme: "exact",
                  network: "eip155:8453",
                  amount: "10000",
                  asset: X402_ASSET,
                  payTo: BASE_PAYOUT_ADDRESS,
                  maxTimeoutSeconds: 60,
                },
              ],
            },
            inputSchema: {
              type: "object",
              additionalProperties: true,
            },
            bodyType: "json",
            output: {
              example: {
                service: "PAL x402 Declaration Validator",
                verdict: "valid",
                summary: { valid: true, errors: 0, warnings: 0, accepts_checked: 1, base_mainnet_accepts: 1 },
                findings: [],
              },
            },
          }),
        },
      },
    },
    usdcResourceServer,
  ),
);

const usedPayments = new Map();
const inFlightPayments = new Set();
let paidAudits = 0;
let usdcPaidAudits = 0;
let usdcPaidGtinChecks = 0;
let usdcPaidFeedDiffs = 0;
let usdcPaidX402Validations = 0;
let payanAgentState = {
  enabled: PAYANAGENT_BOOTSTRAP,
  status: PAYANAGENT_BOOTSTRAP ? "pending" : "disabled",
  agent_id: null,
  offer_id: null,
  checked_at: null,
  error: null,
};
let agent402State = {
  enabled: AGENT402_BOOTSTRAP,
  status: AGENT402_BOOTSTRAP ? "pending" : "disabled",
  listed: false,
  checked_at: null,
  seller: null,
  error: null,
};
let index402State = {
  enabled: INDEX402_BOOTSTRAP,
  status: INDEX402_BOOTSTRAP ? "pending" : "disabled",
  registered: false,
  checked_at: null,
  service: null,
  verification: null,
  error: null,
};
let index402VerificationHash = "";
let index402ClaimState = {
  enabled: INDEX402_CLAIM_BOOTSTRAP,
  status: INDEX402_CLAIM_BOOTSTRAP ? "pending" : "disabled",
  checked_at: null,
  domain_verified: false,
  services_count: null,
  service_updated: false,
  service: null,
  error: null,
};
let x402ScoutState = {
  enabled: X402SCOUT_BOOTSTRAP,
  status: X402SCOUT_BOOTSTRAP ? "pending" : "disabled",
  registered: false,
  checked_at: null,
  service_id: null,
  error: null,
};
let agentToolsState = {
  enabled: AGENTTOOLS_BOOTSTRAP,
  status: AGENTTOOLS_BOOTSTRAP ? "pending" : "disabled",
  registered: false,
  checked_at: null,
  service: null,
  error: null,
};
let openDexterAuditionState = {
  enabled: OPENDEXTER_AUDITION_BOOTSTRAP,
  status: OPENDEXTER_AUDITION_BOOTSTRAP ? "pending" : "disabled",
  checked_at: null,
  ok: false,
  summary: null,
  routes: [],
  error: null,
};
let true402State = {
  enabled: TRUE402_BOOTSTRAP,
  status: TRUE402_BOOTSTRAP ? "pending" : "disabled",
  registered: false,
  checked_at: null,
  listing: null,
  error: null,
};
let market402State = {
  enabled: MARKET402_BOOTSTRAP,
  status: MARKET402_BOOTSTRAP ? "pending" : "disabled",
  submitted: false,
  checked_at: null,
  result: null,
  error: null,
};

function nowIso() {
  return new Date().toISOString();
}

function paymentRequired(res, reason = "payment_required", detail = null) {
  return res.status(402).json({
    error: reason,
    detail,
    asset: "XNO",
    network: "nano:mainnet",
    scheme: "pal-nano-hash-v1",
    pay_to: PAY_TO,
    price_raw: PRICE_RAW,
    price_nano: PRICE_NANO,
    retry_header: "X-Nano-Payment",
    verification: "https://pursekeeper.dev/v1/verify",
  });
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function extractAgentPayRecords(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const content = messages[index]?.content;
    if (content && typeof content === "object" && !Array.isArray(content)) {
      if (Array.isArray(content.records)) return content.records;
      continue;
    }
    if (typeof content !== "string") continue;

    let text = content.trim();
    if (!text) continue;

    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) text = fenced[1].trim();

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.records)) {
        return parsed.records;
      }
    } catch {
      // Keep scanning earlier messages for a structured catalog payload.
    }
  }

  return null;
}

function gtinChecksumValid(raw) {
  const digits = cleanString(raw).replace(/\s+/g, "");
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  const expected = Number(digits.at(-1));
  let sum = 0;
  let weight = 3;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return ((10 - (sum % 10)) % 10) === expected;
}

function safePayanAgentError(value) {
  const text = value instanceof Error ? value.message : String(value || "unknown_error");
  return text.replace(/pk_live_[A-Za-z0-9_-]+/g, "pk_live_REDACTED").slice(0, 500);
}

async function payanAgentJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 1000) };
  }
  if (!response.ok) {
    throw new Error(
      `PayanAgent HTTP ${response.status}: ${JSON.stringify(body).slice(0, 700)}`
    );
  }
  return body;
}

async function existingPayanAgentOffer() {
  const url = new URL("/api/v1/discover", PAYANAGENT_BASE);
  url.searchParams.set("q", PAYANAGENT_OFFER_TITLE);
  url.searchParams.set("offerType", "api");
  url.searchParams.set("limit", "50");
  const body = await payanAgentJson(url);
  const offers = Array.isArray(body?.offers) ? body.offers : [];
  return (
    offers.find(
      (offer) =>
        String(offer?.title || "").trim() === PAYANAGENT_OFFER_TITLE &&
        String(offer?.endpoint || "").replace(/\/$/, "") === PAYANAGENT_OFFER_ENDPOINT
    ) || null
  );
}

async function startPayanAgentBootstrap() {
  if (!PAYANAGENT_BOOTSTRAP) return;
  payanAgentState = {
    enabled: true,
    status: "checking",
    agent_id: null,
    offer_id: null,
    checked_at: nowIso(),
    error: null,
  };

  if (!/^0x[a-fA-F0-9]{40}$/.test(BASE_PAYOUT_ADDRESS)) {
    payanAgentState = {
      ...payanAgentState,
      status: "blocked",
      checked_at: nowIso(),
      error: "PAL_BASE_PAYOUT_ADDRESS is missing or invalid",
    };
    console.error("[payanagent] bootstrap blocked: invalid payout address");
    return;
  }

  try {
    const existing = await existingPayanAgentOffer();
    if (existing?._id) {
      payanAgentState = {
        enabled: true,
        status: "already_live",
        agent_id: existing.sellerId || null,
        offer_id: existing._id,
        checked_at: nowIso(),
        error: null,
      };
      console.log(
        `[payanagent] existing offer found offer_id=${existing._id} seller_id=${existing.sellerId || "unknown"}`
      );
      return;
    }
  } catch (error) {
    console.warn("[payanagent] discovery precheck failed:", safePayanAgentError(error));
  }

  try {
    payanAgentState = { ...payanAgentState, status: "registering", checked_at: nowIso() };
    const registered = await payanAgentJson(`${PAYANAGENT_BASE}/api/v1/agents`, {
      method: "POST",
      body: JSON.stringify({
        name: "Practical Automation Lab Catalog API",
        description:
          "Deterministic product-catalog and feed identifier auditing for autonomous commerce agents. Checks duplicate IDs, GTIN format/checksum, URLs, price shape, availability, and brand/MPN consistency.",
        walletAddress: BASE_PAYOUT_ADDRESS,
        chain: "base",
        tags: ["catalog", "product-feed", "ecommerce", "data-quality"],
        providerType: "api",
        agentUrl: PUBLIC_BASE_URL,
      }),
    });

    const apiKey = String(registered?.apiKey || "");
    const agentId = String(registered?.agentId || "");
    if (!apiKey.startsWith("pk_") || !agentId) {
      throw new Error("PayanAgent registration returned no usable agentId/apiKey");
    }

    payanAgentState = {
      ...payanAgentState,
      status: "listing",
      agent_id: agentId,
      checked_at: nowIso(),
    };

    const created = await payanAgentJson(`${PAYANAGENT_BASE}/api/v1/offers`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        title: PAYANAGENT_OFFER_TITLE,
        description:
          "Deterministic product-feed row QA for identifiers, duplicate IDs, URL shape, price formatting, availability, GTIN checksum, and brand/MPN consistency. Accepts 1-100 records and returns structured row-level findings. No LLM and no merchant credentials.",
        category: "Data",
        tags: ["catalog", "product-feed", "ecommerce", "validation"],
        priceCents: 1,
        offerType: "api",
        endpoint: PAYANAGENT_OFFER_ENDPOINT,
        httpMethod: "POST",
        inputSchema:
          '{"records":[{"id":"sku-100","title":"Example Product","link":"https://example.com/p/sku-100","image_link":"https://example.com/i/sku-100.jpg","gtin":"4006381333931","brand":"Example","mpn":"SKU-100","price":"19.99 USD","availability":"in_stock","identifier_exists":true}]}',
        outputSchema:
          '{"ok":true,"record_count":1,"issue_count":0,"error_count":0,"warning_count":0,"issues":[],"generated_at":"ISO-8601"}',
        estimatedDurationSeconds: 2,
      }),
    });

    const offerId = String(created?.offerId || "");
    if (!offerId) throw new Error("PayanAgent offer creation returned no offerId");

    payanAgentState = {
      enabled: true,
      status: "live",
      agent_id: agentId,
      offer_id: offerId,
      checked_at: nowIso(),
      error: null,
    };
    console.log(`[payanagent] live agent_id=${agentId} offer_id=${offerId}`);
  } catch (error) {
    payanAgentState = {
      ...payanAgentState,
      status: "failed",
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[payanagent] bootstrap failed:", safePayanAgentError(error));
  }
}

function catalogAuditExample() {
  return {
    records: [
      {
        id: "sku-100",
        title: "Example Product",
        link: "https://example.com/products/sku-100",
        image_link: "https://example.com/images/sku-100.jpg",
        gtin: "4006381333931",
        brand: "Example",
        mpn: "SKU-100",
        price: "19.99 USD",
        availability: "in_stock",
        identifier_exists: true,
      },
    ],
  };
}

function true402Manifest() {
  return {
    x402: "1.0",
    name: "PAL Catalog Feed Identifier Audit",
    description:
      "Deterministic Google Merchant Center and product-feed audit for 1-100 catalog records: duplicate IDs, GTIN format/checksum, URL shape, price formatting, availability, and brand/MPN consistency.",
    capabilities: [
      "catalog",
      "product-feed",
      "merchant-center",
      "google-shopping",
      "gtin",
      "validation",
      "ecommerce",
    ],
    pricing: {
      currency: "USDC",
      base: "0.01",
      unit: "request",
    },
    payment: {
      address: BASE_PAYOUT_ADDRESS,
      chain: "base-mainnet",
      facilitator: X402_FACILITATOR_URL,
    },
    endpoint: X402_AUDIT_URL,
    endpoints: [
      { name: "PAL Catalog Feed Identifier Audit", endpoint: X402_AUDIT_URL, method: "POST", price: "0.01" },
      { name: "PAL GTIN Check", endpoint: X402_GTIN_URL, method: "POST", price: "0.01" },
      { name: "PAL Feed Diff", endpoint: X402_FEED_DIFF_URL, method: "POST", price: "0.01" },
      { name: "PAL x402 Declaration Validator", endpoint: X402_VALIDATE_URL, method: "POST", price: "0.05" },
    ],
  };
}

function x402Manifest() {
  const commonAccepts = [
    {
      scheme: "exact",
      network: X402_NETWORK,
      asset: X402_ASSET,
      amount: X402_PRICE_ATOMIC,
      payTo: BASE_PAYOUT_ADDRESS,
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    },
  ];
  const validatorAccepts = [
    {
      scheme: "exact",
      network: X402_NETWORK,
      asset: X402_ASSET,
      amount: X402_VALIDATE_PRICE_ATOMIC,
      payTo: BASE_PAYOUT_ADDRESS,
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    },
  ];

  return {
    spec: "agent402-service-manifest/1",
    version: 1,
    name: "Practical Automation Lab",
    summary:
      "Deterministic paid utilities for autonomous agents: commerce-data validation plus x402 declaration diagnostics.",
    homepage: PUBLIC_BASE_URL,
    repository:
      "https://github.com/enricoaboujaoude-droid/practical-automation-lab/tree/nano-seller/nano-seller",
    resources: [
      {
        resource: X402_AUDIT_URL,
        name: "PAL Merchant Center Product Feed Audit",
        description:
          "Audit 1-100 Google Merchant Center / Google Shopping product-feed records for duplicate IDs, GTIN validation/checksum, URL shape, price formatting, availability, and brand/MPN consistency.",
        method: "POST",
        price: X402_PRICE_USD,
        inputSchema: {
          type: "object",
          required: ["records"],
          properties: {
            records: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } },
          },
        },
        accepts: commonAccepts,
      },
      {
        resource: X402_GTIN_URL,
        name: "PAL GTIN Check",
        description:
          "Validate up to 100 GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 identifiers including check digits.",
        method: "POST",
        price: X402_PRICE_USD,
        inputSchema: {
          type: "object",
          required: ["gtins"],
          properties: {
            gtins: { type: "array", minItems: 1, maxItems: 100, items: {} },
          },
        },
        accepts: commonAccepts,
      },
      {
        resource: X402_FEED_DIFF_URL,
        name: "PAL Feed Diff",
        description:
          "Compare two product-feed snapshots and return added, removed, and changed commerce fields for up to 100 rows per side.",
        method: "POST",
        price: X402_PRICE_USD,
        inputSchema: {
          type: "object",
          required: ["before", "after"],
          properties: {
            before: { type: "array", maxItems: 100, items: { type: "object" } },
            after: { type: "array", maxItems: 100, items: { type: "object" } },
          },
        },
        accepts: commonAccepts,
      },
      {
        resource: X402_VALIDATE_URL,
        name: "PAL x402 Declaration Validator",
        description:
          "Statically validate x402 v2 declarations for protocol shape, payment requirements, Base/EVM address fields, atomic amounts, timeouts, duplicate accepts, and Base-USDC readiness.",
        method: "POST",
        price: X402_VALIDATE_PRICE_USD,
        inputSchema: { type: "object", additionalProperties: true },
        accepts: validatorAccepts,
      },
    ],
    payment: {
      x402: {
        version: 2,
        currency: "USDC",
        networks: [X402_NETWORK],
        primaryNetwork: X402_NETWORK,
        payTo: BASE_PAYOUT_ADDRESS,
      },
    },
    capabilities: {
      tools: 4,
      categories: [
        "commerce",
        "merchant-feed",
        "product-feed",
        "catalog-validation",
        "gtin",
        "feed-diff",
        "x402",
        "payments",
        "developer-tools",
      ],
    },
    machineReadable: {
      openapi: `${PUBLIC_BASE_URL}/openapi.json`,
      status: `${PUBLIC_BASE_URL}/v1/agent402/status`,
    },
  };
}

function x402OpenApi() {
  const paymentInfo = {
    protocol: "x402",
    version: 2,
    scheme: "exact",
    network: X402_NETWORK,
    asset: X402_ASSET,
    amount: X402_PRICE_ATOMIC,
    price: X402_PRICE_USD,
    payTo: BASE_PAYOUT_ADDRESS,
  };

  const validatorPaymentInfo = {
    protocol: "x402",
    version: 2,
    scheme: "exact",
    network: X402_NETWORK,
    asset: X402_ASSET,
    amount: X402_VALIDATE_PRICE_ATOMIC,
    price: X402_VALIDATE_PRICE_USD,
    payTo: BASE_PAYOUT_ADDRESS,
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "PAL Commerce Data x402 API",
      version: "1.2.0",
      description:
        "Deterministic utilities paid per call with x402 Base USDC: catalog audit, GTIN validation, product-feed diff, and x402 declaration validation.",
    },
    servers: [{ url: PUBLIC_BASE_URL }],
    paths: {
      [X402_AUDIT_PATH]: {
        post: {
          operationId: "auditCatalogFeedIdentifiers",
          summary: "Google Merchant Center and product feed audit",
          tags: ["ecommerce", "merchant-feed", "google-shopping", "catalog-validation", "gtin"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["records"],
                  properties: {
                    records: {
                      type: "array",
                      minItems: 1,
                      maxItems: 100,
                      items: { type: "object", additionalProperties: true },
                    },
                  },
                },
                example: catalogAuditExample(),
              },
            },
          },
          responses: {
            "200": { description: "Structured audit result after successful payment." },
            "400": { description: "Invalid catalog payload." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": paymentInfo,
        },
      },
      [X402_GTIN_PATH]: {
        post: {
          operationId: "validateGtins",
          summary: "Validate GTIN/UPC/EAN identifiers",
          tags: ["ecommerce", "gtin", "upc", "ean", "validation"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["gtins"],
                  properties: {
                    gtins: {
                      type: "array",
                      minItems: 1,
                      maxItems: 100,
                      items: { anyOf: [{ type: "string" }, { type: "number" }] },
                    },
                  },
                },
                example: { gtins: ["4006381333931", "036000291452"] },
              },
            },
          },
          responses: {
            "200": { description: "GTIN validation result after successful payment." },
            "400": { description: "Invalid GTIN payload." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": paymentInfo,
        },
      },
      [X402_FEED_DIFF_PATH]: {
        post: {
          operationId: "diffProductFeedSnapshots",
          summary: "Compare product-feed snapshots",
          tags: ["ecommerce", "product-feed", "change-detection"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["before", "after"],
                  properties: {
                    before: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
                    after: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
                  },
                },
                example: {
                  before: [{ id: "sku-1", price: "19.99 USD", availability: "in_stock" }],
                  after: [{ id: "sku-1", price: "17.99 USD", availability: "in_stock" }],
                },
              },
            },
          },
          responses: {
            "200": { description: "Feed diff after successful payment." },
            "400": { description: "Invalid feed-diff payload." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": paymentInfo,
        },
      },
      [X402_VALIDATE_PATH]: {
        post: {
          operationId: "validateX402Declaration",
          summary: "Validate an x402 v2 payment declaration",
          tags: ["x402", "payments", "developer-tools", "validation"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
                example: {
                  x402Version: 2,
                  resource: { url: "https://example.com/api/data" },
                  accepts: [
                    {
                      scheme: "exact",
                      network: "eip155:8453",
                      amount: "10000",
                      asset: X402_ASSET,
                      payTo: BASE_PAYOUT_ADDRESS,
                      maxTimeoutSeconds: 60,
                    },
                  ],
                },
              },
            },
          },
          responses: {
            "200": { description: "Static x402 declaration findings after successful payment." },
            "400": { description: "Invalid request wrapper." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": validatorPaymentInfo,
        },
      },
    },
  };
}

async function startAgent402Bootstrap() {
  if (!AGENT402_BOOTSTRAP) return;
  agent402State = {
    enabled: true,
    status: "preflight",
    listed: false,
    checked_at: nowIso(),
    seller: null,
    error: null,
  };

  try {
    const localProbeUrl = `http://127.0.0.1:${PORT}${X402_AUDIT_PATH}`;
    const probe = await fetch(localProbeUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(catalogAuditExample()),
      signal: AbortSignal.timeout(20_000),
    });
    const challenge =
      probe.headers.get("payment-required") ||
      probe.headers.get("x-payment-required");
    if (probe.status !== 402 || !challenge) {
      const body = await probe.text();
      throw new Error(
        `x402 local preflight expected HTTP 402 + PAYMENT-REQUIRED, got ${probe.status}: ${body.slice(0, 300)}`
      );
    }

    agent402State = {
      ...agent402State,
      status: "waiting_public",
      checked_at: nowIso(),
    };

    let publicReady = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      try {
        const manifestResponse = await fetch(`${PUBLIC_BASE_URL}/.well-known/x402`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        const manifest = manifestResponse.ok ? await manifestResponse.json() : null;
        publicReady =
          manifestResponse.ok &&
          Array.isArray(manifest?.resources) &&
          manifest.resources.some(
            (resource) =>
              String(resource?.resource || resource?.url || "") === X402_AUDIT_URL
          );
        if (publicReady) break;
      } catch {
        // Render may still be switching the public hostname to this instance.
      }
    }
    if (!publicReady) {
      throw new Error("public x402 manifest did not become ready before registration");
    }

    agent402State = {
      ...agent402State,
      status: "registering",
      checked_at: nowIso(),
    };

    const response = await fetch(AGENT402_REGISTER_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ origin: PUBLIC_BASE_URL }),
      signal: AbortSignal.timeout(45_000),
    });
    const raw = await response.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw: raw.slice(0, 1000) };
    }
    if (!response.ok || body?.listed !== true) {
      throw new Error(
        `Agent402 registration HTTP ${response.status}: ${JSON.stringify(body).slice(0, 900)}`
      );
    }

    agent402State = {
      enabled: true,
      status: "live",
      listed: true,
      checked_at: nowIso(),
      seller: body.seller || { origin: body.origin || PUBLIC_BASE_URL },
      error: null,
    };
    console.log(
      `[agent402] listed origin=${PUBLIC_BASE_URL} tools=${body?.seller?.toolCount ?? body?.seller?.tools ?? "unknown"}`
    );
  } catch (error) {
    agent402State = {
      ...agent402State,
      status: "failed",
      listed: false,
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[agent402] bootstrap failed:", safePayanAgentError(error));
  }
}

async function startIndex402Bootstrap() {
  if (!INDEX402_BOOTSTRAP) return;
  index402State = {
    enabled: true,
    status: "registering",
    registered: false,
    checked_at: nowIso(),
    service: null,
    verification: null,
    error: null,
  };

  try {
    const payload = {
      url: X402_AUDIT_URL,
      name: "PAL Catalog Feed Identifier Audit",
      protocol: "x402",
      http_method: "POST",
      probe_body: JSON.stringify(catalogAuditExample()),
      description:
        "Deterministic product-feed identifier and consistency audit for 1-100 catalog records: duplicate IDs, GTIN checksum, URL shape, price formatting, availability, and brand/MPN consistency.",
      price_usd: 0.01,
      payment_asset: "USDC",
      payment_network: "Base",
      category: "ecommerce/data-quality",
      provider: "Practical Automation Lab",
    };

    const response = await fetch(INDEX402_REGISTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });

    const raw = await response.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw: raw.slice(0, 1200) };
    }

    if (!response.ok) {
      throw new Error(
        `402 Index registration HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`
      );
    }

    index402State = {
      enabled: true,
      status: body?.status || "registered",
      registered: true,
      checked_at: nowIso(),
      service: body?.service || body?.listing || body?.data || null,
      verification: body?.probe || body?.verification || null,
      error: null,
    };
    console.log(
      `[402index] registered route=${X402_AUDIT_URL} status=${index402State.status}`
    );
  } catch (error) {
    index402State = {
      ...index402State,
      status: "failed",
      registered: false,
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[402index] bootstrap failed:", safePayanAgentError(error));
  }
}

async function startIndex402ClaimBootstrap() {
  if (!INDEX402_CLAIM_BOOTSTRAP) return;

  let verificationToken = "";
  index402ClaimState = {
    enabled: true,
    status: "claiming",
    checked_at: nowIso(),
    domain_verified: false,
    services_count: null,
    service_updated: false,
    service: null,
    error: null,
  };

  try {
    const claimResponse = await fetch(INDEX402_CLAIM_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        domain: INDEX402_DOMAIN,
        contact_email: "enricoaboujaoude@gmail.com",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const claimRaw = await claimResponse.text();
    let claimBody = {};
    try {
      claimBody = claimRaw ? JSON.parse(claimRaw) : {};
    } catch {
      claimBody = { raw: claimRaw.slice(0, 1200) };
    }
    if (!claimResponse.ok) {
      if (claimResponse.status === 409) {
        index402ClaimState = {
          ...index402ClaimState,
          status: "already_verified",
          checked_at: nowIso(),
          domain_verified: true,
          error: null,
        };
        return;
      }
      throw new Error(
        `402 Index claim HTTP ${claimResponse.status}: ${JSON.stringify(claimBody).slice(0, 1000)}`
      );
    }

    verificationToken = String(claimBody?.verification_token || "").trim();
    index402VerificationHash = String(claimBody?.verification_hash || "").trim();
    if (!/^[a-fA-F0-9]{64}$/.test(verificationToken)) {
      throw new Error("402 Index claim returned no valid verification token");
    }
    if (!/^[a-fA-F0-9]{64}$/.test(index402VerificationHash)) {
      throw new Error("402 Index claim returned no valid verification hash");
    }

    index402ClaimState = {
      ...index402ClaimState,
      status: "verifying",
      checked_at: nowIso(),
    };

    // Give the public edge a moment to observe the in-memory .well-known hash.
    await new Promise((resolve) => setTimeout(resolve, 3_000));

    const verifyResponse = await fetch(INDEX402_CLAIM_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ domain: INDEX402_DOMAIN }),
      signal: AbortSignal.timeout(30_000),
    });
    const verifyRaw = await verifyResponse.text();
    let verifyBody = {};
    try {
      verifyBody = verifyRaw ? JSON.parse(verifyRaw) : {};
    } catch {
      verifyBody = { raw: verifyRaw.slice(0, 1200) };
    }
    if (!verifyResponse.ok && verifyResponse.status !== 409) {
      throw new Error(
        `402 Index verification HTTP ${verifyResponse.status}: ${JSON.stringify(verifyBody).slice(0, 1000)}`
      );
    }

    const verified =
      verifyResponse.ok
        ? String(verifyBody?.status || "").toLowerCase() === "verified"
        : verifyResponse.status === 409;
    if (!verified) {
      throw new Error(
        `402 Index verification did not confirm domain: ${JSON.stringify(verifyBody).slice(0, 1000)}`
      );
    }

    index402ClaimState = {
      ...index402ClaimState,
      status: "updating_service",
      checked_at: nowIso(),
      domain_verified: true,
      services_count: Number.isFinite(Number(verifyBody?.services_count))
        ? Number(verifyBody.services_count)
        : null,
    };

    const patchResponse = await fetch(
      `https://402index.io/api/v1/services/${INDEX402_SERVICE_ID}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          domain: INDEX402_DOMAIN,
          verification_token: verificationToken,
          name: "PAL Catalog Feed Identifier Audit",
          description:
            "Deterministic Google Merchant Center and product-feed identifier audit for 1-100 catalog records: duplicate IDs, GTIN format/checksum, URL shape, price formatting, availability, and brand/MPN consistency.",
          category: "ecommerce/catalog-validation",
          price_usd: 0.01,
          payment_asset: "USDC",
          payment_network: "Base",
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    const patchRaw = await patchResponse.text();
    let patchBody = {};
    try {
      patchBody = patchRaw ? JSON.parse(patchRaw) : {};
    } catch {
      patchBody = { raw: patchRaw.slice(0, 1200) };
    }
    if (!patchResponse.ok) {
      throw new Error(
        `402 Index service update HTTP ${patchResponse.status}: ${JSON.stringify(patchBody).slice(0, 1000)}`
      );
    }

    index402ClaimState = {
      enabled: true,
      status: "verified",
      checked_at: nowIso(),
      domain_verified: true,
      services_count: Number.isFinite(Number(verifyBody?.services_count))
        ? Number(verifyBody.services_count)
        : null,
      service_updated: true,
      service: patchBody?.service || patchBody?.data || patchBody || null,
      error: null,
    };
    console.log(
      `[402index] domain verified domain=${INDEX402_DOMAIN} service=${INDEX402_SERVICE_ID}`
    );
  } catch (error) {
    index402ClaimState = {
      ...index402ClaimState,
      status: "failed",
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[402index] domain claim failed:", safePayanAgentError(error));
  } finally {
    // The raw token is intentionally never logged or exposed by an endpoint.
    verificationToken = "";
  }
}

async function startX402ScoutBootstrap() {
  if (!X402SCOUT_BOOTSTRAP) return;
  x402ScoutState = {
    enabled: true,
    status: "registering",
    registered: false,
    checked_at: nowIso(),
    service_id: null,
    error: null,
  };

  try {
    const response = await fetch(X402SCOUT_REGISTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        name: "PAL Catalog Feed Identifier Audit",
        url: X402_AUDIT_URL,
        price_usd: 0.01,
        category: "data",
        description:
          "Deterministic product-feed identifier and consistency audit for 1-100 catalog records: duplicate IDs, GTIN checksum, URL shape, price formatting, availability, and brand/MPN consistency.",
        network: "base-mainnet",
        wallet: BASE_PAYOUT_ADDRESS,
        wallet_address: BASE_PAYOUT_ADDRESS,
        tags: ["catalog", "ecommerce", "product-feed", "validation"],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const raw = await response.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw: raw.slice(0, 1200) };
    }
    if (!response.ok) {
      throw new Error(
        `x402Scout registration HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`
      );
    }

    x402ScoutState = {
      enabled: true,
      status: body?.status || "registered",
      registered: true,
      checked_at: nowIso(),
      service_id: body?.service_id || body?.id || body?.service?.id || null,
      error: null,
    };
    console.log(
      `[x402scout] registered route=${X402_AUDIT_URL} service_id=${x402ScoutState.service_id || "unknown"}`
    );
  } catch (error) {
    x402ScoutState = {
      ...x402ScoutState,
      status: "failed",
      registered: false,
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[x402scout] bootstrap failed:", safePayanAgentError(error));
  }
}

async function startAgentToolsBootstrap() {
  if (!AGENTTOOLS_BOOTSTRAP) return;
  agentToolsState = {
    enabled: true,
    status: "registering",
    registered: false,
    checked_at: nowIso(),
    service: null,
    error: null,
  };

  try {
    const response = await fetch(AGENTTOOLS_REGISTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        url: X402_AUDIT_URL,
        name: "PAL Catalog Feed Identifier Audit",
        description:
          "Deterministic product-feed identifier and consistency audit for 1-100 catalog records: duplicate IDs, GTIN format/checksum, URL shape, price formatting, availability, and brand/MPN consistency. Paid directly in Base USDC over x402.",
        category: "ecommerce",
        chains: ["base"],
        price_min_usdc: 0.01,
        price_max_usdc: 0.01,
        contact: "enricoaboujaoude@gmail.com",
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const raw = await response.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw: raw.slice(0, 1200) };
    }

    if (!response.ok) {
      throw new Error(
        `agent-tools.cloud registration HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`
      );
    }

    agentToolsState = {
      enabled: true,
      status: body?.status || "registered",
      registered: true,
      checked_at: nowIso(),
      service: body?.service || body?.data || body,
      error: null,
    };
    console.log(
      `[agenttools] submitted route=${X402_AUDIT_URL} status=${agentToolsState.status}`
    );
  } catch (error) {
    agentToolsState = {
      ...agentToolsState,
      status: "failed",
      registered: false,
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[agenttools] bootstrap failed:", safePayanAgentError(error));
  }
}

async function startOpenDexterAuditionBootstrap() {
  if (!OPENDEXTER_AUDITION_BOOTSTRAP) return;

  openDexterAuditionState = {
    enabled: true,
    status: "auditioning",
    checked_at: nowIso(),
    ok: false,
    summary: null,
    routes: [],
    error: null,
  };

  try {
    // A specific endpoint URL requests OpenDexter's immediate server-funded
    // paid verification. This does not use PAL's payout wallet as a payer.
    const response = await fetch(OPENDEXTER_AUDITION_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-encoding": "identity",
      },
      body: JSON.stringify({ url: X402_AUDIT_URL }),
      signal: AbortSignal.timeout(120_000),
      redirect: "manual",
    });

    const raw = await response.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw: raw.slice(0, 1600) };
    }

    if (!response.ok || body?.ok !== true) {
      throw new Error(
        `OpenDexter audition HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1400)}`
      );
    }

    openDexterAuditionState = {
      enabled: true,
      status: "completed",
      checked_at: nowIso(),
      ok: true,
      summary: body?.summary || null,
      routes: Array.isArray(body?.routes)
        ? body.routes.map((route) => ({
            url: route?.url || null,
            registered: route?.registered ?? null,
            auditOutcome: route?.auditOutcome || null,
            score: Number.isFinite(route?.score) ? route.score : null,
            verdict: route?.verdict || null,
            shareUrl: route?.shareUrl || null,
            incompleteReason: route?.incompleteReason || null,
          }))
        : [],
      error: null,
    };

    console.log(
      `[opendexter] audition route=${X402_AUDIT_URL} ok=true scored=${openDexterAuditionState.routes.filter((r) => Number.isFinite(r.score)).length}`
    );
  } catch (error) {
    openDexterAuditionState = {
      ...openDexterAuditionState,
      status: "failed",
      checked_at: nowIso(),
      ok: false,
      error: safePayanAgentError(error),
    };
    console.error("[opendexter] audition failed:", safePayanAgentError(error));
  }
}

async function startTrue402Bootstrap() {
  if (!TRUE402_BOOTSTRAP) return;

  true402State = {
    enabled: true,
    status: "checking",
    registered: false,
    checked_at: nowIso(),
    listing: null,
    error: null,
  };

  try {
    const listResponse = await fetch(TRUE402_SERVICES_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!listResponse.ok) {
      throw new Error(`true402 catalog HTTP ${listResponse.status}`);
    }
    const listBody = await listResponse.json();
    const listings = Array.isArray(listBody?.data) ? listBody.data : [];
    const existing =
      listings.find(
        (item) =>
          String(item?.url || "").replace(/\/$/, "") === X402_AUDIT_URL ||
          String(item?.manifest?.endpoint || "").replace(/\/$/, "") === X402_AUDIT_URL
      ) || null;

    if (existing) {
      true402State = {
        enabled: true,
        status: "already_listed",
        registered: true,
        checked_at: nowIso(),
        listing: existing,
        error: null,
      };
      console.log(
        `[true402] already listed route=${X402_AUDIT_URL} id=${existing.id || "unknown"}`
      );
      return;
    }

    true402State = {
      ...true402State,
      status: "registering",
      checked_at: nowIso(),
    };

    const registerResponse = await fetch(TRUE402_SERVICES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ url: PUBLIC_BASE_URL }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await registerResponse.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw: raw.slice(0, 1200) };
    }

    if (!registerResponse.ok) {
      throw new Error(
        `true402 registration HTTP ${registerResponse.status}: ${JSON.stringify(body).slice(0, 1000)}`
      );
    }

    true402State = {
      enabled: true,
      status: "registered",
      registered: true,
      checked_at: nowIso(),
      listing: body?.service || body?.data || body || null,
      error: null,
    };
    console.log(
      `[true402] registered route=${X402_AUDIT_URL} id=${body?.id || body?.service?.id || body?.data?.id || "unknown"}`
    );
  } catch (error) {
    true402State = {
      ...true402State,
      status: "failed",
      registered: false,
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[true402] bootstrap failed:", safePayanAgentError(error));
  }
}


async function submitMarket402Resource(resource) {
  const response = await fetch(MARKET402_SUBMIT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ resource }),
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw: raw.slice(0, 1600) };
  }

  const duplicate =
    response.status === 409 ||
    body?.already_listed === true ||
    /already|duplicate|exists|submitted/i.test(JSON.stringify(body));

  if (!response.ok && !duplicate) {
    throw new Error(
      `Market402 submission HTTP ${response.status} for ${resource}: ${JSON.stringify(body).slice(0, 1200)}`
    );
  }

  return {
    resource,
    submitted: response.ok || duplicate,
    duplicate,
    status: response.status,
    result: body,
  };
}

async function startMarket402Bootstrap() {
  if (!MARKET402_BOOTSTRAP) return;

  market402State = {
    enabled: true,
    status: "submitting",
    submitted: false,
    checked_at: nowIso(),
    result: null,
    error: null,
  };

  const resources = [X402_AUDIT_URL, X402_VALIDATE_URL];
  const results = [];

  try {
    for (const resource of resources) {
      try {
        const outcome = await submitMarket402Resource(resource);
        results.push(outcome);
        console.log(
          `[market402] resource=${resource} submitted=${outcome.submitted} duplicate=${outcome.duplicate} status=${outcome.status}`
        );
      } catch (error) {
        results.push({
          resource,
          submitted: false,
          duplicate: false,
          status: null,
          error: safePayanAgentError(error),
        });
        console.error("[market402] resource submission failed:", safePayanAgentError(error));
      }
    }

    const submittedCount = results.filter((item) => item.submitted).length;
    if (submittedCount === 0) {
      throw new Error("Market402 rejected or failed all PAL resources");
    }

    market402State = {
      enabled: true,
      status: submittedCount === resources.length ? "submitted" : "partial",
      submitted: true,
      checked_at: nowIso(),
      result: {
        resources_total: resources.length,
        resources_submitted: submittedCount,
        resources: results,
      },
      error:
        submittedCount === resources.length
          ? null
          : "One or more PAL resources could not be submitted.",
    };
    console.log(
      `[market402] bootstrap complete submitted=${submittedCount}/${resources.length}`
    );
  } catch (error) {
    market402State = {
      enabled: true,
      status: "failed",
      submitted: false,
      checked_at: nowIso(),
      result: { resources: results },
      error: safePayanAgentError(error),
    };
    console.error("[market402] bootstrap failed:", safePayanAgentError(error));
  }
}


const FEED_DIFF_FIELDS = [
  "title",
  "link",
  "image_link",
  "price",
  "availability",
  "brand",
  "gtin",
  "mpn",
];

function gtinCheckDigit(digitsWithoutCheck) {
  let sum = 0;
  let positionFromRight = 0;
  for (let index = digitsWithoutCheck.length - 1; index >= 0; index -= 1) {
    const weight = positionFromRight % 2 === 0 ? 3 : 1;
    sum += Number(digitsWithoutCheck[index]) * weight;
    positionFromRight += 1;
  }
  return String((10 - (sum % 10)) % 10);
}

function inspectGtin(input) {
  const normalized = String(input).trim().replace(/[\s-]+/g, "");
  const numeric = /^\d+$/.test(normalized);
  const validLength = [8, 12, 13, 14].includes(normalized.length);
  if (!numeric || !validLength) {
    return {
      input: String(input),
      normalized,
      length: normalized.length,
      valid_length: validLength,
      checksum_valid: false,
      valid: false,
      reason: !numeric
        ? "GTIN must contain digits only (spaces and hyphens are ignored)."
        : "GTIN length must be 8, 12, 13, or 14 digits.",
    };
  }
  const expected = gtinCheckDigit(normalized.slice(0, -1));
  const actual = normalized.at(-1);
  const checksumValid = expected === actual;
  return {
    input: String(input),
    normalized,
    length: normalized.length,
    valid_length: true,
    check_digit_expected: expected,
    check_digit_actual: actual,
    checksum_valid: checksumValid,
    valid: checksumValid,
    reason: checksumValid ? null : "GTIN check digit does not match.",
  };
}

function gtinCheck(gtins) {
  const results = gtins.map(inspectGtin);
  const valid = results.filter((item) => item.valid).length;
  return {
    service: "PAL GTIN Check",
    generated_at: nowIso(),
    summary: { checked: results.length, valid, invalid: results.length - valid },
    results,
  };
}

function feedRowError(rows, label) {
  if (!Array.isArray(rows) || rows.length > 100) {
    return `${label} must be an array with at most 100 rows.`;
  }
  const seen = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `${label}[${index}] must be an object.`;
    }
    const id = String(row.id ?? "").trim();
    if (!id) return `${label}[${index}].id is required.`;
    if (seen.has(id)) return `${label} contains duplicate id "${id}".`;
    seen.add(id);
  }
  return null;
}

function feedFieldValue(row, field) {
  if (!(field in row) || row[field] === null || row[field] === undefined) return null;
  if (typeof row[field] === "string") return row[field].trim();
  if (typeof row[field] === "number" || typeof row[field] === "boolean") return row[field];
  return JSON.stringify(row[field]);
}

function feedDiff(beforeRows, afterRows) {
  const before = new Map(beforeRows.map((row) => [String(row.id).trim(), row]));
  const after = new Map(afterRows.map((row) => [String(row.id).trim(), row]));
  const added = [...after.keys()].filter((id) => !before.has(id)).sort();
  const removed = [...before.keys()].filter((id) => !after.has(id)).sort();
  const changed = [];

  for (const id of [...before.keys()].filter((key) => after.has(key)).sort()) {
    const changes = [];
    for (const field of FEED_DIFF_FIELDS) {
      const oldValue = feedFieldValue(before.get(id), field);
      const newValue = feedFieldValue(after.get(id), field);
      if (oldValue !== newValue) changes.push({ field, before: oldValue, after: newValue });
    }
    if (changes.length) changed.push({ id, changes });
  }

  return {
    service: "PAL Feed Diff",
    generated_at: nowIso(),
    summary: {
      before_rows: beforeRows.length,
      after_rows: afterRows.length,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: [...before.keys()].filter((id) => after.has(id)).length - changed.length,
    },
    added_ids: added,
    removed_ids: removed,
    changed,
  };
}


function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function x402Finding(findings, severity, code, path, message) {
  findings.push({ severity, code, path, message });
}

function validateX402DeclarationBody(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  if ("declaration" in body && !isPlainObject(body.declaration)) {
    return { ok: false, error: "declaration must be a JSON object when supplied." };
  }
  if ("payment_required" in body && !isPlainObject(body.payment_required)) {
    return { ok: false, error: "payment_required must be a JSON object when supplied." };
  }
  return { ok: true };
}

function inspectX402Declaration(body) {
  const declaration = isPlainObject(body.declaration)
    ? body.declaration
    : isPlainObject(body.payment_required)
      ? body.payment_required
      : body;
  const findings = [];

  if (declaration.x402Version !== 2) {
    x402Finding(
      findings,
      "error",
      "x402_version",
      "x402Version",
      "x402Version must be the number 2.",
    );
  }

  const resource = declaration.resource;
  if (!isPlainObject(resource)) {
    x402Finding(findings, "error", "resource_missing", "resource", "resource must be an object.");
  } else if (!validHttpUrl(resource.url)) {
    x402Finding(
      findings,
      "error",
      "resource_url",
      "resource.url",
      "resource.url must be an absolute http(s) URL.",
    );
  }

  const accepts = declaration.accepts;
  if (!Array.isArray(accepts) || accepts.length < 1) {
    x402Finding(
      findings,
      "error",
      "accepts_missing",
      "accepts",
      "accepts must be a non-empty array.",
    );
  } else if (accepts.length > 20) {
    x402Finding(
      findings,
      "error",
      "accepts_too_large",
      "accepts",
      "accepts may contain at most 20 entries for this validator.",
    );
  }

  let baseMainnetAccepts = 0;
  let baseUsdcAccepts = 0;
  const seen = new Set();

  if (Array.isArray(accepts)) {
    accepts.slice(0, 20).forEach((accept, index) => {
      const path = "accepts[" + index + "]";
      if (!isPlainObject(accept)) {
        x402Finding(findings, "error", "accept_not_object", path, "accept entry must be an object.");
        return;
      }

      const scheme = String(accept.scheme || "").trim();
      const network = String(accept.network || "").trim();
      const asset = String(accept.asset || "").trim();
      const payTo = String(accept.payTo || "").trim();
      const amount = String(accept.amount ?? "").trim();

      if (!scheme) {
        x402Finding(findings, "error", "scheme_missing", path + ".scheme", "scheme is required.");
      } else if (scheme !== "exact") {
        x402Finding(
          findings,
          "warning",
          "non_exact_scheme",
          path + ".scheme",
          'This validator is optimized for fixed-price "exact" declarations.',
        );
      }

      if (!network) {
        x402Finding(findings, "error", "network_missing", path + ".network", "network is required.");
      }

      if (!/^[1-9]\d*$/.test(amount)) {
        x402Finding(
          findings,
          "error",
          "amount_invalid",
          path + ".amount",
          "amount must be a positive base-10 integer in atomic units.",
        );
      }

      const evm = /^eip155:\d+$/.test(network);
      if (evm) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(asset)) {
          x402Finding(
            findings,
            "error",
            "evm_asset_invalid",
            path + ".asset",
            "EVM asset must be a 20-byte 0x-prefixed token address.",
          );
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
          x402Finding(
            findings,
            "error",
            "evm_pay_to_invalid",
            path + ".payTo",
            "EVM payTo must be a 20-byte 0x-prefixed address.",
          );
        }
      } else {
        if (!asset) {
          x402Finding(findings, "error", "asset_missing", path + ".asset", "asset is required.");
        }
        if (!payTo) {
          x402Finding(findings, "error", "pay_to_missing", path + ".payTo", "payTo is required.");
        }
      }

      if (!Number.isInteger(accept.maxTimeoutSeconds) || accept.maxTimeoutSeconds <= 0) {
        x402Finding(
          findings,
          "error",
          "timeout_invalid",
          path + ".maxTimeoutSeconds",
          "maxTimeoutSeconds must be a positive integer.",
        );
      }

      if ("extra" in accept && !isPlainObject(accept.extra)) {
        x402Finding(
          findings,
          "warning",
          "extra_shape",
          path + ".extra",
          "extra should be an object when supplied.",
        );
      }

      if (network === X402_NETWORK) {
        baseMainnetAccepts += 1;
        if (asset.toLowerCase() === X402_ASSET.toLowerCase()) {
          baseUsdcAccepts += 1;
        }
      }

      const duplicateKey = [scheme, network, amount, asset.toLowerCase(), payTo.toLowerCase()].join("|");
      if (seen.has(duplicateKey)) {
        x402Finding(
          findings,
          "warning",
          "duplicate_accept",
          path,
          "This payment requirement duplicates an earlier scheme/network/amount/asset/payTo tuple.",
        );
      }
      seen.add(duplicateKey);
    });
  }

  if (Array.isArray(accepts) && accepts.length > 0 && baseMainnetAccepts === 0) {
    x402Finding(
      findings,
      "warning",
      "base_mainnet_missing",
      "accepts",
      "No Base mainnet (eip155:8453) payment requirement is declared.",
    );
  } else if (baseMainnetAccepts > 0 && baseUsdcAccepts === 0) {
    x402Finding(
      findings,
      "warning",
      "base_usdc_missing",
      "accepts",
      "Base mainnet is declared, but no requirement uses the canonical Base USDC asset.",
    );
  }

  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;

  return {
    service: "PAL x402 Declaration Validator",
    generated_at: nowIso(),
    scope:
      "Static x402 v2 declaration validation only. No declared resource is fetched, no payment is made, and liveness or funding is not established.",
    verdict: errors > 0 ? "invalid" : warnings > 0 ? "valid_with_warnings" : "valid",
    summary: {
      valid: errors === 0,
      errors,
      warnings,
      accepts_checked: Array.isArray(accepts) ? Math.min(accepts.length, 20) : 0,
      base_mainnet_accepts: baseMainnetAccepts,
      base_usdc_accepts: baseUsdcAccepts,
    },
    resource_url:
      isPlainObject(resource) && typeof resource.url === "string" ? resource.url : null,
    findings,
  };
}

function audit(records) {
  const issues = [];
  const ids = new Map();
  const allowedAvailability = new Set([
    "in_stock",
    "out_of_stock",
    "preorder",
    "backorder",
  ]);

  records.forEach((record, index) => {
    const row = record && typeof record === "object" && !Array.isArray(record) ? record : {};
    const id = cleanString(row.id);
    const title = cleanString(row.title);
    const link = cleanString(row.link);
    const imageLink = cleanString(row.image_link);
    const gtin = cleanString(row.gtin).replace(/\s+/g, "");
    const brand = cleanString(row.brand);
    const mpn = cleanString(row.mpn);
    const price = cleanString(row.price);
    const availability = cleanString(row.availability).toLowerCase();

    const add = (code, field, message, severity = "error") => {
      issues.push({ index, id: id || null, severity, code, field, message });
    };

    if (!id) add("ID_MISSING", "id", "Product id is empty.");
    if (!title) add("TITLE_MISSING", "title", "Product title is empty.");

    if (id) {
      if (ids.has(id)) {
        add("ID_DUPLICATE", "id", `Duplicate id; first seen at row ${ids.get(id)}.`);
      } else {
        ids.set(id, index);
      }
    }

    if (link && !validHttpUrl(link)) {
      add("LINK_INVALID", "link", "Product link must be an absolute HTTP(S) URL.");
    }
    if (imageLink && !validHttpUrl(imageLink)) {
      add("IMAGE_LINK_INVALID", "image_link", "Image link must be an absolute HTTP(S) URL.");
    }

    if (gtin) {
      if (!/^\d+$/.test(gtin) || ![8, 12, 13, 14].includes(gtin.length)) {
        add("GTIN_FORMAT_INVALID", "gtin", "GTIN must contain 8, 12, 13, or 14 digits.");
      } else if (!gtinChecksumValid(gtin)) {
        add("GTIN_CHECKSUM_INVALID", "gtin", "GTIN checksum does not validate.");
      }
    }

    if (mpn && !brand) {
      add("BRAND_MISSING_FOR_MPN", "brand", "Brand is missing while MPN is present.", "warning");
    }

    if (row.identifier_exists === true && !gtin && !mpn) {
      add(
        "IDENTIFIER_MISSING",
        "gtin",
        "identifier_exists is true but neither GTIN nor MPN is present."
      );
    }

    if (price && !/^\d+(?:\.\d{1,4})?\s[A-Z]{3}$/.test(price)) {
      add(
        "PRICE_FORMAT_INVALID",
        "price",
        "Price should look like '19.99 USD' with an uppercase 3-letter currency."
      );
    }

    if (availability && !allowedAvailability.has(availability)) {
      add(
        "AVAILABILITY_UNRECOGNIZED",
        "availability",
        "Availability should be in_stock, out_of_stock, preorder, or backorder.",
        "warning"
      );
    }
  });

  const errors = issues.filter((x) => x.severity === "error").length;
  const warnings = issues.filter((x) => x.severity === "warning").length;

  return {
    ok: errors === 0,
    record_count: records.length,
    issue_count: issues.length,
    error_count: errors,
    warning_count: warnings,
    issues,
  };
}

async function verifyPayment(hash) {
  const url = new URL(VERIFY_BASE);
  url.searchParams.set("hash", hash);
  url.searchParams.set("to", PAY_TO);
  url.searchParams.set("min_raw", PRICE_RAW);

  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "Practical-Automation-Lab-Nano-Seller/1.0",
    },
    signal: AbortSignal.timeout(12_000),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.status === 404) {
    return { ok: false, reason: "payment_not_found", detail: body };
  }
  if (!response.ok) {
    throw new Error(`verification upstream returned HTTP ${response.status}`);
  }
  if (!body?.ok || body?.confirmed !== true || body?.subtype !== "send") {
    return {
      ok: false,
      reason: body?.reason || "payment_not_valid",
      detail: body,
    };
  }
  return { ok: true, detail: body };
}

app.get("/", (_req, res) => {
  res.json({
    service: "PAL Catalog Identifier Audit",
    version: "1.0.0",
    description:
      "Deterministic product-catalog identifier and feed consistency audit, paid in Nano.",
    paid_endpoint: "POST /v1/audit",
    base_usdc_paid_endpoints: [
      "POST /v1/usdc/catalog-audit",
      "POST /v1/usdc/gtin-check",
      "POST /v1/usdc/feed-diff",
      "POST /v1/usdc/x402-validate",
    ],
    agentpay_endpoint: "POST /v1/agentpay",
    free_endpoints: ["GET /health", "GET /v1/price", "GET /v1/stats"],
    limits: { records_per_audit: 100, request_body: "128kb" },
    payment: {
      nano: {
        asset: "XNO",
        network: "nano:mainnet",
        scheme: "pal-nano-hash-v1",
        price_nano: PRICE_NANO,
        price_raw: PRICE_RAW,
        pay_to: PAY_TO,
        retry_header: "X-Nano-Payment",
      },
      base_usdc: {
        asset: "USDC",
        network: USDC_X402_NETWORK,
        scheme: "exact",
        price_usd: USDC_X402_PRICE,
        pay_to: BASE_PAYOUT_ADDRESS,
        endpoint: USDC_X402_ENDPOINT,
        facilitator: "https://facilitator.payai.network",
      },
    },
    source: "https://github.com/enricoaboujaoude-droid/practical-automation-lab/tree/nano-seller/nano-seller",
  });
});

app.get("/llms.txt", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.type("text/plain").send(`# Practical Automation Lab — paid commerce-data tools

Base URL: ${PUBLIC_BASE_URL}
Payment: x402 v2 exact on Base mainnet (eip155:8453), USDC
Seller wallet: ${BASE_PAYOUT_ADDRESS}
OpenAPI: ${PUBLIC_BASE_URL}/openapi.json
x402 manifest: ${PUBLIC_BASE_URL}/.well-known/x402

## Paid tools

### PAL Catalog Feed Identifier Audit
POST ${PUBLIC_BASE_URL}/v1/usdc/catalog-audit
Price: $0.01 USDC per successful call
Input: {"records":[...]} with 1-100 product records.
Use for deterministic checks of duplicate IDs, GTIN format/checksum, URL shape, price formatting, availability, brand/MPN consistency.

### PAL GTIN Check
POST ${PUBLIC_BASE_URL}/v1/usdc/gtin-check
Price: $0.01 USDC per successful call
Input: {"gtins":[...]} with 1-100 GTIN/UPC/EAN values.
Returns normalized identifier, supported length, expected/actual check digit and validity.

### PAL Feed Diff
POST ${PUBLIC_BASE_URL}/v1/usdc/feed-diff
Price: $0.01 USDC per successful call
Input: {"before":[...],"after":[...]} with up to 100 rows per snapshot.
Returns added IDs, removed IDs and structured field-level changes.

### PAL x402 Declaration Validator
POST ${PUBLIC_BASE_URL}/v1/usdc/x402-validate
Price: $0.05 USDC per successful call
Input: an x402 v2 PaymentRequired object directly, or wrap it as {"declaration":{...}} or {"payment_required":{...}}.
Returns deterministic protocol-shape findings, Base/EVM readiness, amount/address/asset checks, duplicate accepts, and warnings. It never fetches or pays the declared resource.

## Buyer flow
1. POST valid JSON without payment.
2. Read HTTP 402 and PAYMENT-REQUIRED.
3. Satisfy one exact Base-USDC requirement.
4. Retry the identical request with PAYMENT-SIGNATURE.
5. Read the JSON result and PAYMENT-RESPONSE.

These are deterministic commerce-data utilities. They do not modify stores, require merchant credentials, or use an LLM.
`);
});

app.get("/skill.md", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.type("text/markdown").send(`# PAL Commerce Data Tools

Use these tools when an agent needs cheap deterministic validation of ecommerce catalog data.

## audit_catalog_feed
POST ${PUBLIC_BASE_URL}/v1/usdc/catalog-audit
Cost: $0.01 USDC
Body: {"records":[product,...]}
Use before Google Merchant Center / shopping-feed submission or when checking identifier, price, URL, availability and variant-readiness issues.

## validate_gtins
POST ${PUBLIC_BASE_URL}/v1/usdc/gtin-check
Cost: $0.01 USDC
Body: {"gtins":["4006381333931",...]}
Use to validate GTIN-8, GTIN-12/UPC, GTIN-13/EAN and GTIN-14 lengths and check digits.

## diff_product_feeds
POST ${PUBLIC_BASE_URL}/v1/usdc/feed-diff
Cost: $0.01 USDC
Body: {"before":[...],"after":[...]}
Use to detect product additions/removals and changes to title, link, image, price, availability, brand, GTIN and MPN.

## validate_x402_declaration
POST ${PUBLIC_BASE_URL}/v1/usdc/x402-validate
Cost: $0.05 USDC
Body: an x402 v2 PaymentRequired object or a wrapper containing declaration/payment_required.
Use to statically validate protocol shape, payment requirements, Base/EVM fields, amounts, timeouts and duplicate accepts without paying or fetching the declared resource.

Payment protocol: x402 v2 exact, Base mainnet USDC.
Discovery: ${PUBLIC_BASE_URL}/.well-known/x402
OpenAPI: ${PUBLIC_BASE_URL}/openapi.json
`);
});

app.get("/.well-known/agent.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json({
    name: "Practical Automation Lab Commerce Data",
    description:
      "Deterministic pay-per-call utilities for AI agents: commerce-data validation and x402 declaration diagnostics.",
    version: "1.2.0",
    homepage: PUBLIC_BASE_URL,
    docs: `${PUBLIC_BASE_URL}/llms.txt`,
    skill: `${PUBLIC_BASE_URL}/skill.md`,
    openapi: `${PUBLIC_BASE_URL}/openapi.json`,
    x402: `${PUBLIC_BASE_URL}/.well-known/x402`,
    payment: {
      protocol: "x402",
      version: 2,
      scheme: "exact",
      network: X402_NETWORK,
      asset: "USDC",
      asset_address: X402_ASSET,
      pay_to: BASE_PAYOUT_ADDRESS,
    },
    tools: [
      {
        name: "audit_catalog_feed",
        method: "POST",
        url: X402_AUDIT_URL,
        price_usd: 0.01,
      },
      {
        name: "validate_gtins",
        method: "POST",
        url: X402_GTIN_URL,
        price_usd: 0.01,
      },
      {
        name: "diff_product_feeds",
        method: "POST",
        url: X402_FEED_DIFF_URL,
        price_usd: 0.01,
      },
      {
        name: "validate_x402_declaration",
        method: "POST",
        url: X402_VALIDATE_URL,
        price_usd: 0.05,
      },
    ],
  });
});

app.get("/.well-known/x402", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(x402Manifest());
});

app.get("/.well-known/x402-service.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(true402Manifest());
});

app.get("/openapi.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(x402OpenApi());
});

app.get("/v1/agent402/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "Agent402",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    facilitator: X402_FACILITATOR_URL,
    ...agent402State,
  });
});

app.get("/.well-known/402index-verify.txt", (_req, res) => {
  res.set("Cache-Control", "no-store");
  if (!index402VerificationHash) {
    return res.status(404).type("text/plain").send("verification_not_ready");
  }
  return res.type("text/plain").send(index402VerificationHash);
});

app.get("/v1/402index/claim-status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    marketplace: "402 Index",
    domain: INDEX402_DOMAIN,
    service_id: INDEX402_SERVICE_ID,
    ...index402ClaimState,
  });
});

app.get("/v1/402index/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "402 Index",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    directory: "https://402index.io",
    ...index402State,
  });
});

app.get("/v1/x402scout/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "x402Scout",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    directory: "https://x402scout.com",
    ...x402ScoutState,
  });
});

app.get("/v1/agenttools/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "agent-tools.cloud",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    directory: "https://agent-tools.cloud",
    ...agentToolsState,
  });
});

app.get("/v1/opendexter/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "x402gle / OpenDexter",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    ...openDexterAuditionState,
  });
});

app.get("/v1/true402/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "true402",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    directory: "https://true402.dev/catalog",
    ...true402State,
  });
});

app.get("/v1/market402/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "Market402",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    directory: "https://market402.com",
    ...market402State,
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "pal-nano-catalog-identifier-audit", time: nowIso() });
});

app.get("/v1/price", (_req, res) => {
  res.json({
    asset: "XNO",
    network: "nano:mainnet",
    scheme: "pal-nano-hash-v1",
    price_nano: PRICE_NANO,
    price_raw: PRICE_RAW,
    pay_to: PAY_TO,
  });
});

app.get("/v1/stats", (_req, res) => {
  res.json({
    paid_audits_since_process_start: paidAudits,
    usdc_x402_paid_audits_since_process_start: usdcPaidAudits,
    usdc_x402_paid_gtin_checks_since_process_start: usdcPaidGtinChecks,
    usdc_x402_paid_feed_diffs_since_process_start: usdcPaidFeedDiffs,
    usdc_x402_paid_x402_validations_since_process_start: usdcPaidX402Validations,
    payment_hashes_consumed_since_process_start: usedPayments.size,
    uptime_seconds: Math.floor(process.uptime()),
  });
});

app.get("/v1/preflight", async (_req, res) => {
  const target = `http://127.0.0.1:${PORT}/v1/audit`;
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        records: [{
          id: "preflight-sku",
          title: "Preflight Product",
          link: "https://example.com/products/preflight-sku",
          image_link: "https://example.com/images/preflight-sku.jpg",
          gtin: "4006381333931",
          brand: "Example",
          mpn: "PREFLIGHT-SKU",
          price: "19.99 USD",
          availability: "in_stock",
          identifier_exists: true
        }]
      }),
      signal: AbortSignal.timeout(5000)
    });
    const body = await response.json();
    res.status(response.status === 402 ? 200 : 500).json({
      ok: response.status === 402,
      observed_status: response.status,
      observed_body: body
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "preflight_failed" });
  }
});

app.post("/v1/agentpay", (req, res) => {
  const records = extractAgentPayRecords(req.body?.messages);

  if (!records) {
    return res.json({
      ok: false,
      ready: true,
      service: "PAL Catalog Identifier Audit",
      error: "catalog_payload_required",
      detail:
        "Send a messages array whose message content is JSON containing {\"records\":[...]} or a JSON array of records.",
      limits: { records_per_audit: 100 },
      example: {
        messages: [
          {
            role: "user",
            content:
              "{\"records\":[{\"id\":\"sku-100\",\"title\":\"Example Product\",\"gtin\":\"4006381333931\",\"brand\":\"Example\",\"mpn\":\"SKU-100\",\"price\":\"19.99 USD\",\"availability\":\"in_stock\",\"identifier_exists\":true}]}",
          },
        ],
      },
    });
  }

  if (records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Catalog payload must contain 1 to 100 records.",
    });
  }

  const result = audit(records);
  return res.json({
    ...result,
    marketplace: {
      provider: "AgentStore",
      billing: "handled_upstream",
    },
    generated_at: nowIso(),
    disclaimer:
      "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.get("/v1/payanagent/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "PayanAgent",
    payout_network: "base",
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS || null,
    offer_endpoint: PAYANAGENT_OFFER_ENDPOINT,
    ...payanAgentState,
  });
});

app.post("/v1/usdc/catalog-audit", (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
    });
  }

  usdcPaidAudits += 1;
  console.log(
    `[revenue] usdc_x402_catalog_audit served price_usd=0.01 network=${USDC_X402_NETWORK} count=${usdcPaidAudits}`
  );

  const result = audit(records);
  return res.json({
    ...result,
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: USDC_X402_PRICE,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
    generated_at: nowIso(),
    disclaimer:
      "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.post("/v1/usdc/gtin-check", (req, res) => {
  const gtins = req.body?.gtins;
  if (!Array.isArray(gtins) || gtins.length < 1 || gtins.length > 100) {
    return res.status(400).json({
      error: "invalid_gtins",
      detail: "Body must contain gtins as an array with 1 to 100 values.",
    });
  }
  for (let index = 0; index < gtins.length; index += 1) {
    const value = gtins[index];
    if (!["string", "number"].includes(typeof value) || String(value).trim() === "") {
      return res.status(400).json({
        error: "invalid_gtins",
        detail: `gtins[${index}] must be a non-empty string or number.`,
      });
    }
  }

  usdcPaidGtinChecks += 1;
  console.log(
    `[revenue] usdc_x402_gtin_check served price_usd=0.01 network=${USDC_X402_NETWORK} count=${usdcPaidGtinChecks}`
  );

  return res.json({
    ...gtinCheck(gtins),
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: USDC_X402_PRICE,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
  });
});

app.post("/v1/usdc/feed-diff", (req, res) => {
  const beforeError = feedRowError(req.body?.before, "before");
  if (beforeError) return res.status(400).json({ error: "invalid_feed", detail: beforeError });
  const afterError = feedRowError(req.body?.after, "after");
  if (afterError) return res.status(400).json({ error: "invalid_feed", detail: afterError });
  if (req.body.before.length + req.body.after.length < 1) {
    return res.status(400).json({
      error: "invalid_feed",
      detail: "At least one feed snapshot must contain a row.",
    });
  }

  usdcPaidFeedDiffs += 1;
  console.log(
    `[revenue] usdc_x402_feed_diff served price_usd=0.01 network=${USDC_X402_NETWORK} count=${usdcPaidFeedDiffs}`
  );

  return res.json({
    ...feedDiff(req.body.before, req.body.after),
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: USDC_X402_PRICE,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
  });
});

app.post("/v1/usdc/x402-validate", (req, res) => {
  const validation = validateX402DeclarationBody(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: "invalid_declaration", detail: validation.error });
  }

  usdcPaidX402Validations += 1;
  console.log(
    "[revenue] usdc_x402_declaration_validation served price_usd=0.05 network=" +
      USDC_X402_NETWORK +
      " count=" +
      usdcPaidX402Validations,
  );

  return res.json({
    ...inspectX402Declaration(req.body),
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: X402_VALIDATE_PRICE_USD,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
  });
});

app.post("/v1/upstream/catalog-audit", (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
      example: catalogAuditExample(),
    });
  }

  const result = audit(records);
  console.log(
    `[revenue] marketplace_upstream catalog-audit served records=${records.length}`
  );

  return res.json({
    ...result,
    provider_upstream: {
      service: "PAL Catalog Feed Identifier Audit",
      billing: "handled_by_marketplace",
    },
    generated_at: nowIso(),
    disclaimer:
      "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.post("/v1/upstream/gtin-check", (req, res) => {
  const gtins = req.body?.gtins;
  if (!Array.isArray(gtins) || gtins.length < 1 || gtins.length > 100) {
    return res.status(400).json({
      error: "invalid_gtins",
      detail: "Body must contain gtins as an array with 1 to 100 values.",
    });
  }
  for (let index = 0; index < gtins.length; index += 1) {
    const value = gtins[index];
    if (!["string", "number"].includes(typeof value) || String(value).trim() === "") {
      return res.status(400).json({
        error: "invalid_gtins",
        detail: `gtins[${index}] must be a non-empty string or number.`,
      });
    }
  }

  console.log(
    `[revenue] marketplace_upstream gtin-check served count=${gtins.length}`
  );

  return res.json({
    ...gtinCheck(gtins),
    provider_upstream: {
      service: "PAL GTIN Check",
      billing: "handled_by_marketplace",
    },
  });
});

app.post("/v1/upstream/feed-diff", (req, res) => {
  const beforeError = feedRowError(req.body?.before, "before");
  if (beforeError) return res.status(400).json({ error: "invalid_feed", detail: beforeError });
  const afterError = feedRowError(req.body?.after, "after");
  if (afterError) return res.status(400).json({ error: "invalid_feed", detail: afterError });
  if (req.body.before.length + req.body.after.length < 1) {
    return res.status(400).json({
      error: "invalid_feed",
      detail: "At least one feed snapshot must contain a row.",
    });
  }

  console.log(
    `[revenue] marketplace_upstream feed-diff served before=${req.body.before.length} after=${req.body.after.length}`
  );

  return res.json({
    ...feedDiff(req.body.before, req.body.after),
    provider_upstream: {
      service: "PAL Feed Diff",
      billing: "handled_by_marketplace",
    },
  });
});

app.post("/v1/upstream/x402-validate", (req, res) => {
  const validation = validateX402DeclarationBody(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: "invalid_declaration", detail: validation.error });
  }

  console.log("[revenue] marketplace_upstream x402-validate served");

  return res.json({
    ...inspectX402Declaration(req.body),
    provider_upstream: {
      service: "PAL x402 Declaration Validator",
      billing: "handled_by_marketplace",
    },
  });
});

app.get("/v1/upstream/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    provider: "Practical Automation Lab",
    payout_network: "Base",
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    endpoints: [
      {
        name: "PAL Catalog Feed Identifier Audit",
        method: "POST",
        url: `${PUBLIC_BASE_URL}/v1/upstream/catalog-audit`,
        max_items: 100,
      },
      {
        name: "PAL GTIN Check",
        method: "POST",
        url: `${PUBLIC_BASE_URL}/v1/upstream/gtin-check`,
        max_items: 100,
      },
      {
        name: "PAL Feed Diff",
        method: "POST",
        url: `${PUBLIC_BASE_URL}/v1/upstream/feed-diff`,
        max_rows_per_snapshot: 100,
      },
      {
        name: "PAL x402 Declaration Validator",
        method: "POST",
        url: `${PUBLIC_BASE_URL}/v1/upstream/x402-validate`,
        scope: "static x402 v2 declaration validation",
      },
    ],
  });
});

app.post("/v1/gigsoul/catalog-audit", (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
      example: catalogAuditExample(),
    });
  }

  const result = audit(records);
  console.log(
    `[revenue] gigsoul_catalog_audit served billing=handled_upstream records=${records.length}`
  );

  return res.json({
    ...result,
    marketplace: {
      provider: "GigSoul Agent Depot",
      billing: "handled_upstream",
      listed_price_usdc: "0.10",
      seller_wallet: BASE_PAYOUT_ADDRESS,
    },
    generated_at: nowIso(),
    disclaimer:
      "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.post("/v1/gigsoul/gtin-check", (req, res) => {
  const gtins = req.body?.gtins;
  if (!Array.isArray(gtins) || gtins.length < 1 || gtins.length > 100) {
    return res.status(400).json({
      error: "invalid_gtins",
      detail: "Body must contain gtins as an array with 1 to 100 values.",
      example: { gtins: ["4006381333931", "036000291452"] },
    });
  }
  for (let index = 0; index < gtins.length; index += 1) {
    const value = gtins[index];
    if (!["string", "number"].includes(typeof value) || String(value).trim() === "") {
      return res.status(400).json({
        error: "invalid_gtins",
        detail: `gtins[${index}] must be a non-empty string or number.`,
      });
    }
  }

  const result = gtinCheck(gtins);
  console.log(
    `[revenue] gigsoul_gtin_check served billing=handled_upstream gtins=${gtins.length}`
  );

  return res.json({
    ...result,
    marketplace: {
      provider: "GigSoul Agent Depot",
      billing: "handled_upstream",
      listed_price_usdc: "0.10",
      seller_wallet: BASE_PAYOUT_ADDRESS,
    },
  });
});

app.post("/v1/gigsoul/feed-diff", (req, res) => {
  const beforeError = feedRowError(req.body?.before, "before");
  if (beforeError) return res.status(400).json({ error: "invalid_feed", detail: beforeError });
  const afterError = feedRowError(req.body?.after, "after");
  if (afterError) return res.status(400).json({ error: "invalid_feed", detail: afterError });
  if (req.body.before.length + req.body.after.length < 1) {
    return res.status(400).json({
      error: "invalid_feed",
      detail: "At least one feed snapshot must contain a row.",
    });
  }

  const result = feedDiff(req.body.before, req.body.after);
  console.log(
    `[revenue] gigsoul_feed_diff served billing=handled_upstream before=${req.body.before.length} after=${req.body.after.length}`
  );

  return res.json({
    ...result,
    marketplace: {
      provider: "GigSoul Agent Depot",
      billing: "handled_upstream",
      listed_price_usdc: "0.10",
      seller_wallet: BASE_PAYOUT_ADDRESS,
    },
  });
});

app.post("/v1/gigsoul/x402-validate", (req, res) => {
  const validation = validateX402DeclarationBody(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      error: "invalid_declaration",
      detail: validation.error,
    });
  }

  const result = inspectX402Declaration(req.body);
  console.log("[revenue] gigsoul_x402_validate served billing=handled_upstream");

  return res.json({
    ...result,
    marketplace: {
      provider: "GigSoul Agent Depot",
      billing: "handled_upstream",
      listed_price_usdc: "0.10",
      seller_wallet: BASE_PAYOUT_ADDRESS,
    },
  });
});

app.get("/v1/gigsoul/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    marketplace: "GigSoul Agent Depot",
    service: "PAL Catalog Feed Auditor",
    endpoint: `${PUBLIC_BASE_URL}/v1/gigsoul/catalog-audit`,
    method: "POST",
    listed_price_usdc: "0.10",
    payout_network: "Base",
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    limits: { records_per_call: 100 },
    sample_input: catalogAuditExample(),
    additional_services_ready_for_review: [
      {
        service: "PAL GTIN Check",
        endpoint: `${PUBLIC_BASE_URL}/v1/gigsoul/gtin-check`,
        method: "POST",
        listed_price_usdc: "0.10",
        sample_input: { gtins: ["4006381333931", "036000291452"] },
      },
      {
        service: "PAL Feed Diff",
        endpoint: `${PUBLIC_BASE_URL}/v1/gigsoul/feed-diff`,
        method: "POST",
        listed_price_usdc: "0.10",
        sample_input: {
          before: [{ id: "sku-1", price: "19.99 USD", availability: "in_stock" }],
          after: [{ id: "sku-1", price: "17.99 USD", availability: "in_stock" }],
        },
      },
      {
        service: "PAL x402 Declaration Validator",
        endpoint: `${PUBLIC_BASE_URL}/v1/gigsoul/x402-validate`,
        method: "POST",
        listed_price_usdc: "0.10",
        sample_input: {
          x402Version: 2,
          resource: { url: `${PUBLIC_BASE_URL}/v1/usdc/catalog-audit` },
          accepts: [{
            scheme: "exact",
            network: "eip155:8453",
            amount: "10000",
            asset: X402_ASSET,
            payTo: BASE_PAYOUT_ADDRESS,
            maxTimeoutSeconds: 60,
          }],
        },
      },
    ],
  });
});

app.post("/v1/payanagent/catalog-audit", (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
    });
  }

  const result = audit(records);
  return res.json({
    ...result,
    marketplace: {
      provider: "PayanAgent",
      billing: "handled_upstream",
      seller_wallet: BASE_PAYOUT_ADDRESS || null,
    },
    generated_at: nowIso(),
    disclaimer:
      "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.post("/v1/audit", async (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
    });
  }

  const paymentHash = cleanString(req.get("X-Nano-Payment")).toUpperCase();
  if (!paymentHash) return paymentRequired(res);
  if (!/^[0-9A-F]{64}$/.test(paymentHash)) {
    return paymentRequired(res, "payment_hash_invalid", "Expected a 64-character Nano block hash.");
  }
  if (usedPayments.has(paymentHash) || inFlightPayments.has(paymentHash)) {
    return paymentRequired(res, "payment_reused", "This payment hash has already been consumed.");
  }

  inFlightPayments.add(paymentHash);
  try {
    const verified = await verifyPayment(paymentHash);
    if (!verified.ok) {
      return paymentRequired(res, verified.reason, verified.detail);
    }

    usedPayments.set(paymentHash, { consumed_at: nowIso() });
    paidAudits += 1;

    const result = audit(records);
    return res.json({
      ...result,
      payment: {
        verified: true,
        hash: paymentHash,
        amount_raw: verified.detail?.amount_raw || null,
        amount_nano: verified.detail?.amount_nano || null,
        from: verified.detail?.from || null,
        to: PAY_TO,
      },
      generated_at: nowIso(),
      disclaimer:
        "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
    });
  } catch (error) {
    console.error("payment verification failed", error);
    return res.status(503).json({
      error: "payment_verification_unavailable",
      detail: "Payment was not consumed. Retry when verification is available.",
    });
  } finally {
    inFlightPayments.delete(paymentHash);
  }
});

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "request_too_large" });
  }
  if (error instanceof SyntaxError) {
    return res.status(400).json({ error: "invalid_json" });
  }
  console.error(error);
  return res.status(500).json({ error: "internal_error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PAL Nano seller listening on :${PORT}; pay_to=${PAY_TO}`);
  void startPayanAgentBootstrap();
  setTimeout(() => void startAgent402Bootstrap(), 4_000);
  setTimeout(() => void startIndex402Bootstrap(), 8_000);
  setTimeout(() => void startIndex402ClaimBootstrap(), 20_000);
  setTimeout(() => void startX402ScoutBootstrap(), 12_000);
  setTimeout(() => void startAgentToolsBootstrap(), 16_000);
  setTimeout(() => void startOpenDexterAuditionBootstrap(), 24_000);
  setTimeout(() => void startTrue402Bootstrap(), 28_000);
  setTimeout(() => void startMarket402Bootstrap(), 32_000);
});
