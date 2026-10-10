import fs from "node:fs";

const INPUT = "revenue/shopify-lead-queue.json";
const OUT = "revenue/new-store-aieo-audits.json";
const API = "https://br-wild-truth-b2gxc5zl-palmarket.compute.c-6.eu-central-1.aws.neon.tech/api/shopify-aieo-quick-audit";

if (!fs.existsSync(INPUT)) throw new Error("Lead queue missing; run lead discovery first");
const queue = JSON.parse(fs.readFileSync(INPUT, "utf8"));
const candidates = (Array.isArray(queue.leads) ? queue.leads : []).slice(0, 10);
const results = [];
for (const lead of candidates) {
  try {
    const origin = new URL(lead.storefront_origin);
    if (origin.protocol !== "https:") throw new Error("unsupported_origin");
    const response = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ url: origin.origin }),
      signal: AbortSignal.timeout(30000)
    });
    const data = await response.json();
    if (!response.ok || !data.ok || typeof data.aieo_score !== "number") throw new Error("audit_unavailable");
    results.push({
      domain: lead.domain,
      store_name: lead.store_name,
      origin: origin.origin,
      score: data.aieo_score,
      sample: data.sample,
      coverage: data.coverage,
      recommendations: (data.recommendations || []).slice(0, 4),
      audited_at: data.checked_at || new Date().toISOString(),
      ok: true
    });
  } catch (error) {
    results.push({ domain: lead.domain, store_name: lead.store_name, ok: false, reason: String(error.message || error).slice(0, 80) });
  }
}
const report = {
  generated_at: new Date().toISOString(),
  source_queue_created: queue.generated_at,
  api: API,
  samples_only: true,
  no_contact_details_embedded: true,
  attempted: results.length,
  passed: results.filter(x => x.ok).length,
  results
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  attempted: report.attempted,
  passed: report.passed,
  low_score_stores: results.filter(x => x.ok).sort((a,b)=>a.score-b.score).slice(0,5).map(x=>({domain:x.domain,score:x.score}))
},null,2));
if (!report.passed) process.exit(1);
