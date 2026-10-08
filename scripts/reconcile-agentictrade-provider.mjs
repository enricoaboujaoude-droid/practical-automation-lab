import fs from "node:fs";

const BASE="https://agentictrade.io/api/v1";
const PROVIDER_ID="e6251fd3-fe50-4d17-9950-2bfd402c1ad7";
const TARGET_IDS=[
  "00c78e8f-be6d-4371-b94b-82262767f40a",
  "00cf5f52-d0d9-4118-b47c-58f7e33cb2d2"
];

async function req(path,{method="GET",token="",body}={}){
  const res=await fetch(BASE+path,{
    method,
    headers:{
      accept:"application/json",
      ...(body!==undefined?{"content-type":"application/json"}:{}),
      ...(token?{authorization:`Bearer ${token}`}:{})
    },
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(15000)
  });
  const text=await res.text();
  let payload={};
  try{payload=text?JSON.parse(text):{};}catch{payload={raw:text.slice(0,1000)};}
  if(!res.ok) throw new Error(`${method} ${path} HTTP ${res.status}: ${JSON.stringify(payload).slice(0,600)}`);
  return payload;
}

const key=await req("/keys",{method:"POST",body:{owner_id:PROVIDER_ID,role:"provider"}});
const keyId=String(key.key_id||"");
const secret=String(key.secret||"");
if(!keyId||!secret) throw new Error("provider key bootstrap returned incomplete credentials");
const token=`${keyId}:${secret}`;

const [dashboard,services,earnings,health,onboarding]=await Promise.all([
  req("/provider/dashboard",{token}),
  req("/provider/services",{token}),
  req("/provider/earnings",{token}),
  req("/provider/health",{token}),
  req("/provider/onboarding",{token})
]);

const analytics={};
for(const id of TARGET_IDS){
  try{analytics[id]=await req(`/provider/services/${id}/analytics`,{token});}
  catch(e){analytics[id]={error:e instanceof Error?e.message:String(e)};}
}

const sanitize=(value)=>{
  if(Array.isArray(value)) return value.map(sanitize);
  if(value&&typeof value==="object"){
    const out={};
    for(const [k,v] of Object.entries(value)){
      if(/secret|api.?key|token|authorization|password/i.test(k)) continue;
      out[k]=sanitize(v);
    }
    return out;
  }
  return value;
};

const out={
  checked_at:new Date().toISOString(),
  provider_id:PROVIDER_ID,
  dashboard:sanitize(dashboard),
  services:sanitize(services),
  earnings:sanitize(earnings),
  health:sanitize(health),
  onboarding:sanitize(onboarding),
  target_analytics:sanitize(analytics)
};
fs.mkdirSync("revenue",{recursive:true});
fs.writeFileSync("revenue/agentictrade-provider-revenue.json",JSON.stringify(out,null,2)+"\n");

const summary={
  dashboard:out.dashboard,
  earnings:out.earnings,
  target_analytics:out.target_analytics
};
console.log(JSON.stringify(summary,null,2));
