import http from "node:http";
import {
  audit,
  remediation,
  gtinChecksumValid,
  cleanString,
  extractAgentPayRecords
} from "./lib/catalog.js";

const PORT = Number(process.env.PORT || 3000);

function send(res,status,body,headers={}) {
  const payload = JSON.stringify(body);
  res.writeHead(status,{
    "content-type":"application/json; charset=utf-8",
    "content-length":Buffer.byteLength(payload),
    "access-control-allow-origin":"*",
    "access-control-allow-methods":"GET,POST,OPTIONS",
    "access-control-allow-headers":"content-type,authorization",
    "cache-control":"no-store",
    ...headers
  });
  res.end(payload);
}

async function readJson(req){
  const chunks=[];
  let size=0;
  for await (const chunk of req){
    size += chunk.length;
    if(size>1_000_000) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  if(!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function openApi(base){
  return {
    openapi:"3.0.3",
    info:{
      title:"PAL AIEO Commerce Catalog Intelligence API",
      version:"1.0.0",
      description:"Low-latency AIEO catalog intelligence for AI shopping, agentic commerce, marketplaces and Merchant Center-compatible product data."
    },
    servers:[{url:base}],
    paths:{
      "/api/health":{get:{summary:"Health check",responses:{"200":{description:"OK"}}}},
      "/api/catalog-audit":{post:{summary:"Audit ecommerce product records for AIEO and AI-shopping readiness",responses:{"200":{description:"Audit result"}}}},
      "/api/catalog-remediation":{post:{summary:"Generate prioritized AIEO remediation with Merchant Center compatibility",responses:{"200":{description:"Remediation result"}}}},
      "/api/gtin-check":{post:{summary:"Validate GTIN UPC EAN identifiers",responses:{"200":{description:"GTIN result"}}}},
      "/api/feed-diff":{post:{summary:"Compare product-feed snapshots",responses:{"200":{description:"Feed diff result"}}}},
      "/api/agentpay":{
        get:{summary:"AgenticTrade service metadata",responses:{"200":{description:"Metadata"}}},
        post:{summary:"AgenticTrade-compatible catalog audit",responses:{"200":{description:"Audit result"}}}
      }
    }
  };
}

const server=http.createServer(async (req,res)=>{
  const started=Date.now();
  const url=new URL(req.url||"/","http://localhost");
  const path=url.pathname;

  if(req.method==="OPTIONS") return send(res,204,{});

  try{
    if(req.method==="GET" && path==="/api/health"){
      return send(res,200,{ok:true,service:"PAL Marketplace Fast API",version:"1.0.0",latency_ms:Date.now()-started});
    }

    if(req.method==="GET" && path==="/api/base-usdc-proof"){
      const payout="0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF";
      const usdc="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
      const proofUrl=new URL(`https://base.blockscout.com/api/v2/addresses/${payout}/token-transfers`);
      proofUrl.searchParams.set("type","ERC-20");
      proofUrl.searchParams.set("filter","to");
      proofUrl.searchParams.set("token",usdc);
      const upstream=await fetch(proofUrl,{
        headers:{accept:"application/json","user-agent":"PAL-Revenue-Proof/1.0"},
        signal:AbortSignal.timeout(15000)
      });
      const raw=await upstream.text();
      if(!upstream.ok){
        return send(res,502,{ok:false,error:"base_proof_upstream_failed",status:upstream.status,detail:raw.slice(0,300)});
      }
      const data=raw?JSON.parse(raw):{};
      const items=(Array.isArray(data.items)?data.items:[]).filter(item=>
        String(item?.token?.address_hash||"").toLowerCase()===usdc.toLowerCase() &&
        String(item?.to?.hash||"").toLowerCase()===payout.toLowerCase()
      );
      const transfers=items.map(item=>{
        const decimals=Number(item?.total?.decimals??item?.token?.decimals??6);
        const value=String(item?.total?.value??"0");
        return {
          tx_hash:item?.transaction_hash||null,
          log_index:Number.isFinite(Number(item?.log_index))?Number(item.log_index):null,
          block_number:Number(item?.block_number||0)||null,
          timestamp:item?.timestamp||null,
          from:item?.from?.hash||null,
          to:item?.to?.hash||null,
          amount_usdc:Number(value)/(10**decimals)
        };
      });
      const total_usdc=Number(transfers.reduce((sum,x)=>sum+Number(x.amount_usdc||0),0).toFixed(6));
      return send(res,200,{
        ok:true,
        network:"base-mainnet",
        asset:"USDC",
        source:"base.blockscout.com",
        payout_address:payout,
        transfer_count:transfers.length,
        total_usdc,
        transfers,
        checked_at:new Date().toISOString()
      });
    }

    if(req.method==="GET" && path==="/api/openapi"){
      const proto=(req.headers["x-forwarded-proto"]||"https").split(",")[0].trim();
      return send(res,200,openApi(`${proto}://${req.headers.host}`),{"cache-control":"public, max-age=300"});
    }

    if(path==="/api/agentpay" && req.method==="GET"){
      return send(res,200,{
        ok:true,ready:true,service:"PAL AIEO Catalog Auditor",marketplace:"AgenticTrade",
        method:"POST",price_per_call_usdc:"5",
        capabilities:["aieo","ai-shopping-readiness","agentic-commerce","catalog-audit","gtin-validation","duplicate-id-detection","merchant-center-readiness"],
        limits:{records_per_audit:100}
      });
    }

    if(req.method!=="POST") return send(res,405,{error:"method_not_allowed"});

    const body=await readJson(req);

    if(path==="/api/catalog-audit"){
      const records=body?.records;
      if(!Array.isArray(records)||records.length<1||records.length>100){
        return send(res,400,{error:"invalid_records",detail:"records must contain 1 to 100 product objects"});
      }
      return send(res,200,{...audit(records),provider:"Practical Automation Lab",generated_at:new Date().toISOString()});
    }

    if(path==="/api/catalog-remediation"){
      const records=body?.records;
      if(!Array.isArray(records)||records.length<1||records.length>100){
        return send(res,400,{error:"invalid_records",detail:"records must contain 1 to 100 product objects"});
      }
      return send(res,200,{...remediation(records),provider:"Practical Automation Lab",generated_at:new Date().toISOString()});
    }

    if(path==="/api/gtin-check"){
      const gtins=body?.gtins;
      if(!Array.isArray(gtins)||gtins.length<1||gtins.length>100){
        return send(res,400,{error:"invalid_gtins",detail:"gtins must contain 1 to 100 values"});
      }
      const results=gtins.map(value=>{
        const gtin=cleanString(value).replace(/\s+/g,"");
        const format_valid=/^\d+$/.test(gtin)&&[8,12,13,14].includes(gtin.length);
        const checksum_valid=format_valid?gtinChecksumValid(gtin):false;
        return {gtin,format_valid,checksum_valid,valid:format_valid&&checksum_valid};
      });
      return send(res,200,{ok:results.every(x=>x.valid),count:results.length,results,provider:"Practical Automation Lab",generated_at:new Date().toISOString()});
    }

    if(path==="/api/feed-diff"){
      const before=body?.before, after=body?.after;
      if(!Array.isArray(before)||!Array.isArray(after)||before.length>100||after.length>100){
        return send(res,400,{error:"invalid_snapshots"});
      }
      const bm=new Map(before.map(x=>[String(x?.id??""),x]).filter(([id])=>id));
      const am=new Map(after.map(x=>[String(x?.id??""),x]).filter(([id])=>id));
      const added=[],removed=[],changed=[];
      for(const [id,row] of am){
        if(!bm.has(id)){added.push(row);continue;}
        const old=bm.get(id), fields={};
        for(const key of new Set([...Object.keys(old||{}),...Object.keys(row||{})])){
          if(JSON.stringify(old?.[key])!==JSON.stringify(row?.[key])) fields[key]={before:old?.[key]??null,after:row?.[key]??null};
        }
        if(Object.keys(fields).length) changed.push({id,fields});
      }
      for(const [id,row] of bm) if(!am.has(id)) removed.push(row);
      return send(res,200,{ok:true,added_count:added.length,removed_count:removed.length,changed_count:changed.length,added,removed,changed,provider:"Practical Automation Lab",generated_at:new Date().toISOString()});
    }

    if(path==="/api/agentpay"){
      const records=extractAgentPayRecords(body?.messages);
      if(!records){
        return send(res,200,{ok:false,ready:true,error:"catalog_payload_required",detail:"Send messages containing JSON with {\"records\":[...]}."});
      }
      if(records.length<1||records.length>100) return send(res,400,{error:"invalid_records"});
      return send(res,200,{...audit(records),marketplace:{provider:"AgenticTrade",billing:"handled_upstream"},generated_at:new Date().toISOString()});
    }

    return send(res,404,{error:"not_found"});
  }catch(error){
    return send(res,error?.message==="body_too_large"?413:400,{
      error:"request_failed",
      detail:error instanceof Error?error.message:String(error)
    });
  }
});

server.listen(PORT,"0.0.0.0",()=>{
  console.log(`PAL Marketplace Fast API listening on ${PORT}`);
});
