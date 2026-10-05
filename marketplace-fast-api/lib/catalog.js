export function cleanString(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

export function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function gtinChecksumValid(raw) {
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

export function audit(records) {
  const issues = [];
  const ids = new Map();
  const allowedAvailability = new Set(["in_stock","out_of_stock","preorder","backorder"]);

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

    const add = (code, field, message, severity = "error") =>
      issues.push({ index, id: id || null, severity, code, field, message });

    if (!id) add("ID_MISSING","id","Product id is empty.");
    if (!title) add("TITLE_MISSING","title","Product title is empty.");

    if (id) {
      if (ids.has(id)) add("ID_DUPLICATE","id",`Duplicate id; first seen at row ${ids.get(id)}.`);
      else ids.set(id,index);
    }

    if (link && !validHttpUrl(link)) add("LINK_INVALID","link","Product link must be an absolute HTTP(S) URL.");
    if (imageLink && !validHttpUrl(imageLink)) add("IMAGE_LINK_INVALID","image_link","Image link must be an absolute HTTP(S) URL.");

    if (gtin) {
      if (!/^\d+$/.test(gtin) || ![8,12,13,14].includes(gtin.length)) {
        add("GTIN_FORMAT_INVALID","gtin","GTIN must contain 8, 12, 13, or 14 digits.");
      } else if (!gtinChecksumValid(gtin)) {
        add("GTIN_CHECKSUM_INVALID","gtin","GTIN checksum does not validate.");
      }
    }

    if (mpn && !brand) add("BRAND_MISSING_FOR_MPN","brand","Brand is missing while MPN is present.","warning");
    if (row.identifier_exists === true && !gtin && !mpn) {
      add("IDENTIFIER_MISSING","gtin","identifier_exists is true but neither GTIN nor MPN is present.");
    }
    if (price && !/^\d+(?:\.\d{1,4})?\s[A-Z]{3}$/.test(price)) {
      add("PRICE_FORMAT_INVALID","price","Price should look like '19.99 USD' with an uppercase 3-letter currency.");
    }
    if (availability && !allowedAvailability.has(availability)) {
      add("AVAILABILITY_UNRECOGNIZED","availability","Availability should be in_stock, out_of_stock, preorder, or backorder.","warning");
    }
  });

  const errors = issues.filter(x=>x.severity==="error").length;
  const warnings = issues.filter(x=>x.severity==="warning").length;
  return {
    ok: errors === 0,
    record_count: records.length,
    issue_count: issues.length,
    error_count: errors,
    warning_count: warnings,
    issues
  };
}

export function remediation(records) {
  const auditResult = audit(records);
  const rules = {
    ID_MISSING:["critical","Assign a stable, unique product id before feed submission; do not reuse IDs across variants."],
    ID_DUPLICATE:["critical","Deduplicate product IDs and preserve one stable ID per sellable item or variant."],
    IDENTIFIER_MISSING:["high","Supply a valid GTIN when available, otherwise provide brand plus MPN and set identifier_exists consistently."],
    GTIN_FORMAT_INVALID:["high","Replace malformed GTIN values with a valid 8, 12, 13, or 14 digit identifier or remove the invalid identifier."],
    GTIN_CHECKSUM_INVALID:["high","Correct the GTIN using the manufacturer-issued identifier; do not generate or guess a replacement GTIN."],
    TITLE_MISSING:["high","Add a clear product title that identifies the product and differentiates the variant."],
    LINK_INVALID:["high","Replace the product link with a public absolute HTTPS product URL."],
    IMAGE_LINK_INVALID:["high","Replace the image link with a public absolute HTTPS image URL."],
    PRICE_FORMAT_INVALID:["high","Normalize price to a numeric amount followed by an uppercase ISO-4217 currency code, for example 19.99 USD."],
    BRAND_MISSING_FOR_MPN:["medium","Add the product brand whenever an MPN is supplied so the identifier pair is complete."],
    AVAILABILITY_UNRECOGNIZED:["medium","Normalize availability to in_stock, out_of_stock, preorder, or backorder."]
  };
  const rank={critical:0,high:1,medium:2,low:3};
  const grouped=new Map();

  for(const issue of auditResult.issues){
    const [priority,action]=rules[issue.code] || [issue.severity==="error"?"high":"medium",issue.message];
    const current=grouped.get(issue.code) || {
      code:issue.code,priority,action,occurrences:0,affected_product_ids:new Set(),affected_rows:new Set()
    };
    current.occurrences += 1;
    if(issue.id) current.affected_product_ids.add(issue.id);
    current.affected_rows.add(issue.index);
    grouped.set(issue.code,current);
  }

  const prioritized_actions=[...grouped.values()].map(item=>({
    code:item.code,
    priority:item.priority,
    action:item.action,
    occurrences:item.occurrences,
    affected_product_ids:[...item.affected_product_ids].slice(0,100),
    affected_rows:[...item.affected_rows].sort((a,b)=>a-b)
  })).sort((a,b)=>(rank[a.priority]??9)-(rank[b.priority]??9)||b.occurrences-a.occurrences||a.code.localeCompare(b.code));

  return {
    service:"PAL Catalog Remediation Plan",
    readiness:auditResult.error_count>0?"needs_remediation":auditResult.warning_count>0?"ready_with_warnings":"ready",
    summary:{
      records:auditResult.record_count,
      issues:auditResult.issue_count,
      errors:auditResult.error_count,
      warnings:auditResult.warning_count,
      actions:prioritized_actions.length
    },
    prioritized_actions,
    audit:auditResult
  };
}

export function extractAgentPayRecords(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const content = messages[i]?.content;
    if (content && typeof content === "object" && !Array.isArray(content) && Array.isArray(content.records)) return content.records;
    if (typeof content !== "string") continue;
    let text=content.trim();
    const fenced=text.match(/^\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`$/i);
    if(fenced) text=fenced[1].trim();
    try{
      const parsed=JSON.parse(text);
      if(Array.isArray(parsed)) return parsed;
      if(parsed && typeof parsed==="object" && Array.isArray(parsed.records)) return parsed.records;
    }catch{}
  }
  return null;
}
