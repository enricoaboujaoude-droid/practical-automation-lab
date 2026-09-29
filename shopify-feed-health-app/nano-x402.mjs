import crypto from "node:crypto";

import {
  getNanoPaymentConfig,
  readPaymentUse,
  stableStringify,
  writePaymentUse,
} from "./nano-catalog-audit.mjs";

export const X402_VERSION = 2;
export const X402_SCHEME = "exact";
export const X402_NETWORK = "nano:mainnet";
export const X402_ASSET = "XNO";
export const X402_WORK_THRESHOLD = "fffffff800000000";
export const DEFAULT_X402_FACILITATOR = "https://facilitator.pursekeeper.dev";

function facilitatorBase() {
  return String(
    process.env.PAL_NANO_X402_FACILITATOR || DEFAULT_X402_FACILITATOR,
  ).trim().replace(/\/+$/, "");
}

function absoluteResourceUrl(req, path) {
  const forwardedProto = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "https";
  const host = req.get("x-forwarded-host") || req.get("host");
  if (host) return `${protocol}://${String(host).split(",")[0].trim()}${path}`;
  return `https://pal-catalog-check-app.onrender.com${path}`;
}

export function nanoX402Requirements(overrides = {}) {
  const config = getNanoPaymentConfig();
  if (!config.address.startsWith("nano_")) {
    throw new Error("PAL_NANO_ADDRESS is not configured.");
  }
  const amountRaw = String(overrides.amountRaw || config.priceRaw).trim();
  return {
    scheme: X402_SCHEME,
    network: X402_NETWORK,
    amount: amountRaw,
    asset: X402_ASSET,
    payTo: config.address,
    maxTimeoutSeconds: 30,
    extra: {
      work: "required",
      workThreshold: X402_WORK_THRESHOLD,
    },
  };
}

export function nanoX402PaymentRequired(req, spec, reason) {
  const body = {
    x402Version: X402_VERSION,
    resource: {
      url: absoluteResourceUrl(req, spec.path),
      description: spec.description,
      mimeType: "application/json",
    },
    accepts: [nanoX402Requirements({ amountRaw: spec.priceRaw })],
  };
  if (reason) body.error = reason;
  return body;
}

export function encodeX402Header(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodeX402Header(value) {
  try {
    const payload = JSON.parse(Buffer.from(String(value || "").trim(), "base64").toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { ok: false, error: "PAYMENT-SIGNATURE must decode to a JSON object." };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "PAYMENT-SIGNATURE must be base64-encoded JSON." };
  }
}

export function attachX402Required(req, res, spec, reason) {
  const required = nanoX402PaymentRequired(req, spec, reason);
  res.set("PAYMENT-REQUIRED", encodeX402Header(required));
  res.set("X-Payment-Protocol", "x402-v2");
  return required;
}

export function x402PaymentHeader(req) {
  return String(req.get("PAYMENT-SIGNATURE") || req.get("X-PAYMENT") || "").trim();
}

export function x402PayloadUseKey(paymentPayload) {
  return `x402:${crypto
    .createHash("sha256")
    .update(stableStringify(paymentPayload))
    .digest("hex")}`;
}

async function facilitatorPost(path, paymentPayload, paymentRequirements, timeoutMs) {
  let response;
  try {
    response = await fetch(`${facilitatorBase()}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "PAL-Nano-Commerce/2.0",
      },
      body: JSON.stringify({
        x402Version: X402_VERSION,
        paymentPayload,
        paymentRequirements,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, unavailable: true, reason: "Nano x402 facilitator is temporarily unavailable." };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { ok: false, unavailable: true, reason: "Nano x402 facilitator returned an unreadable response." };
  }

  if (!response.ok) {
    return {
      ok: false,
      unavailable: response.status >= 500,
      reason: data.detail || data.error || data.errorReason || `Facilitator HTTP ${response.status}.`,
      data,
    };
  }
  return { ok: true, data };
}

export async function verifyNanoX402(paymentPayload, paymentRequirements) {
  const result = await facilitatorPost("/verify", paymentPayload, paymentRequirements, 10_000);
  if (!result.ok) return result;
  if (result.data.isValid !== true) {
    return {
      ok: false,
      reason: result.data.detail || result.data.invalidReason || "The x402 payment is invalid.",
      data: result.data,
    };
  }
  return { ok: true, data: result.data };
}

export async function settleNanoX402(paymentPayload, paymentRequirements) {
  const result = await facilitatorPost("/settle", paymentPayload, paymentRequirements, 35_000);
  if (!result.ok) return result;
  if (result.data.success !== true || !/^[A-F0-9]{64}$/i.test(String(result.data.transaction || ""))) {
    return {
      ok: false,
      reason: result.data.detail || result.data.errorReason || "The x402 payment could not be settled.",
      data: result.data,
    };
  }
  return {
    ok: true,
    transaction: String(result.data.transaction).toUpperCase(),
    payer: result.data.payer || null,
    data: result.data,
  };
}

export async function priorNanoX402Use(paymentPayload, digest) {
  const key = x402PayloadUseKey(paymentPayload);
  const previous = await readPaymentUse(key);
  if (!previous) return { key, previous: null, conflict: false };
  return {
    key,
    previous,
    conflict: previous.body_sha256 !== digest,
  };
}

export async function recordNanoX402Use(paymentPayload, transaction, digest, result, amountRaw) {
  const key = x402PayloadUseKey(paymentPayload);
  const payloadRow = await writePaymentUse(key, digest, result, amountRaw);
  const transactionRow = await writePaymentUse(transaction, digest, result, amountRaw);
  return { payloadRow, transactionRow };
}

export function nanoX402DiscoveryItems(baseUrl = "https://pal-catalog-check-app.onrender.com", services = []) {
  const lastUpdated = new Date().toISOString();
  return services.map((service) => ({
    resource: `${baseUrl.replace(/\/$/, "")}${service.path}`,
    type: "http",
    x402Version: X402_VERSION,
    accepts: [nanoX402Requirements({ amountRaw: service.priceRaw })],
    lastUpdated,
  }));
}
