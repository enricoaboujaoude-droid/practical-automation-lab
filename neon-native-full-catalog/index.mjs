// PAL Full Catalog Remediation: native Neon Functions replacement for the original
// source: nano-seller/server.js (branch nano-seller).
// Upstream marketplace handles billing; direct URL does NOT verify a direct USDC payment.
function nowIso(){return new Date().toISOString();}
function cleanString(value){return typeof value==="string"?value.trim():"";}
function validHttpUrl(value){try{const u=new URL(value);return u.protocol==="http:"||u.protocol==="https:";}catch{return false;}}
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
    const description = cleanString(row.description ?? row.body_html ?? row.body);
    const productType = cleanString(row.product_type ?? row.google_product_category ?? row.category);
    const link = cleanString(row.link);
    const imageLink = cleanString(row.image_link);
    const imageAlt = cleanString(row.image_alt ?? row.alt_text ?? row.image_alt_text);
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
    if (!description) {
      add("AIEO_DESCRIPTION_MISSING", "description", "Product description is empty, limiting the factual context available to AI shopping systems.", "warning");
    } else if (description.length < 80) {
      add("AIEO_DESCRIPTION_THIN", "description", "Product description is very short for reliable AI product understanding.", "warning");
    }
    if (!productType) {
      add("AIEO_PRODUCT_TYPE_MISSING", "product_type", "Product type/category context is missing, making machine classification less reliable.", "warning");
    }
    if (!brand) {
      add("AIEO_BRAND_MISSING", "brand", "Brand/vendor is missing, reducing product identity context for AI commerce.", "warning");
    }
    if (!price) {
      add("AIEO_PRICE_MISSING", "price", "Price is missing, preventing reliable machine comparison and purchase readiness.", "warning");
    }
    if (!availability) {
      add("AIEO_AVAILABILITY_MISSING", "availability", "Availability is missing, preventing AI systems from knowing whether the product can currently be purchased.", "warning");
    }
    if (imageLink && !imageAlt) {
      add("AIEO_IMAGE_ALT_MISSING", "image_alt", "Product image has no descriptive alt text in this record.", "warning");
    }

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

