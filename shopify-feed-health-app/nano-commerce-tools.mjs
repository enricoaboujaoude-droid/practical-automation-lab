import crypto from "node:crypto";

import {
  bodyDigest,
  getNanoPaymentConfig,
  readPaymentUse,
  setPublicHeaders,
  verifyPayment,
  writePaymentUse,
} from "./nano-catalog-audit.mjs";
import {
  attachX402Required,
  decodeX402Header,
  nanoX402DiscoveryItems,
  nanoX402Requirements,
  priorNanoX402Use,
  recordNanoX402Use,
  settleNanoX402,
  verifyNanoX402,
  x402PaymentHeader,
} from "./nano-x402.mjs";

const MAX_GTINS = 100;
const MAX_FEED_ROWS = 100;
const X402_VALIDATE_PRICE_RAW = "50000000000000000000000000000";
const X402_VALIDATE_PRICE_XNO = "0.05";
const DIFF_FIELDS = [
  "title",
  "link",
  "image_link",
  "price",
  "availability",
  "brand",
  "gtin",
  "mpn",
];

export const NANO_COMMERCE_SERVICES = Object.freeze([
  {
    id: "catalog-audit",
    name: "PAL Nano Catalog Audit",
    path: "/api/nano/catalog-audit",
    method: "POST",
    description:
      "Deterministic product-feed row QA for identifiers, URLs, price shape, availability and core catalog fields.",
  },
  {
    id: "gtin-check",
    name: "PAL GTIN Check",
    path: "/api/nano/gtin-check",
    method: "POST",
    description:
      "Validate up to 100 GTIN-8, UPC/GTIN-12, GTIN-13 and GTIN-14 identifiers, including check digits.",
  },
  {
    id: "feed-diff",
    name: "PAL Feed Diff",
    path: "/api/nano/feed-diff",
    method: "POST",
    description:
      "Compare two product-feed snapshots and report added, removed and changed commerce fields for up to 100 rows per side.",
  },
  {
    id: "x402-validate",
    name: "PAL x402/Nano Declaration Validator",
    path: "/api/nano/x402-validate",
    method: "POST",
    description:
      "Deterministically validate an x402 v2 declaration for a Nano exact-payment rail without fetching or settling the declared resource.",
    priceRaw: X402_VALIDATE_PRICE_RAW,
    priceXno: X402_VALIDATE_PRICE_XNO,
  },
]);

function paymentDigest(resource, body) {
  return bodyDigest({ resource, body });
}

function buildToolQuote(spec, body) {
  const config = getNanoPaymentConfig();
  if (!config.address.startsWith("nano_")) {
    throw new Error("PAL_NANO_ADDRESS is not configured.");
  }
  const priceRaw = String(spec.priceRaw || config.priceRaw).trim();
  const priceXno = String(spec.priceXno || config.priceXno).trim();
  return {
    error: "payment_required",
    service: spec.name,
    endpoint: spec.path,
    network: "nano:mainnet",
    asset: "XNO",
    scheme: "pal-nano-hash-v1",
    pay_to: config.address,
    amount_raw: priceRaw,
    amount_xno: priceXno,
    request_sha256: paymentDigest(spec.path, body),
    retry:
      "Send the exact Nano amount, then retry the same JSON request with X-Nano-Payment: <send block hash>.",
  };
}

function sendToolQuote(req, res, spec, body, reason) {
  const quote = buildToolQuote(spec, body);
  attachX402Required(req, res, spec, reason);
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

function validArray(value, max) {
  return Array.isArray(value) && value.length >= 1 && value.length <= max;
}

export function validateGtinBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  if (!validArray(body.gtins, MAX_GTINS)) {
    return { ok: false, error: `gtins must contain between 1 and ${MAX_GTINS} values.` };
  }
  for (let index = 0; index < body.gtins.length; index += 1) {
    const value = body.gtins[index];
    if (!["string", "number"].includes(typeof value) || String(value).trim() === "") {
      return { ok: false, error: `gtins[${index}] must be a non-empty string or number.` };
    }
  }
  return { ok: true };
}

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

