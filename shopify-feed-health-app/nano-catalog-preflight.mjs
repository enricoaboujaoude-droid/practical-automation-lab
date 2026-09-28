import crypto from "node:crypto";

const DEFAULT_PRICE_RAW = "10000000000000000000000000000"; // 0.01 XNO
const DEFAULT_PRICE_XNO = "0.01";
const DEFAULT_VERIFY_URL = "https://pursekeeper.dev/v1/verify";
const MAX_PRODUCTS = 100;
const REPLAY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function quoteDigest(body) {
  return crypto.createHash("sha256").update(stableJson(body)).digest("hex");
}

function asText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeKey(value) {
  return asText(value).toLowerCase();
}

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readImage(product) {
  return asText(product.image_url ?? product.imageUrl ?? product.image ?? product.featured_image);
}

function readBrand(product) {
  return asText(product.brand ?? product.vendor);
}

function readGtin(product) {
  return asText(product.gtin ?? product.barcode ?? product.upc ?? product.ean);
}

function readAvailability(product) {
  return normalizeKey(product.availability ?? product.status ?? product.inventory_status);
}

function pushIssue(issues, severity, code, message, field) {
  issues.push({ severity, code, message, ...(field ? { field } : {}) });
}

export function validateCatalogInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  if (!Array.isArray(body.products)) {
    return { ok: false, error: "products must be an array." };
  }
  if (body.products.length === 0) {
    return { ok: false, error: "products must contain at least one product." };
  }
  if (body.products.length > MAX_PRODUCTS) {
    return { ok: false, error: `products may contain at most ${MAX_PRODUCTS} items.` };
  }
  const badIndex = body.products.findIndex(
    (product) => !product || typeof product !== "object" || Array.isArray(product),
  );
  if (badIndex >= 0) {
    return { ok: false, error: `products[${badIndex}] must be an object.` };
  }
  return { ok: true };
}

export function auditCatalog(body) {
  const validation = validateCatalogInput(body);
  if (!validation.ok) throw new TypeError(validation.error);

  const rows = body.products.map((product, index) => {
    const issues = [];
    const title = asText(product.title ?? product.name);
    const handle = asText(product.handle ?? product.slug);
    const sku = asText(product.sku);
    const gtin = readGtin(product);
    const brand = readBrand(product);
    const mpn = asText(product.mpn);
    const image = readImage(product);
    const currency = asText(product.currency).toUpperCase();
    const availability = readAvailability(product);
    const rawPrice = product.price ?? product.amount;
    const price = typeof rawPrice === "number" ? rawPrice : Number(asText(rawPrice));

    if (!title) pushIssue(issues, "error", "missing_title", "Product title is missing.", "title");
    else if (title.length > 150) pushIssue(issues, "warning", "long_title", "Product title exceeds 150 characters.", "title");

    if (!Number.isFinite(price) || price <= 0) {
      pushIssue(issues, "error", "invalid_price", "Price must be a positive number.", "price");
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      pushIssue(issues, "warning", "currency_format", "Currency should be a three-letter code such as USD or EUR.", "currency");
    }

    if (!availability) {
      pushIssue(issues, "warning", "missing_availability", "Availability is missing.", "availability");
    } else if (!new Set(["in stock", "instock", "out of stock", "outofstock", "preorder", "backorder"]).has(availability)) {
      pushIssue(issues, "warning", "availability_format", "Availability uses a non-standard value; normalize it before feed export.", "availability");
    }

    if (!image) {
      pushIssue(issues, "warning", "missing_image", "Primary product image is missing.", "image");
    } else if (!validHttpUrl(image)) {
      pushIssue(issues, "error", "invalid_image_url", "Primary image must be an absolute HTTP(S) URL.", "image");
    }

    if (gtin) {
      if (!/^\d+$/.test(gtin) || ![8, 12, 13, 14].includes(gtin.length)) {
        pushIssue(issues, "error", "invalid_gtin", "GTIN/barcode should contain 8, 12, 13, or 14 digits.", "gtin");
      }
    } else if (!brand || !mpn) {
      pushIssue(
        issues,
        "warning",
        "weak_identifier_evidence",
        "No GTIN is present and the brand + MPN pair is incomplete; verify identifier coverage before syndication.",
        "gtin",
      );
    }

    if (!sku) pushIssue(issues, "warning", "missing_sku", "SKU is missing; this can make variant reconciliation harder.", "sku");
    if (!handle) pushIssue(issues, "warning", "missing_handle", "Stable handle/slug is missing.", "handle");

    return {
      index,
      id: asText(product.id) || null,
      title: title || null,
      handle: handle || null,
      sku: sku || null,
      gtin: gtin || null,
      issues,
    };
  });

  for (const field of ["handle", "sku", "gtin"]) {
    const seen = new Map();
    for (const row of rows) {
      const value = normalizeKey(row[field]);
      if (!value) continue;
      const prior = seen.get(value);
      if (prior == null) {
        seen.set(value, row.index);
        continue;
      }
      pushIssue(
        row.issues,
        "error",
        `duplicate_${field}`,
        `${field.toUpperCase()} duplicates products[${prior}].`,
        field,
      );
      pushIssue(
        rows[prior].issues,
        "error",
        `duplicate_${field}`,
        `${field.toUpperCase()} duplicates products[${row.index}].`,
        field,
      );
    }
  }

  let errors = 0;
  let warnings = 0;
  for (const row of rows) {
    errors += row.issues.filter((issue) => issue.severity === "error").length;
    warnings += row.issues.filter((issue) => issue.severity === "warning").length;
  }

  const clean = rows.filter((row) => row.issues.length === 0).length;
  const score = Math.max(0, Math.round(100 - errors * 12 - warnings * 3));

  return {
    service: "PAL Catalog Preflight",
    generated_at: new Date().toISOString(),
    summary: {
      products_checked: rows.length,
      clean_products: clean,
      errors,
      warnings,
      score,
    },
    rows,
    disclaimer: "Preflight diagnostics only; marketplace and merchant-center policies can change and may require additional checks.",
  };
}