function catalogRemediationPlan(records) {
  const auditResult = audit(records);
  const rules = {
    ID_MISSING: {
      priority: "critical",
      action: "Assign a stable, unique product id before feed submission; do not reuse IDs across variants.",
    },
    ID_DUPLICATE: {
      priority: "critical",
      action: "Deduplicate product IDs and preserve one stable ID per sellable item or variant.",
    },
    IDENTIFIER_MISSING: {
      priority: "high",
      action: "Supply a valid GTIN when available, otherwise provide brand plus MPN and set identifier_exists consistently.",
    },
    GTIN_FORMAT_INVALID: {
      priority: "high",
      action: "Replace malformed GTIN values with a valid 8, 12, 13, or 14 digit identifier or remove the invalid identifier.",
    },
    GTIN_CHECKSUM_INVALID: {
      priority: "high",
      action: "Correct the GTIN using the manufacturer-issued identifier; do not generate or guess a replacement GTIN.",
    },
    TITLE_MISSING: {
      priority: "high",
      action: "Add a clear product title that identifies the product and differentiates the variant.",
    },
    AIEO_DESCRIPTION_MISSING: {
      priority: "high",
      action: "Add a factual product description covering what the item is, important materials/specifications, intended use, compatibility or fit where relevant. Avoid keyword stuffing.",
    },
    AIEO_DESCRIPTION_THIN: {
      priority: "medium",
      action: "Expand the product description with accurate product-specific details that help AI systems distinguish and compare the item.",
    },
    AIEO_PRODUCT_TYPE_MISSING: {
      priority: "medium",
      action: "Assign an accurate product type or taxonomy category so AI shopping systems have explicit classification context.",
    },
    AIEO_BRAND_MISSING: {
      priority: "medium",
      action: "Add the real brand/vendor when applicable so AI systems can identify the product source consistently.",
    },
    AIEO_PRICE_MISSING: {
      priority: "high",
      action: "Provide a current sell price with currency so machine buyers can compare and evaluate the product.",
    },
    AIEO_AVAILABILITY_MISSING: {
      priority: "high",
      action: "Provide current availability so AI shopping systems can avoid recommending products that cannot be purchased.",
    },
    AIEO_IMAGE_ALT_MISSING: {
      priority: "low",
      action: "Add concise factual image alt text describing the product and meaningful visible attributes; do not keyword-stuff.",
    },
    LINK_INVALID: {
      priority: "high",
      action: "Replace the product link with a public absolute HTTPS product URL.",
    },
    IMAGE_LINK_INVALID: {
      priority: "high",
      action: "Replace the image link with a public absolute HTTPS image URL.",
    },
    PRICE_FORMAT_INVALID: {
      priority: "high",
      action: "Normalize price to a numeric amount followed by an uppercase ISO-4217 currency code, for example 19.99 USD.",
    },
    BRAND_MISSING_FOR_MPN: {
      priority: "medium",
      action: "Add the product brand whenever an MPN is supplied so the identifier pair is complete.",
    },
    AVAILABILITY_UNRECOGNIZED: {
      priority: "medium",
      action: "Normalize availability to in_stock, out_of_stock, preorder, or backorder.",
    },
  };
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  const grouped = new Map();

  for (const issue of auditResult.issues) {
    const rule = rules[issue.code] || {
      priority: issue.severity === "error" ? "high" : "medium",
      action: issue.message,
    };
    const current = grouped.get(issue.code) || {
      code: issue.code,
      priority: rule.priority,
      action: rule.action,
      occurrences: 0,
      affected_product_ids: new Set(),
      affected_rows: new Set(),
    };
    current.occurrences += 1;
    if (issue.id) current.affected_product_ids.add(issue.id);
    current.affected_rows.add(issue.index);
    grouped.set(issue.code, current);
  }

  const prioritizedActions = [...grouped.values()]
    .map((item) => ({
      code: item.code,
      priority: item.priority,
      action: item.action,
      occurrences: item.occurrences,
      affected_product_ids: [...item.affected_product_ids].slice(0, 100),
      affected_rows: [...item.affected_rows].sort((a, b) => a - b),
    }))
    .sort(
      (a, b) =>
        (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
        b.occurrences - a.occurrences ||
        a.code.localeCompare(b.code),
    );

  const readiness =
    auditResult.error_count > 0
      ? "needs_remediation"
      : auditResult.warning_count > 0
        ? "ready_with_warnings"
        : "ready";

  return {
    service: "PAL AIEO Catalog Remediation Plan",
    generated_at: nowIso(),
    readiness,
    summary: {
      records: auditResult.record_count,
      issues: auditResult.issue_count,
      errors: auditResult.error_count,
      warnings: auditResult.warning_count,
      actions: prioritizedActions.length,
      critical_actions: prioritizedActions.filter((item) => item.priority === "critical").length,
      high_actions: prioritizedActions.filter((item) => item.priority === "high").length,
    },
    prioritized_actions: prioritizedActions,
    audit: auditResult,
    disclaimer:
      "AIEO readiness findings are deterministic catalog-quality signals, not guarantees of ranking, recommendation, inclusion, or approval by ChatGPT, Google, Shopify, or any other AI or commerce platform.",
  };
}
const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"*","access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"content-type"};
const service="PAL Full Catalog Remediation";
const limits={records_per_call:2000,request_body_bytes:4_000_000};
const metadata={ok:true,ready:true,service,marketplace:"AgenticTrade",method:"POST",billing:"handled_upstream",price_per_call_usdc:"20",capabilities:["full-catalog-remediation","merchant-center-readiness","product-feed-validation","gtin-validation","duplicate-id-detection","prioritized-corrective-actions"],limits,input:{messages:[{role:"user",content:'{"records":[{"id":"sku-100","title":"Example Product","gtin":"4006381333931","brand":"Example","mpn":"SKU-100","price":"19.99 USD","availability":"in_stock","identifier_exists":true}]}'}]}};
const send=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
export default async function handler(req) {
 const path=new URL(req.url).pathname;
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method==="GET" && (path==="/health"||path==="/"))return send({ok:true,service,status:"ready",marketplace:"AgenticTrade",method:"POST",path:"/v1/agentpay-remediation-bulk",billing:"handled_upstream"});
 if(req.method==="GET" && path==="/v1/agentpay-remediation-bulk")return send(metadata);
 if(path!=="/v1/agentpay-remediation-bulk" && !(path==="/" && req.method==="POST"))return send({error:"not_found"},404);
 if(req.method!=="POST")return send({error:"method_not_allowed"},405);
 let body;
 try{
  let type=req.headers.get("content-type")||"";
  if(!type.includes("application/json"))return send({error:"content_type_must_be_json"},415);
  const len=Number(req.headers.get("content-length")||0);if(len>limits.request_body_bytes)return send({error:"body_too_large"},413);
  const raw=await req.text();if(raw.length>limits.request_body_bytes)return send({error:"body_too_large"},413);
  body=JSON.parse(raw);
 }catch{return send({error:"invalid_json"},400);}
 const records=extractAgentPayRecords(body?.messages);
 if(!records)return send({ok:false,ready:true,service,error:"catalog_payload_required",detail:'Send a messages array whose message content is JSON containing {"records":[...]} or a JSON array of records.',limits});
 if(records.length<1||records.length>limits.records_per_call)return send({error:"invalid_records",detail:"Catalog payload must contain 1 to 2,000 records."},400);
 try{const result=catalogRemediationPlan(records);return send({...result,marketplace:{provider:"AgenticTrade",billing:"handled_upstream",price_per_call_usdc:"20"},generated_at:nowIso()});}catch{return send({error:"catalog_remediation_failed"},500);}
}