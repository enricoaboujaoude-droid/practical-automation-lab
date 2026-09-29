import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let tableReadyPromise;

const DEFAULT_PRICE_RAW = "10000000000000000000000000000";
const DEFAULT_PRICE_XNO = "0.01";
const DEFAULT_VERIFY_URL = "https://pursekeeper.dev/v1/verify";
const MAX_PRODUCTS = 100;
const VALID_AVAILABILITY = new Set(["in_stock", "out_of_stock", "preorder", "backorder"]);

export function getNanoPaymentConfig() {
  const address = String(process.env.PAL_NANO_ADDRESS || "").trim();
  return {
    address,
    priceRaw: String(process.env.PAL_NANO_PRICE_RAW || DEFAULT_PRICE_RAW).trim(),
    priceXno: String(process.env.PAL_NANO_PRICE_XNO || DEFAULT_PRICE_XNO).trim(),
    verifyUrl: String(process.env.PAL_NANO_VERIFY_URL || DEFAULT_VERIFY_URL).trim(),
  };
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function bodyDigest(body) {
  return crypto.createHash("sha256").update(stableStringify(body)).digest("hex");
}

function validHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validPrice(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0;
  if (typeof value !== "string") return false;
  return /^\d+(?:\.\d{1,4})?\s+[A-Z]{3}$/.test(value.trim());
}

function normalizedAvailability(value) {
  return String(value || "").trim().toLowerCase().replace(/[ -]+/g, "_");
}

function issue(severity, code, field, productIndex, productId, message) {
  return {
    severity,
    code,
    field,
    product_index: productIndex,
    product_id: productId || null,
    message,
  };
}

export function validateAuditBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  if (!Array.isArray(body.products)) {
    return { ok: false, error: "Body must contain a products array." };
  }
  if (body.products.length < 1 || body.products.length > MAX_PRODUCTS) {
    return { ok: false, error: `products must contain between 1 and ${MAX_PRODUCTS} rows.` };
  }
  for (let i = 0; i < body.products.length; i += 1) {
    if (!body.products[i] || typeof body.products[i] !== "object" || Array.isArray(body.products[i])) {
      return { ok: false, error: `products[${i}] must be an object.` };
    }
  }
  return { ok: true };
}

export function auditCatalog(products) {
  const issues = [];
  const seenIds = new Map();

  products.forEach((product, index) => {
    const id = String(product.id ?? "").trim();
    const title = String(product.title ?? "").trim();
    const availability = normalizedAvailability(product.availability);

    if (!id) {
      issues.push(issue("error", "missing_id", "id", index, null, "Product id is required."));
    } else if (seenIds.has(id)) {
      issues.push(
        issue(
          "error",
          "duplicate_id",
          "id",
          index,
          id,
          `Product id duplicates row ${seenIds.get(id)}.`,
        ),
      );
    } else {
      seenIds.set(id, index);
    }

    if (!title) {
      issues.push(issue("error", "missing_title", "title", index, id, "Product title is required."));
    } else if (title.length > 150) {
      issues.push(
        issue(
          "warning",
          "long_title",
          "title",
          index,
          id,
          "Title exceeds 150 characters and may be truncated by shopping surfaces.",
        ),
      );
    }

    if (!validHttpUrl(product.link)) {
      issues.push(
        issue("error", "invalid_link", "link", index, id, "link must be an absolute http(s) URL."),
      );
    }

    if (!validHttpUrl(product.image_link)) {
      issues.push(
        issue(
          "error",
          "invalid_image_link",
          "image_link",
          index,
          id,
          "image_link must be an absolute http(s) URL.",
        ),
      );
    }

    if (!validPrice(product.price)) {
      issues.push(
        issue(
          "error",
          "invalid_price",
          "price",
          index,
          id,
          'price must be a non-negative number or a string such as "19.99 USD".',
        ),
      );
    }

    if (!VALID_AVAILABILITY.has(availability)) {
      issues.push(
        issue(
          "error",
          "invalid_availability",
          "availability",
          index,
          id,
          "availability must be in_stock, out_of_stock, preorder, or backorder.",
        ),
      );
    }

    const brand = String(product.brand ?? "").trim();
    const gtin = String(product.gtin ?? "").trim();
    const mpn = String(product.mpn ?? "").trim();
    if (!brand) {
      issues.push(issue("warning", "missing_brand", "brand", index, id, "brand is missing."));
    }
    if (!gtin && !mpn) {
      issues.push(
        issue(
          "warning",
          "missing_identifier",
          "gtin/mpn",
          index,
          id,
          "Neither gtin nor mpn is present; identifier coverage may be weak.",
        ),
      );
    }
  });

  const errors = issues.filter((row) => row.severity === "error").length;
  const warnings = issues.filter((row) => row.severity === "warning").length;
  const denominator = Math.max(1, products.length * 6);
  const score = Math.max(0, Math.round(100 - (errors * 8 + warnings * 2) * (6 / denominator)));

  return {
    service: "PAL Nano Catalog Audit",
    generated_at: new Date().toISOString(),
    summary: {
      products_checked: products.length,
      errors,
      warnings,
      passed: errors === 0,
      score,
    },
    issues,
  };
}

