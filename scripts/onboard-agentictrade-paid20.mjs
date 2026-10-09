import fs from "node:fs";

const BASE="https://agentictrade.io/api/v1";
const WALLET="0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF";
const EMAIL="enricoaboujaoude@gmail.com";
const NAME="PAL Paid Full Catalog Remediation";
const ENDPOINT="https://pal-full-catalog-remediation.onrender.com/v1/agentpay-remediation-bulk";

async function req(path,{method="GET",token="",body}={}){
  const res=await fetch(BASE+path,{
    method,
    headers:{
      accept:"application/json",
      ...(body!==undefined?{"content-type":"application/json"}:{}),
      ...(token?{authorization:`Bearer ${token}`}:{})
    },
    ...(body!==undefined?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(20000)
  });
  const text=await res.text();
  let payload={};
  try{payload=text?JSON.parse(text):{};}catch{payload={raw:text.slice(0,1000)};}
  if(!res.ok) throw new Error(`${method} ${path} HTTP ${res.status}: ${JSON.stringify(payload).slice(0,700)}`);
  return payload;
}

const discover=await req("/services?query="+encodeURIComponent(NAME)+"&limit=20");
const existing=(Array.isArray(discover.services)?discover.services:[]).find(s=>String(s.name||"")===NAME);

let result;
let token="";
if(existing){
  result={
    existing:true,
    agent_id:null,
    owner_id:existing.provider_id||null,
    service_id:existing.id||null,
    owner_email_verification:null
  };
}else{
  const created=await req("/agents/onboard",{
    method:"POST",
    body:{
      agent_name:NAME,
      description:"Paid full-catalog ecommerce and Google Merchant Center remediation for up to 2,000 products. Returns prioritized corrective actions for identifiers, GTINs, price formatting, URLs, brand/MPN, availability and feed readiness.",
      endpoint:ENDPOINT,
      price_per_call:"20.00",
      category:"data",
      tags:["ecommerce","merchant-center","catalog-remediation","shopify","gtin","product-feed","full-catalog"],
      owner_email:EMAIL,
      payment_method:"x402",
      free_tier_calls:0,
      wallet_address:WALLET,
      role:"provider"
    }
  });
  token=String(created.api_key||"");
  if(!created.service_id||!created.agent_id||!token) throw new Error("incomplete AgenticTrade onboarding response");
  result={
    existing:false,
    agent_id:created.agent_id,
    owner_id:created.owner_id||null,
    service_id:created.service_id,
    dashboard_url:created.dashboard_url||null,
    wallet_address:created.wallet_address||WALLET,
    owner_email_verification:created.owner_email_verification||null
  };
}

let dashboard=null, earnings=null, providerServices=null;
if(token){
  try{dashboard=await req("/provider/dashboard",{token});}catch(e){dashboard={error:e instanceof Error?e.message:String(e)};}
  try{earnings=await req("/provider/earnings",{token});}catch(e){earnings={error:e instanceof Error?e.message:String(e)};}
  try{providerServices=await req("/provider/services",{token});}catch(e){providerServices={error:e instanceof Error?e.message:String(e)};}
}

const publicServices=await req("/services?query="+encodeURIComponent(NAME)+"&limit=20");
const publicService=(Array.isArray(publicServices.services)?publicServices.services:[]).find(s=>String(s.name||"")===NAME)||null;

const sanitize=v=>{
  if(Array.isArray(v)) return v.map(sanitize);
  if(v&&typeof v==="object"){
    const o={};
    for(const [k,x] of Object.entries(v)){
      if(/secret|api.?key|token|authorization|password/i.test(k)) continue;
      o[k]=sanitize(x);
    }
    return o;
  }
  return v;
};

const out={
  checked_at:new Date().toISOString(),
  marketplace:"AgenticTrade",
  listing:{
    name:NAME,
    endpoint:ENDPOINT,
    requested_price_per_call_usdc:20,
    requested_free_tier_calls:0,
    payout_wallet:WALLET,
    ...result
  },
  public_service:sanitize(publicService),
  provider_dashboard:sanitize(dashboard),
  provider_earnings:sanitize(earnings),
  provider_services:sanitize(providerServices)
};

fs.mkdirSync("revenue",{recursive:true});
fs.writeFileSync("revenue/agentictrade-paid20-service.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({
  service_id:result.service_id,
  existing:result.existing,
  verification:result.owner_email_verification?.status||null,
  public_pricing:publicService?.pricing||null,
  dashboard:sanitize(dashboard),
  earnings:sanitize(earnings)
},null,2));