export function inspectGtin(input) {
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

export function gtinCheck(gtins) {
  const results = gtins.map(inspectGtin);
  const valid = results.filter((item) => item.valid).length;
  return {
    service: "PAL GTIN Check",
    generated_at: new Date().toISOString(),
    summary: {
      checked: results.length,
      valid,
      invalid: results.length - valid,
    },
    results,
  };
}

function validateFeedRows(rows, label) {
  if (!Array.isArray(rows) || rows.length > MAX_FEED_ROWS) {
    return `${label} must be an array with at most ${MAX_FEED_ROWS} rows.`;
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

export function validateFeedDiffBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const beforeError = validateFeedRows(body.before, "before");
  if (beforeError) return { ok: false, error: beforeError };
  const afterError = validateFeedRows(body.after, "after");
  if (afterError) return { ok: false, error: afterError };
  if (body.before.length + body.after.length < 1) {
    return { ok: false, error: "At least one feed snapshot must contain a row." };
  }
  return { ok: true };
}

function fieldValue(row, field) {
  if (!(field in row) || row[field] === null || row[field] === undefined) return null;
  if (typeof row[field] === "string") return row[field].trim();
  if (typeof row[field] === "number" || typeof row[field] === "boolean") return row[field];
  return JSON.stringify(row[field]);
}

export function feedDiff(beforeRows, afterRows) {
  const before = new Map(beforeRows.map((row) => [String(row.id).trim(), row]));
  const after = new Map(afterRows.map((row) => [String(row.id).trim(), row]));

  const added = [...after.keys()].filter((id) => !before.has(id)).sort();
  const removed = [...before.keys()].filter((id) => !after.has(id)).sort();
  const changed = [];

  for (const id of [...before.keys()].filter((key) => after.has(key)).sort()) {
    const changes = [];
    for (const field of DIFF_FIELDS) {
      const oldValue = fieldValue(before.get(id), field);
      const newValue = fieldValue(after.get(id), field);
      if (oldValue !== newValue) {
        changes.push({ field, before: oldValue, after: newValue });
      }
    }
    if (changes.length) changed.push({ id, changes });
  }

  return {
    service: "PAL Feed Diff",
    generated_at: new Date().toISOString(),
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

async function handlePaidTool(req, res, spec, validate, run) {
  const validation = validate(req.body);
  if (!validation.ok) {
    setPublicHeaders(res);
    res.status(400).json({ error: "invalid_request", message: validation.error });
    return;
  }

  const digest = paymentDigest(spec.path, req.body);
  const signatureHeader = x402PaymentHeader(req);

  if (signatureHeader) {
    const decoded = decodeX402Header(signatureHeader);
    if (!decoded.ok) {
      sendToolQuote(req, res, spec, req.body, decoded.error);
      return;
    }

    try {
      const prior = await priorNanoX402Use(decoded.payload, digest);
      if (prior.previous) {
        if (prior.conflict) {
          setPublicHeaders(res);
          res.status(409).json({
            error: "payment_reused",
            message: "This x402 payment was already used for a different request or endpoint.",
          });
          return;
        }
        setPublicHeaders(res);
        res.status(200).json(prior.previous.response_json);
        return;
      }

      const requirements = nanoX402Requirements({ amountRaw: spec.priceRaw });
      const verified = await verifyNanoX402(decoded.payload, requirements);
      if (!verified.ok) {
        sendToolQuote(req, res, spec, req.body, verified.reason);
        return;
      }

      const result = run(req.body);
      const settled = await settleNanoX402(decoded.payload, requirements);
      if (!settled.ok) {
        const retry = await priorNanoX402Use(decoded.payload, digest);
        if (retry.previous && !retry.conflict) {
          setPublicHeaders(res);
          res.status(200).json(retry.previous.response_json);
          return;
        }
        sendToolQuote(req, res, spec, req.body, settled.reason);
        return;
      }

      result.payment = {
        network: "nano:mainnet",
        scheme: "exact",
        protocol: "x402-v2",
        block_hash: settled.transaction,
        amount_raw: requirements.amount,
        payer: settled.payer,
        verified: true,
      };
      result.operation_id = crypto
        .createHash("sha256")
        .update(`pal-nano:${spec.id}:x402:${settled.transaction}:${digest}`)
        .digest("hex")
        .slice(0, 24);

      const stored = await recordNanoX402Use(
        decoded.payload,
        settled.transaction,
        digest,
        result,
        requirements.amount,
      );
      if (
        !stored.payloadRow ||
        stored.payloadRow.body_sha256 !== digest ||
        !stored.transactionRow ||
        stored.transactionRow.body_sha256 !== digest
      ) {
        setPublicHeaders(res);
        res.status(409).json({
          error: "payment_race",
          message: "The x402 payment was consumed by another request.",
        });
        return;
      }

      setPublicHeaders(res);
      res.set("PAYMENT-RESPONSE", Buffer.from(JSON.stringify(settled.data), "utf8").toString("base64"));
      res.status(200).json(stored.payloadRow.response_json);
      return;
    } catch (error) {
      console.error(`[pal-nano-${spec.id}-x402]`, error);
      setPublicHeaders(res);
      res.status(503).json({
        error: "service_unavailable",
        message: "The x402 paid operation could not be completed safely.",
      });
      return;
    }
  }

  const paymentHash = String(req.get("X-Nano-Payment") || "").trim().toUpperCase();

  if (!paymentHash) {
    sendToolQuote(req, res, spec, req.body);
    return;
  }
  if (!/^[A-F0-9]{64}$/.test(paymentHash)) {
    sendToolQuote(
      req,
      res,
      spec,
      req.body,
      "X-Nano-Payment must be a 64-character Nano send-block hash.",
    );
    return;
  }

  try {
    const previous = await readPaymentUse(paymentHash);
    if (previous) {
      if (previous.body_sha256 !== digest) {
        setPublicHeaders(res);
        res.status(409).json({
          error: "payment_reused",
          message: "This Nano payment hash was already used for a different request or endpoint.",
        });
        return;
      }
      setPublicHeaders(res);
      res.status(200).json(previous.response_json);
      return;
    }

    const verification = await verifyPayment(paymentHash, spec.priceRaw || null);
    if (!verification.ok) {
      sendToolQuote(req, res, spec, req.body, verification.reason);
      return;
    }

    const result = run(req.body);
    result.payment = {
      network: "nano:mainnet",
      block_hash: paymentHash,
      amount_raw: verification.amountRaw,
      verified: true,
    };
    result.operation_id = crypto
      .createHash("sha256")
      .update(`pal-nano:${spec.id}:${paymentHash}:${digest}`)
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
    console.error(`[pal-nano-${spec.id}]`, error);
    setPublicHeaders(res);
    res.status(503).json({
      error: "service_unavailable",
      message: "The paid operation could not be completed safely.",
    });
  }
}

function metadataFor(spec) {
  const config = getNanoPaymentConfig();
  return {
    ok: true,
    service: spec.name,
    description: spec.description,
    endpoint: spec.path,
    method: spec.method,
    network: "nano:mainnet",
    asset: "XNO",
    schemes: ["exact", "pal-nano-hash-v1"],
    x402_version: 2,
    price_xno: String(spec.priceXno || config.priceXno).trim(),
    price_raw: String(spec.priceRaw || config.priceRaw).trim(),
    pay_to: config.address || null,
    payment_headers: ["PAYMENT-SIGNATURE", "X-Nano-Payment"],
  };
}


function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function declarationPayload(body) {
  if (plainObject(body?.declaration)) return body.declaration;
  if (plainObject(body?.payment_required)) return body.payment_required;
  return body;
}

function validAbsoluteHttpUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validNanoAddressShape(value) {
  return /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(String(value || "").trim());
}

function declarationFinding(findings, severity, code, path, message) {
  findings.push({ severity, code, path, message });
}

export function validateX402DeclarationBody(body) {
  if (!plainObject(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  if ("declaration" in body && !plainObject(body.declaration)) {
    return { ok: false, error: "declaration must be a JSON object when supplied." };
  }
  if ("payment_required" in body && !plainObject(body.payment_required)) {
    return { ok: false, error: "payment_required must be a JSON object when supplied." };
  }
  return { ok: true };
}

export function inspectX402Declaration(body) {
  const declaration = declarationPayload(body);
  const findings = [];

  if (declaration.x402Version !== 2) {
    declarationFinding(
      findings,
      "error",
      "x402_version",
      "x402Version",
      "x402Version must be the number 2.",
    );
  }

  const resource = declaration.resource;
  if (!plainObject(resource)) {
    declarationFinding(findings, "error", "resource_missing", "resource", "resource must be an object.");
  } else if (!validAbsoluteHttpUrl(resource.url)) {
    declarationFinding(
      findings,
      "error",
      "resource_url",
      "resource.url",
      "resource.url must be an absolute http(s) URL.",
    );
  }

  const accepts = declaration.accepts;
  let nanoAccepts = 0;
  const seenNanoAccepts = new Set();

  if (!Array.isArray(accepts) || accepts.length < 1) {
    declarationFinding(
      findings,
      "error",
      "accepts_missing",
      "accepts",
      "accepts must be a non-empty array.",
    );
  } else if (accepts.length > 20) {
    declarationFinding(
      findings,
      "error",
      "accepts_too_large",
      "accepts",
      "accepts may contain at most 20 entries for this validator.",
    );
  }

  if (Array.isArray(accepts)) {
    accepts.slice(0, 20).forEach((accept, index) => {
      const base = `accepts[${index}]`;
      if (!plainObject(accept)) {
        declarationFinding(findings, "error", "accept_not_object", base, "accept entry must be an object.");
        return;
      }

      if (accept.network !== "nano:mainnet") return;
      nanoAccepts += 1;

      if (accept.scheme !== "exact") {
        declarationFinding(
          findings,
          "error",
          "nano_scheme",
          `${base}.scheme`,
          'nano:mainnet must use scheme "exact".',
        );
      }

      if (accept.asset !== "XNO") {
        declarationFinding(
          findings,
          "error",
          "nano_asset",
          `${base}.asset`,
          'nano:mainnet must declare asset "XNO".',
        );
      }

      if (!/^[1-9]\d*$/.test(String(accept.amount ?? ""))) {
        declarationFinding(
          findings,
          "error",
          "nano_amount",
          `${base}.amount`,
          "amount must be a positive base-10 integer in raw.",
        );
      }

      if (!validNanoAddressShape(accept.payTo)) {
        declarationFinding(
          findings,
          "error",
          "nano_pay_to",
          `${base}.payTo`,
          "payTo must have the shape of a Nano mainnet address.",
        );
      }

      if (!Number.isInteger(accept.maxTimeoutSeconds) || accept.maxTimeoutSeconds <= 0) {
        declarationFinding(
          findings,
          "error",
          "nano_timeout",
          `${base}.maxTimeoutSeconds`,
          "maxTimeoutSeconds must be a positive integer.",
        );
      }

      if ("extra" in accept && !plainObject(accept.extra)) {
        declarationFinding(
          findings,
          "error",
          "nano_extra",
          `${base}.extra`,
          "extra must be an object when supplied.",
        );
      } else if (plainObject(accept.extra)) {
        const work = accept.extra.work;
        if (work !== undefined && !["required", "optional"].includes(work)) {
          declarationFinding(
            findings,
            "error",
            "nano_work_mode",
            `${base}.extra.work`,
            'extra.work must be "required" or "optional" when supplied.',
          );
        }
        if (
          work === "required" &&
          !/^[0-9a-fA-F]{16}$/.test(String(accept.extra.workThreshold || ""))
        ) {
          declarationFinding(
            findings,
            "error",
            "nano_work_threshold",
            `${base}.extra.workThreshold`,
            "required work must include a 16-hex-character workThreshold.",
          );
        }
      }

      const duplicateKey = [
        String(accept.scheme || ""),
        String(accept.amount || ""),
        String(accept.payTo || ""),
      ].join("|");
      if (seenNanoAccepts.has(duplicateKey)) {
        declarationFinding(
          findings,
          "warning",
          "duplicate_nano_accept",
          base,
          "This Nano accept duplicates an earlier scheme/amount/payTo tuple.",
        );
      }
      seenNanoAccepts.add(duplicateKey);
    });
  }

  if (nanoAccepts === 0) {
    declarationFinding(
      findings,
      "error",
      "nano_accept_missing",
      "accepts",
      'No accept entry declares network "nano:mainnet".',
    );
  }

  const method = typeof body.method === "string" ? body.method.trim().toUpperCase() : null;
  if (method && !/^[A-Z]+$/.test(method)) {
    declarationFinding(
      findings,
      "warning",
      "method_shape",
      "method",
      "method metadata should be an HTTP method token such as GET or POST.",
    );
  }

  const paymentHeaders = body.payment_headers;
  if (paymentHeaders !== undefined) {
    if (!Array.isArray(paymentHeaders) || paymentHeaders.some((value) => typeof value !== "string")) {
      declarationFinding(
        findings,
        "error",
        "payment_headers_shape",
        "payment_headers",
        "payment_headers must be an array of strings when supplied.",
      );
    } else if (
      !paymentHeaders.some((value) => String(value).trim().toUpperCase() === "PAYMENT-SIGNATURE")
    ) {
      declarationFinding(
        findings,
        "warning",
        "payment_signature_header_missing",
        "payment_headers",
        "Metadata does not list PAYMENT-SIGNATURE as an accepted payment header.",
      );
    }
  }

  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;

  return {
    service: "PAL x402/Nano Declaration Validator",
    generated_at: new Date().toISOString(),
    scope:
      "Static declaration validation only. No resource is fetched, no payment is made, and liveness or funding is not established.",
    verdict: errors > 0 ? "invalid" : warnings > 0 ? "valid_with_warnings" : "valid",
    summary: {
      valid: errors === 0,
      errors,
      warnings,
      accepts_checked: Array.isArray(accepts) ? Math.min(accepts.length, 20) : 0,
      nano_accepts: nanoAccepts,
    },
    method,
    resource_url: plainObject(resource) && typeof resource.url === "string" ? resource.url : null,
    findings,
  };
}

const GTIN_SPEC = NANO_COMMERCE_SERVICES.find((item) => item.id === "gtin-check");
const FEED_DIFF_SPEC = NANO_COMMERCE_SERVICES.find((item) => item.id === "feed-diff");
const X402_VALIDATE_SPEC = NANO_COMMERCE_SERVICES.find((item) => item.id === "x402-validate");

export function nanoCommerceManifest(_req, res) {
  const config = getNanoPaymentConfig();
  setPublicHeaders(res);
  res.status(200).json({
    ok: true,
    merchant: "Practical Automation Lab",
    network: "nano:mainnet",
    asset: "XNO",
    pay_to: config.address || null,
    schemes: ["exact", "pal-nano-hash-v1"],
    x402_version: 2,
    facilitator: "https://facilitator.pursekeeper.dev",
    price_xno: config.priceXno,
    services: NANO_COMMERCE_SERVICES,
    flow: [
      "Standard x402 v2: read PAYMENT-REQUIRED, sign the accepted nano:mainnet exact payment, retry with PAYMENT-SIGNATURE.",
      "Compatibility rail: send the exact XNO amount to pay_to, then retry the identical JSON with X-Nano-Payment set to the confirmed send-block hash.",
    ],
    x402_discovery: "/.well-known/x402",
    agent_docs: "/llms.txt",
  });
}

export function nanoGtinMetadata(_req, res) {
  setPublicHeaders(res);
  res.status(200).json({ ...metadataFor(GTIN_SPEC), max_gtins: MAX_GTINS });
}

export function nanoFeedDiffMetadata(_req, res) {
  setPublicHeaders(res);
  res.status(200).json({ ...metadataFor(FEED_DIFF_SPEC), max_rows_per_snapshot: MAX_FEED_ROWS });
}

export function nanoX402ValidateMetadata(_req, res) {
  setPublicHeaders(res);
  res.status(200).json({
    ...metadataFor(X402_VALIDATE_SPEC),
    scope:
      "Static declaration validation only; no declared resource is fetched and no payment or settlement is attempted.",
    input:
      "Send an x402 v2 PaymentRequired object directly, or wrap it as { declaration, method?, payment_headers? }.",
  });
}

export function nanoCommerceOptions(_req, res) {
  setPublicHeaders(res);
  res.sendStatus(204);
}

export async function nanoGtinPost(req, res) {
  await handlePaidTool(req, res, GTIN_SPEC, validateGtinBody, (body) => gtinCheck(body.gtins));
}

export async function nanoFeedDiffPost(req, res) {
  await handlePaidTool(req, res, FEED_DIFF_SPEC, validateFeedDiffBody, (body) =>
    feedDiff(body.before, body.after),
  );
}

export async function nanoX402ValidatePost(req, res) {
  await handlePaidTool(
    req,
    res,
    X402_VALIDATE_SPEC,
    validateX402DeclarationBody,
    inspectX402Declaration,
  );
}


export function nanoX402WellKnown(req, res) {
  const proto = String(req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim();
  const host = String(req.get("x-forwarded-host") || req.get("host") || "pal-catalog-check-app.onrender.com").split(",")[0].trim();
  const baseUrl = `${proto}://${host}`;
  setPublicHeaders(res);
  res.status(200).json({
    x402Version: 2,
    items: nanoX402DiscoveryItems(baseUrl, NANO_COMMERCE_SERVICES),
    docs: `${baseUrl}/llms.txt`,
    merchant: "Practical Automation Lab",
  });
}
