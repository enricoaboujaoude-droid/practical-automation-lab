import fs from "node:fs";

const SOURCE_URL = "https://fisherleads.com/new/shopify";
const OUT = "revenue/shopify-lead-queue.json";
const SUPPRESSION = "revenue/shopify-outreach-suppression.json";
const MAX_CANDIDATES_TO_CHECK = 24;
const MAX_LEADS = 10;
// A 1-product launch store is unlikely to need $199/year catalog monitoring.
const MIN_PUBLIC_PRODUCT_SAMPLE = 12;
const USER_AGENT = "PracticalAutomationLab-NewShopifyPreflight/1.0";
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|co|shop|store|online|live|vip|sbs|site|website|life|world|us|uk|fr|de|es|it|nl|ca|au|in|pk|mx|br|eu|xyz)\b/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadSuppression() {
  if (!fs.existsSync(SUPPRESSION)) return new Set();
  const body = JSON.parse(fs.readFileSync(SUPPRESSION, "utf8"));
  return new Set((body.domains || []).map((x) => String(x).toLowerCase()));
}

function stripHtml(value) {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^$()|[\]\\]/g, "\\$&");
}

function newestRows(html) {
  const rows = [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const found = [];
  for (const [, rowHtml] of rows) {
    const rowText = stripHtml(rowHtml);
    if (!/\btoday\b/i.test(rowText)) continue;
    const match = rowText.match(DOMAIN_RE);
    if (!match) continue;
    const domain = match[0].toLowerCase().replace(/^www\./, "");
    if (domain === "fisherleads.com" || domain.endsWith(".myshopify.com")) continue;
    const name = rowText
      .replace(new RegExp(escapeRegExp(domain), "i"), " ")
      .replace(/\btoday\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!found.some((x) => x.domain === domain)) {
      found.push({ store_name: name || domain, domain });
    }
  }
  return found.slice(0, MAX_CANDIDATES_TO_CHECK);
}

async function fetchText(url, timeoutMs = 15000) {
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      "user-agent": USER_AGENT
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  });
  return { response, text: await response.text() };
}

function publicEmails(text, domain) {
  const values = [...new Set((String(text).match(EMAIL_RE) || []).map((x) => x.toLowerCase()))];
  const blocked = ["example.com", "shopify.com", "sentry.io", "wix.com", "cloudflare.com", "schema.org"];
  const usable = values.filter((email) => {
    if (blocked.some((suffix) => email.endsWith("@" + suffix))) return false;
    if (/^(no-?reply|noreply|donotreply)@/.test(email)) return false;
    return true;
  });
  usable.sort((a, b) => {
    const ad = a.endsWith("@" + domain) ? 0 : 1;
    const bd = b.endsWith("@" + domain) ? 0 : 1;
    return ad - bd || a.localeCompare(b);
  });
  return usable;
}

async function verifyShopify(candidate) {
  const origin = "https://" + candidate.domain;
  const url = origin + "/products.json?limit=50";
  try {
    const result = await fetchText(url, 12000);
    if (!result.response.ok) return null;
    const body = JSON.parse(result.text);
    if (!Array.isArray(body.products) || body.products.length === 0) return null;
    const product = body.products[0] || {};
    return {
      ...candidate,
      storefront_origin: origin,
      public_products_endpoint: url,
      public_product_sample_count: body.products.length,
      sample_product_title: product.title || null,
      sample_vendor: product.vendor || null
    };
  } catch {
    return null;
  }
}

async function findPublishedContact(candidate) {
  const paths = ["/policies/privacy-policy", "/policies/contact-information", "/pages/contact"];
  for (const path of paths) {
    const url = candidate.storefront_origin + path;
    try {
      const result = await fetchText(url, 12000);
      if (!result.response.ok) continue;
      const emails = publicEmails(result.text, candidate.domain);
      if (emails.length) {
        return {
          ...candidate,
          email: emails[0],
          contact_source_url: result.response.url || url
        };
      }
    } catch {
      // Try the next public contact page.
    }
    await sleep(250);
  }
  return null;
}

const suppression = loadSuppression();
const source = await fetchText(SOURCE_URL, 20000);
if (!source.response.ok) {
  throw new Error("FisherLeads HTTP " + source.response.status);
}

const candidates = newestRows(source.text).filter((x) => !suppression.has(x.domain));
const leads = [];

for (const candidate of candidates) {
  const verified = await verifyShopify(candidate);
  if (!verified || verified.public_product_sample_count < MIN_PUBLIC_PRODUCT_SAMPLE) continue;
  const contact = await findPublishedContact(verified);
  if (!contact) continue;

  leads.push({
    store_name: contact.store_name,
    domain: contact.domain,
    email: contact.email,
    storefront_origin: contact.storefront_origin,
    sample_product_title: contact.sample_product_title,
    public_product_sample_count: contact.public_product_sample_count,
    sample_vendor: contact.sample_vendor,
    launched: "today",
    contact_source_url: contact.contact_source_url,
    pal_preflight_url:
      "https://pal-full-catalog-remediation.onrender.com/v1/shopify-store-preflight?url=" +
      encodeURIComponent(contact.storefront_origin),
    shopify_app_url:
      "https://apps.shopify.com/pal-catalog-check?utm_source=pal-outreach&utm_medium=email&utm_campaign=new-shopify",
    recommended_subject:
      contact.store_name + ": AI-shopping readiness for your new Shopify catalog",
    outreach_guardrail:
      "Use one individualized first-touch message only. Do not auto-send or bulk-send. Suppress immediately after contact or opt-out."
  });

  if (leads.length >= MAX_LEADS) break;
  await sleep(500);
}

const output = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source: SOURCE_URL,
  source_policy:
    "Public newest-store directory only. Public business contact pages only. No paid enrichment, no guessed emails, no automatic sending.",
  candidates_checked: candidates.length,
  max_leads: MAX_LEADS,
  leads
};

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({
  generated_at: output.generated_at,
  candidates_checked: candidates.length,
  leads: leads.length,
  domains: leads.map((x) => x.domain)
}, null, 2));