export function buildPaymentQuote(body) {
  const config = getNanoPaymentConfig();
  if (!config.address.startsWith("nano_")) {
    throw new Error("PAL_NANO_ADDRESS is not configured.");
  }
  return {
    error: "payment_required",
    service: "PAL Nano Catalog Audit",
    network: "nano:mainnet",
    asset: "XNO",
    scheme: "pal-nano-hash-v1",
    pay_to: config.address,
    amount_raw: config.priceRaw,
    amount_xno: config.priceXno,
    request_sha256: bodyDigest(body),
    retry: "Send the exact Nano amount, then retry the same JSON request with X-Nano-Payment: <send block hash>.",
  };
}

export function setPublicHeaders(res) {
  res.set({
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Nano-Payment",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
}

function sendQuote(res, body, reason) {
  const quote = buildPaymentQuote(body);
  res.set({
    "X-Payment-Network": quote.network,
    "X-Payment-Asset": quote.asset,
    "X-Payment-Scheme": quote.scheme,
    "X-Payment-Address": quote.pay_to,
    "X-Payment-Amount-Raw": quote.amount_raw,
  });
  setPublicHeaders(res);
  res.status(402).json(reason ? { ...quote, reason } : quote);
}

async function ensurePaymentTable() {
  if (!tableReadyPromise) {
    tableReadyPromise = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS pal_nano_payment_use (
        payment_hash TEXT PRIMARY KEY,
        body_sha256 TEXT NOT NULL,
        response_json JSONB NOT NULL,
        amount_raw TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
  return tableReadyPromise;
}

export async function readPaymentUse(paymentHash) {
  await ensurePaymentTable();
  const rows = await prisma.$queryRawUnsafe(
    "SELECT payment_hash, body_sha256, response_json, amount_raw, created_at FROM pal_nano_payment_use WHERE payment_hash = $1 LIMIT 1",
    paymentHash,
  );
  return rows?.[0] || null;
}

export async function writePaymentUse(paymentHash, digest, result, amountRaw) {
  await ensurePaymentTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO pal_nano_payment_use (payment_hash, body_sha256, response_json, amount_raw)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (payment_hash) DO NOTHING`,
    paymentHash,
    digest,
    JSON.stringify(result),
    String(amountRaw),
  );
  return readPaymentUse(paymentHash);
}

export async function verifyPayment(paymentHash) {
  const config = getNanoPaymentConfig();
  const url = new URL(config.verifyUrl);
  url.searchParams.set("hash", paymentHash);
  url.searchParams.set("to", config.address);
  url.searchParams.set("min_raw", config.priceRaw);

  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "PAL-Nano-Catalog-Audit/1.0" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { ok: false, reason: "Nano verification service is temporarily unavailable." };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: response.status === 404 ? "Payment block was not found." : "Payment could not be verified.",
    };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { ok: false, reason: "Payment verifier returned an unreadable response." };
  }

  let enough = false;
  try {
    enough = BigInt(data.amount_raw || "0") >= BigInt(config.priceRaw);
  } catch {
    enough = false;
  }

  const ok =
    data.ok === true &&
    data.confirmed === true &&
    data.to === config.address &&
    enough;

  return {
    ok,
    reason: ok ? null : data.reason || "Payment does not satisfy the quote.",
    amountRaw: data.amount_raw || null,
    verifier: {
      confirmed: data.confirmed === true,
      from: data.from || null,
      to: data.to || null,
      amount_raw: data.amount_raw || null,
    },
  };
}

export function nanoCatalogAuditMetadata(_req, res) {
  const config = getNanoPaymentConfig();
  setPublicHeaders(res);
  res.status(200).json({
    ok: true,
    service: "PAL Nano Catalog Audit",
    description: "Deterministic product-feed row audit for core shopping-data hygiene.",
    endpoint: "/api/nano/catalog-audit",
    method: "POST",
    network: "nano:mainnet",
    asset: "XNO",
    scheme: "pal-nano-hash-v1",
    price_xno: config.priceXno,
    price_raw: config.priceRaw,
    pay_to: config.address || null,
    max_products: MAX_PRODUCTS,
    payment_header: "X-Nano-Payment",
  });
}

export function nanoCatalogAuditOptions(_req, res) {
  setPublicHeaders(res);
  res.sendStatus(204);
}

export async function nanoCatalogAuditPost(req, res) {
  const validation = validateAuditBody(req.body);
  if (!validation.ok) {
    setPublicHeaders(res);
    return res.status(400).json({ error: "invalid_request", message: validation.error });
  }

  const digest = bodyDigest(req.body);
  const paymentHash = String(req.get("X-Nano-Payment") || "").trim().toUpperCase();

  if (!paymentHash) {
    sendQuote(res, req.body);
    return;
  }
  if (!/^[A-F0-9]{64}$/.test(paymentHash)) {
    sendQuote(res, req.body, "X-Nano-Payment must be a 64-character Nano send-block hash.");
    return;
  }

  try {
    const previous = await readPaymentUse(paymentHash);
    if (previous) {
      if (previous.body_sha256 !== digest) {
        setPublicHeaders(res);
        res.status(409).json({
          error: "payment_reused",
          message: "This Nano payment hash was already used for a different request.",
        });
        return;
      }
      setPublicHeaders(res);
      res.status(200).json(previous.response_json);
      return;
    }

    const verification = await verifyPayment(paymentHash);
    if (!verification.ok) {
      sendQuote(res, req.body, verification.reason);
      return;
    }

    const result = auditCatalog(req.body.products);
    result.payment = {
      network: "nano:mainnet",
      block_hash: paymentHash,
      amount_raw: verification.amountRaw,
      verified: true,
    };
    result.audit_id = crypto
      .createHash("sha256")
      .update(`pal-nano-audit:${paymentHash}:${digest}`)
      .digest("hex")
      .slice(0, 24);

    const stored = await writePaymentUse(paymentHash, digest, result, verification.amountRaw);
    if (!stored || stored.body_sha256 !== digest) {
      setPublicHeaders(res);
      res.status(409).json({
        error: "payment_race",
        message: "Payment was consumed by another request.",
      });
      return;
    }

    setPublicHeaders(res);
    res.status(200).json(stored.response_json);
  } catch (error) {
    console.error("[pal-nano-audit]", error);
    setPublicHeaders(res);
    res.status(503).json({
      error: "service_unavailable",
      message: "The paid audit could not be completed safely. The payment hash has not been intentionally consumed.",
    });
  }
}