function paymentRequired(res, { payTo, priceRaw, priceXno, quote, error }) {
  res.set("Cache-Control", "no-store");
  return res.status(402).json({
    error: error || "payment_required",
    scheme: "pal-nano-hash-v1",
    network: "nano:mainnet",
    asset: "XNO",
    pay_to: payTo,
    amount_raw: priceRaw,
    amount_xno: priceXno,
    quote,
    payment_header: "X-Nano-Payment",
    retry: "Repeat the identical JSON body with X-Nano-Payment set to the confirmed Nano send-block hash.",
  });
}

export function registerNanoCatalogPreflight(app, options = {}) {
  const payTo = options.payTo ?? process.env.NANO_PAY_TO ?? "";
  const priceRaw = options.priceRaw ?? process.env.NANO_CATALOG_PRICE_RAW ?? DEFAULT_PRICE_RAW;
  const priceXno = options.priceXno ?? process.env.NANO_CATALOG_PRICE_XNO ?? DEFAULT_PRICE_XNO;
  const verifyUrl = options.verifyUrl ?? process.env.NANO_VERIFY_URL ?? DEFAULT_VERIFY_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const consumed = new Map();
  const pending = new Map();

  const prune = () => {
    const cutoff = Date.now() - REPLAY_TTL_MS;
    for (const [hash, record] of consumed) {
      if (record.at < cutoff) consumed.delete(hash);
    }
  };

  app.get("/api/nano/catalog-preflight", (_req, res) => {
    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      service: "PAL Catalog Preflight",
      configured: Boolean(payTo),
      network: "nano:mainnet",
      asset: "XNO",
      price_xno: priceXno,
      price_raw: priceRaw,
      pay_to: payTo || null,
      method: "POST",
      max_products: MAX_PRODUCTS,
      payment_header: "X-Nano-Payment",
      input: {
        products: [
          {
            id: "optional",
            title: "required",
            handle: "recommended",
            sku: "recommended",
            gtin: "optional",
            brand: "recommended when GTIN is absent",
            mpn: "recommended when GTIN is absent",
            price: 19.99,
            currency: "USD",
            availability: "in stock",
            image_url: "https://example.com/image.jpg",
          },
        ],
      },
    });
  });

  app.post("/api/nano/catalog-preflight", async (req, res) => {
    res.set("Cache-Control", "no-store");

    if (!payTo) {
      return res.status(503).json({ error: "nano_payment_not_configured" });
    }

    const validation = validateCatalogInput(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: "invalid_input", message: validation.error });
    }

    const quote = quoteDigest(req.body);
    const paymentHash = asText(req.get("X-Nano-Payment")).toUpperCase();
    if (!paymentHash) return paymentRequired(res, { payTo, priceRaw, priceXno, quote });
    if (!/^[0-9A-F]{64}$/.test(paymentHash)) {
      return paymentRequired(res, { payTo, priceRaw, priceXno, quote, error: "payment_hash_invalid" });
    }

    prune();
    const prior = consumed.get(paymentHash);
    if (prior) {
      if (prior.quote !== quote) {
        return paymentRequired(res, { payTo, priceRaw, priceXno, quote, error: "payment_reused" });
      }
      return res.status(200).json({ ...prior.result, payment: { hash: paymentHash, idempotent_replay: true } });
    }

    if (pending.has(paymentHash)) await pending.get(paymentHash);
    const afterWait = consumed.get(paymentHash);
    if (afterWait) {
      if (afterWait.quote !== quote) {
        return paymentRequired(res, { payTo, priceRaw, priceXno, quote, error: "payment_reused" });
      }
      return res.status(200).json({ ...afterWait.result, payment: { hash: paymentHash, idempotent_replay: true } });
    }

    let release;
    pending.set(paymentHash, new Promise((resolve) => (release = resolve)));
    try {
      const url = new URL(verifyUrl);
      url.searchParams.set("hash", paymentHash);
      url.searchParams.set("to", payTo);
      url.searchParams.set("min_raw", priceRaw);
      const verifyResponse = await fetchImpl(url, { headers: { accept: "application/json" } });
      if (!verifyResponse.ok) {
        return res.status(502).json({ error: "payment_verifier_unavailable" });
      }
      const verification = await verifyResponse.json();
      if (!(verification?.ok === true && verification?.confirmed === true)) {
        return paymentRequired(res, { payTo, priceRaw, priceXno, quote, error: "payment_not_confirmed" });
      }

      const result = auditCatalog(req.body);
      consumed.set(paymentHash, { quote, result, at: Date.now() });
      return res.status(200).json({
        ...result,
        payment: {
          hash: paymentHash,
          from: verification.from ?? null,
          amount_nano: verification.amount_nano ?? null,
          idempotent_replay: false,
        },
      });
    } catch {
      return res.status(502).json({ error: "payment_verifier_unavailable" });
    } finally {
      release?.();
      pending.delete(paymentHash);
    }
  });
}
