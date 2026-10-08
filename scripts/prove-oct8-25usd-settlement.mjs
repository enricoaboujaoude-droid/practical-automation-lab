import fs from "node:fs";

const PAYOUT = "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF".toLowerCase();
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TO_TOPIC = "0x" + "0".repeat(24) + PAYOUT.slice(2);
const START_TS = Math.floor(new Date("2026-10-08T06:20:00Z").getTime()/1000);
const END_TS = Math.floor(new Date("2026-10-08T06:35:00Z").getTime()/1000);

const CHAINS = [
  {
    key:"polygon",
    chain_id:137,
    token:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    rpcs:["https://polygon-bor-rpc.publicnode.com","https://polygon-rpc.com"],
  },
  {
    key:"arbitrum",
    chain_id:42161,
    token:"0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    rpcs:["https://arbitrum-one-rpc.publicnode.com","https://arb1.arbitrum.io/rpc"],
  },
];

const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function rpc(chain, method, params) {
  let last;
  for (let attempt=0; attempt<12; attempt++) {
    const url=chain.rpcs[attempt%chain.rpcs.length];
    try {
      const res=await fetch(url,{
        method:"POST",
        headers:{"content-type":"application/json","user-agent":"PAL-Revenue-Proof/1.1"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
        signal:AbortSignal.timeout(12000),
      });
      if(!res.ok) throw new Error(`${method} HTTP ${res.status} via ${url}`);
      const body=await res.json();
      if(body.error) throw new Error(`${method} RPC ${JSON.stringify(body.error)}`);
      return body.result;
    } catch(e) {
      last=e;
      await sleep(Math.min(2500,250*(attempt+1)));
    }
  }
  throw last;
}

async function block(chain,n){
  return rpc(chain,"eth_getBlockByNumber",["0x"+n.toString(16),false]);
}
async function blockTs(chain,n){
  const b=await block(chain,n);
  return Number.parseInt(b.timestamp,16);
}
async function lowerBoundBlock(chain,targetTs){
  const latest=Number.parseInt(await rpc(chain,"eth_blockNumber",[]),16);
  let lo=0, hi=latest;
  while(lo<hi){
    const mid=Math.floor((lo+hi)/2);
    const ts=await blockTs(chain,mid);
    if(ts<targetTs) lo=mid+1; else hi=mid;
    await sleep(120);
  }
  return lo;
}

const results=[];
const errors=[];
for(const chain of CHAINS){
  try{
    const fromBlock=await lowerBoundBlock(chain,START_TS);
    const toBlock=await lowerBoundBlock(chain,END_TS);
    const logs=await rpc(chain,"eth_getLogs",[{
      address:chain.token,
      fromBlock:"0x"+fromBlock.toString(16),
      toBlock:"0x"+toBlock.toString(16),
      topics:[TRANSFER_TOPIC,null,TO_TOPIC],
    }]);
    for(const log of logs){
      const n=Number.parseInt(log.blockNumber,16);
      results.push({
        chain:chain.key,
        chain_id:chain.chain_id,
        tx_hash:log.transactionHash,
        block_number:n,
        timestamp:new Date((await blockTs(chain,n))*1000).toISOString(),
        amount_usdc:Number(BigInt(log.data))/1_000_000,
        from:"0x"+String(log.topics[1]).slice(-40),
        to:"0x"+String(log.topics[2]).slice(-40),
      });
    }
  }catch(e){
    errors.push({chain:chain.key,error:e instanceof Error?e.message:String(e)});
  }
}
results.sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
const out={
  payout_address:PAYOUT,
  event_window:{start:"2026-10-08T06:20:00Z",end:"2026-10-08T06:35:00Z"},
  checked_at:new Date().toISOString(),
  errors,
  transfers:results,
  total_usdc:Number(results.reduce((s,x)=>s+x.amount_usdc,0).toFixed(6)),
  exact_25_usdc:results.filter(x=>Math.abs(x.amount_usdc-25)<0.000001),
};
fs.mkdirSync("revenue",{recursive:true});
fs.writeFileSync("revenue/oct8-25usd-settlement-proof.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(out,null,2));
if(errors.length===CHAINS.length) process.exit(1);
