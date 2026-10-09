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
      const transferTopic="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      const toTopic="0x"+"0".repeat(24)+payout.slice(2).toLowerCase();

      const normalize=(items,source)=> {
        const transfers=items.map(item=>({
          tx_hash:item.tx_hash,
          log_index:item.log_index??null,
          block_number:item.block_number??null,
          timestamp:item.timestamp??null,
          from:item.from??null,
          to:item.to??payout,
          amount_usdc:Number(item.amount_usdc||0),
          source
        }));
        return {
          ok:true,
          network:"base-mainnet",
          asset:"USDC",
          source,
          payout_address:payout,
          transfer_count:transfers.length,
          total_usdc:Number(transfers.reduce((sum,x)=>sum+Number(x.amount_usdc||0),0).toFixed(6)),
          transfers,
          checked_at:new Date().toISOString()
        };
      };

      try{
        const proofUrl=new URL(`https://base.blockscout.com/api/v2/addresses/${payout}/token-transfers`);
        proofUrl.searchParams.set("type","ERC-20");
        proofUrl.searchParams.set("filter","to");
        proofUrl.searchParams.set("token",usdc);
        const upstream=await fetch(proofUrl,{
          headers:{accept:"application/json","user-agent":"PAL-Revenue-Proof/1.1"},
          signal:AbortSignal.timeout(10000)
        });
        if(upstream.ok){
          const data=await upstream.json();
          const items=(Array.isArray(data.items)?data.items:[]).filter(item=>
            String(item?.token?.address_hash||"").toLowerCase()===usdc.toLowerCase() &&
            String(item?.to?.hash||"").toLowerCase()===payout.toLowerCase()
          ).map(item=>{
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
          }).filter(x=>x.tx_hash);
          return send(res,200,normalize(items,"base.blockscout.com"));
        }
      }catch{}

      const rpcs=[
        "https://base.drpc.org",
        "https://base-mainnet.public.blastapi.io",
        "https://base.blockpi.network/v1/rpc/public",
        "https://base.api.onfinality.io/public",
        "https://base.rpc.subquery.network/public",
        "https://base.rpc.thirdweb.com",
        "https://public.1rpc.io/base",
        "https://base-rpc.publicnode.com",
        "https://mainnet.base.org"
      ];

      const rpcCall=async(rpc,method,params)=>{
        const response=await fetch(rpc,{
          method:"POST",
          headers:{"content-type":"application/json","user-agent":"PAL-Revenue-Proof/1.1"},
          body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
          signal:AbortSignal.timeout(12000)
        });
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        const body=await response.json();
        if(body.error) throw new Error(JSON.stringify(body.error));
        return body.result;
      };

      const errors=[];
      for(const rpc of rpcs){
        try{
          const latest=Number.parseInt(await rpcCall(rpc,"eth_blockNumber",[]),16);
          const from=Math.max(0,latest-12000);
          const logs=[];
          for(let s=from;s<=latest;s+=2000){
            const e=Math.min(latest,s+1999);
            const batch=await rpcCall(rpc,"eth_getLogs",[{
              address:usdc,
              fromBlock:"0x"+s.toString(16),
              toBlock:"0x"+e.toString(16),
              topics:[transferTopic,null,toTopic]
            }]);
            logs.push(...batch);
          }
          const items=[];
          for(const log of logs){
            const blockNumber=Number.parseInt(log.blockNumber,16);
            const block=await rpcCall(rpc,"eth_getBlockByNumber",["0x"+blockNumber.toString(16),false]);
            items.push({
              tx_hash:log.transactionHash,
              log_index:Number.parseInt(log.logIndex,16),
              block_number:blockNumber,
              timestamp:new Date(Number.parseInt(block.timestamp,16)*1000).toISOString(),
              from:"0x"+String(log.topics[1]).slice(-40),
              to:"0x"+String(log.topics[2]).slice(-40),
              amount_usdc:Number(BigInt(log.data))/1_000_000
            });
          }
          return send(res,200,normalize(items,`rpc:${new URL(rpc).hostname}`));
        }catch(error){
          errors.push({rpc,error:error instanceof Error?error.message:String(error)});
        }
      }

      return send(res,502,{
        ok:false,
        error:"base_proof_sources_unavailable",
        checked_at:new Date().toISOString(),
        attempts:errors.map(x=>({host:new URL(x.rpc).hostname,error:x.error.slice(0,160)}))
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
