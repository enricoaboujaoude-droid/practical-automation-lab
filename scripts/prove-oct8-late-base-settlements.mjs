import fs from "node:fs";

const PAYOUT="0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF".toLowerCase();
const USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TRANSFER_TOPIC="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TO_TOPIC="0x"+"0".repeat(24)+PAYOUT.slice(2);
const START_TS=Math.floor(new Date("2026-10-08T14:45:00Z").getTime()/1000);
const END_TS=Math.floor(new Date("2026-10-08T17:35:00Z").getTime()/1000);
const RPCS=["https://base-rpc.publicnode.com","https://mainnet.base.org","https://base.llamarpc.com"];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function rpc(method,params){
  let last;
  for(let i=0;i<15;i++){
    const url=RPCS[i%RPCS.length];
    try{
      const res=await fetch(url,{
        method:"POST",
        headers:{"content-type":"application/json","user-agent":"PAL-Revenue-Proof/1.2"},
        body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
        signal:AbortSignal.timeout(12000)
      });
      if(!res.ok) throw new Error(method+" HTTP "+res.status+" via "+url);
      const body=await res.json();
      if(body.error) throw new Error(method+" RPC "+JSON.stringify(body.error));
      return body.result;
    }catch(e){last=e;await sleep(Math.min(3000,250*(i+1)));}
  }
  throw last;
}
async function blockTs(n){
  const b=await rpc("eth_getBlockByNumber",["0x"+n.toString(16),false]);
  return Number.parseInt(b.timestamp,16);
}
async function lowerBound(ts){
  const latest=Number.parseInt(await rpc("eth_blockNumber",[]),16);
  let lo=Math.max(0,latest-120000),hi=latest;
  while(lo<hi){
    const mid=Math.floor((lo+hi)/2);
    const t=await blockTs(mid);
    if(t<ts) lo=mid+1; else hi=mid;
    await sleep(80);
  }
  return lo;
}
const from=await lowerBound(START_TS);
const to=await lowerBound(END_TS);
const logs=[];
for(let s=from;s<=to;s+=700){
  const e=Math.min(to,s+699);
  const batch=await rpc("eth_getLogs",[{
    address:USDC,
    fromBlock:"0x"+s.toString(16),
    toBlock:"0x"+e.toString(16),
    topics:[TRANSFER_TOPIC,null,TO_TOPIC]
  }]);
  logs.push(...batch);
  await sleep(120);
}
const transfers=[];
for(const log of logs){
  const n=Number.parseInt(log.blockNumber,16);
  transfers.push({
    tx_hash:log.transactionHash,
    block_number:n,
    log_index:Number.parseInt(log.logIndex,16),
    timestamp:new Date((await blockTs(n))*1000).toISOString(),
    from:"0x"+String(log.topics[1]).slice(-40),
    to:"0x"+String(log.topics[2]).slice(-40),
    amount_usdc:Number(BigInt(log.data))/1_000_000
  });
}
transfers.sort((a,b)=>new Date(a.timestamp)-new Date(b.timestamp));
const exact25=transfers.filter(x=>Math.abs(x.amount_usdc-25)<0.000001);
const out={
  payout_address:PAYOUT,
  network:"base-mainnet",
  event_window:{start:"2026-10-08T14:45:00Z",end:"2026-10-08T17:35:00Z"},
  checked_at:new Date().toISOString(),
  scanned_blocks:{from,to},
  transfers,
  total_usdc:Number(transfers.reduce((s,x)=>s+x.amount_usdc,0).toFixed(6)),
  exact_25_count:exact25.length,
  exact_25_usdc:Number(exact25.reduce((s,x)=>s+x.amount_usdc,0).toFixed(6))
};
fs.mkdirSync("revenue",{recursive:true});
fs.writeFileSync("revenue/oct8-late-base-settlements.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify(out,null,2));
