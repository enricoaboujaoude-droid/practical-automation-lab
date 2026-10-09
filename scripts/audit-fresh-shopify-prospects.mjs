import fs from "node:fs";

const ENDPOINT="https://pal-marketplace-fast-api.onrender.com/api/shopify-aieo-quick-audit";
const targets=[
  {name:"3D&Dice",url:"https://3dndice.com"},
  {name:"237 District Apparel",url:"https://www.237districtapparel.com"},
  {name:"A2Z naturalz",url:"https://4a2znaturalz.com"},
  {name:"AERIXN BRAND",url:"https://aerixnbrand.com"},
  {name:"Alice & Rowan Jewelry",url:"https://alicerowanjewelry.com"}
];

const results=[];
for(const target of targets){
  try{
    const response=await fetch(ENDPOINT,{
      method:"POST",
      headers:{"content-type":"application/json","accept":"application/json"},
      body:JSON.stringify({url:target.url}),
      signal:AbortSignal.timeout(30000)
    });
    const raw=await response.text();
    let body={};
    try{body=raw?JSON.parse(raw):{};}catch{body={raw:raw.slice(0,1000)};}
    results.push({
      ...target,
      ok:response.ok,
      status:response.status,
      result:body
    });
  }catch(error){
    results.push({...target,ok:false,error:error instanceof Error?error.message:String(error)});
  }
}

const out={checked_at:new Date().toISOString(),endpoint:ENDPOINT,targets:results};
fs.mkdirSync("revenue",{recursive:true});
fs.writeFileSync("revenue/prospect-aieo-audits.json",JSON.stringify(out,null,2)+"\n");

console.log(JSON.stringify({
  checked_at:out.checked_at,
  results:results.map(x=>({
    name:x.name,
    ok:x.ok,
    status:x.status,
    score:x.result?.aieo_score??null,
    products:x.result?.sample?.products??null,
    variants:x.result?.sample?.variants??null,
    coverage:x.result?.coverage??null,
    structural:x.result?.structural_audit?{
      issues:x.result.structural_audit.issue_count,
      errors:x.result.structural_audit.error_count,
      warnings:x.result.structural_audit.warning_count
    }:null,
    recommendations:x.result?.recommendations??null,
    error:x.error||x.result?.detail||null
  }))
},null,2));

if(results.every(x=>!x.ok)) process.exit(1);
