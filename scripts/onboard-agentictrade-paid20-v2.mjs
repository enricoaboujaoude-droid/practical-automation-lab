const res=await fetch("https://agentictrade.io/api/v1/agents/onboard",{
  method:"POST",
  headers:{"content-type":"application/json","accept":"application/json"},
  body:JSON.stringify({
    agent_name:"PAL Paid Full Catalog Remediation",
    description:"Paid full-catalog ecommerce and Google Merchant Center remediation for up to 2,000 products. Returns prioritized corrective actions for identifiers, GTINs, price formatting, URLs, brand/MPN, availability and feed readiness.",
    endpoint:"https://pal-full-catalog-remediation.onrender.com/v1/agentpay-remediation-bulk",
    price_per_call:"20.00",
    category:"data",
    tags:["ecommerce","merchant-center","catalog-remediation","shopify","gtin","product-feed","full-catalog"],
    owner_email:"enricoaboujaoude@gmail.com",
    payment_method:"x402",
    free_tier_calls:0,
    wallet_address:"0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF",
    role:"provider"
  }),
  signal:AbortSignal.timeout(20000)
});
const text=await res.text();
let body={};
try{body=text?JSON.parse(text):{};}catch{body={raw:text.slice(0,1000)};}
if(!res.ok) throw new Error("AgenticTrade onboarding HTTP "+res.status+": "+JSON.stringify(body).slice(0,700));
if(!body.service_id) throw new Error("AgenticTrade onboarding returned no service_id");
console.log(JSON.stringify({
  created:true,
  service_id:body.service_id,
  agent_id:body.agent_id||null,
  dashboard_url:body.dashboard_url||null,
  wallet_address:body.wallet_address||null,
  owner_email_verification:body.owner_email_verification||null
},null,2));
