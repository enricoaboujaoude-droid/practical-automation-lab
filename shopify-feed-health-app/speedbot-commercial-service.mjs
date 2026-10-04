import { readSpeedbotRecord } from "./speedbot-agent.mjs";

const SPEEDBOT_BASE_URL = String(
  process.env.SPEEDBOT_BASE_URL || "https://speedbot.dev",
).replace(/\/+$/, "");

const SERVICE_TITLE = "Public x402 Payment & Discovery Readiness Audit";
const SERVICE_REQUEST_ID = "pal-x402-readiness-audit-v1-20261004";

export const SPEEDBOT_COMMERCIAL_SERVICE = Object.freeze({
  title: SERVICE_TITLE,
  description:
    "Read-only audit of one public x402 seller endpoint and its public discovery metadata. PAL checks the unpaid HTTP 402 response, payment declaration shape, Base or Nano network fields, asset/amount/payTo consistency, resource URL consistency, and up to three public discovery or documentation URLs. No payment, authenticated access, exploit testing, load testing, or private-data access is performed.",
  tags: ["x402", "payments", "verification", "research", "api"],
  input_schema: {
    type: "object",
    properties: {
      endpoint_url: {
        type: "string",
        maxLength: 2000,
        description: "Public HTTPS x402-protected endpoint to inspect without paying it.",
      },
      expected_network: {
        type: "string",
        enum: ["eip155:8453", "nano:mainnet"],
        maxLength: 32,
        description: "Expected payment network.",
      },
      discovery_urls: {
        type: "array",
        maxItems: 3,
        items: {
          type: "string",
          maxLength: 2000,
        },
        description: "Optional public discovery, OpenAPI, or documentation URLs to cross-check.",
      },
    },
    required: ["endpoint_url", "expected_network"],
    additionalProperties: false,
  },
  output_schema: {
    type: "object",
    properties: {
      passed: {
        type: "boolean",
        description: "Whether the public payment and discovery checks passed the stated scope.",
      },
      summary: {
        type: "string",
        maxLength: 3000,
        description: "Concise result and the highest-priority issues.",
      },
      checks_json: {
        type: "string",
        maxLength: 8000,
        description: "JSON string containing bounded check-by-check evidence and remediation guidance.",
      },
    },
    required: ["passed", "summary", "checks_json"],
    additionalProperties: false,
  },
  acceptance_criteria:
    "Inspect the supplied public endpoint without paying it and report the observed HTTP 402 behavior; x402 version/scheme; network, asset, amount and payTo shape; resource URL consistency; and each supplied public discovery URL. Return a pass/fail result, reproducible bounded evidence, and remediation guidance for every failed check. Do not authenticate, purchase, exploit, fuzz, load-test, or access private data.",
  price_usdc: "20",
  delivery_hours: 24,
  max_active_orders: 1,
  valid_for_hours: 720,
  public_consent: true,
  fulfillment_consent: true,
  listing_bonus: false,
  request_id: SERVICE_REQUEST_ID,
});

function safeError(value) {
  return String(value?.message || value || "unknown_error")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer REDACTED")
    .replace(/api[_-]?key[=:]\s*[A-Za-z0-9._-]+/gi, "api_key=REDACTED")
    .slice(0, 700);
}

async function request(path, apiKey, options = {}) {
  const response = await fetch(`${SPEEDBOT_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(
      `Speedbot ${path} returned HTTP ${response.status}: ${String(
        body?.error || body?.message || body?.detail || body?.raw || "request failed",
      ).slice(0, 400)}`,
    );
  }
  return body;
}

function serviceList(body) {
  if (Array.isArray(body?.services)) return body.services;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

function ownService(body) {
  return (
    serviceList(body).find(
      (service) =>
        String(service?.title || "").trim().toLowerCase() ===
        SERVICE_TITLE.toLowerCase(),
    ) || null
  );
}

export async function ensureSpeedbotCommercialService() {
  const record = await readSpeedbotRecord();
  const apiKey = String(record?.api_key || "").trim();
  if (!apiKey) {
    return { status: "blocked_no_speedbot_key" };
  }

  const existing = await request(
    "/api/exchange/services?mine=true&limit=50&offset=0",
    apiKey,
  );
  const current = ownService(existing);
  if (current?.service_id || current?.id) {
    return {
      status: "already_published",
      serviceId: current.service_id || current.id,
      priceUsdc: String(current.price_usdc || current.worker_reward_usdc || "20"),
      availability: current.status || current.availability || "unknown",
    };
  }

  const draft = await request("/api/exchange/service_draft", apiKey);
  if (draft?.wallet_bound !== true) {
    return {
      status: "blocked_wallet_not_bound",
      walletBound: false,
      setupAction: draft?.wallet_setup_action?.action || draft?.wallet_setup?.action || null,
    };
  }

  const published = await request("/api/exchange/publish_service", apiKey, {
    method: "POST",
    body: JSON.stringify(SPEEDBOT_COMMERCIAL_SERVICE),
  });

  const service =
    published?.service ||
    published?.offer ||
    published?.published_service ||
    published;

  return {
    status: "published",
    serviceId: service?.service_id || service?.id || published?.service_id || null,
    priceUsdc: "20",
    listingBonus: published?.listing_bonus ?? false,
    shareUrl: service?.share?.url || published?.share?.url || null,
  };
}

export async function readSpeedbotCommercialOrders() {
  const record = await readSpeedbotRecord();
  const apiKey = String(record?.api_key || "").trim();
  if (!apiKey) return { status: "blocked_no_speedbot_key", orders: [] };

  const body = await request(
    "/api/exchange/orders?role=provider&limit=50&offset=0",
    apiKey,
  );
  const orders = Array.isArray(body?.orders) ? body.orders : [];
  return {
    status: "ok",
    orders: orders
      .filter((order) => {
        const title =
          order?.service?.title ||
          order?.service_title ||
          order?.frozen_service?.title ||
          "";
        return String(title).trim().toLowerCase() === SERVICE_TITLE.toLowerCase();
      })
      .map((order) => ({
        postId: order.post_id || order?.post?.id || null,
        serviceId: order.service_id || order?.service?.id || null,
        status: order.status || order?.post?.status || "unknown",
        dueAt: order.due_at || null,
      })),
  };
}

async function commercialTick() {
  try {
    const service = await ensureSpeedbotCommercialService();
    console.log(
      `[pal-speedbot-commerce] service_status=${service.status} service_id=${service.serviceId || "none"} price_usdc=${service.priceUsdc || "20"} listing_bonus=${String(service.listingBonus ?? false)} wallet_bound=${String(service.walletBound ?? true)}`,
    );

    if (
      service.status !== "published" &&
      service.status !== "already_published"
    ) {
      if (service.setupAction) {
        console.log(
          `[pal-speedbot-commerce] setup_action=${String(service.setupAction).slice(0, 120)}`,
        );
      }
      return;
    }

    const orders = await readSpeedbotCommercialOrders();
    const rows = orders.orders || [];
    const states = rows.map((row) => `${row.postId || "unknown"}:${row.status}`).join(",");
    console.log(
      `[pal-speedbot-commerce] commercial_orders=${rows.length} states=${states || "none"}`,
    );
  } catch (error) {
    console.error("[pal-speedbot-commerce] failed:", safeError(error));
  }
}

export function startSpeedbotCommercialService() {
  setTimeout(() => {
    void commercialTick();
    const timer = setInterval(() => {
      void commercialTick();
    }, 60_000);
    timer.unref();
  }, 6_000).unref();
}
