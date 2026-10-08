import fs from "node:fs";
const URL="https://agentictrade.io/api/v1/services?query=PAL&limit=100";
const res=await fetch(URL,{headers:{accept:"application/json","user-agent":"PAL-Public-Revenue-Audit/1.0"},signal:AbortSignal.timeout(15000)});
const text=await res.text();
if(!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0,500)}`);
const body=JSON.parse(text);
const services=Array.isArray(body.services)?body.services:Array.isArray(body)?body:[];
const targetIds=new Set(["00c78e8f-be6d-4371-b94b-82262767f40a","00cf5f52-d0d9-4118-b47c-58f7e33cb2d2"]);
const pal=services.filter(s=>targetIds.has(String(s.id||s.service_id||"")) || /PAL /i.test(String(s.name||"")));
const clean=pal.map(s=>({
 id:s.id||s.service_id||null,
 name:s.name||null,
 description:s.description||null,
 provider_id:s.provider_id||s.providerId||null,
 endpoint:s.endpoint||null,
 pricing:s.pricing??null,\n price_per_call:Number(s.price_per_call??s.pricing?.price_per_call??s.price??0),
 currency:s.currency||s.pricing?.currency||null,
 free_tier_calls:Number(s.free_tier_calls??s.free_calls??s.pricing?.free_tier_calls??0),
 total_calls:Number(s.total_calls??s.call_count??s.calls??s.usage_count??0),
 paid_calls:Number(s.paid_calls??s.paid_call_count??0),
 revenue_usd:Number(s.revenue_usd??s.revenue??s.total_revenue??0),
 status:s.status||null,
 health_score:s.health_score??s.health?.score??null,
 created_at:s.created_at||null,
 updated_at:s.updated_at||null
}));
const out={checked_at:new Date().toISOString(),service_count:clean.length,services:clean,raw_keys:pal.map(s=>({id:s.id||s.service_id||null,keys:Object.keys(s)}))};
fs.mkdirSync("revenue",{recursive:true});
fs.writeFileSync("revenue/agentictrade-public-pal-services.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(out,null,2));
