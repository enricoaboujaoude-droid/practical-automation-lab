export default function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method==="GET") return res.status(200).json({
    ok:true,ready:true,provider:"Practical Automation Lab",service:"PAL Product Feed Diff",
    method:"POST",billing:"handled_upstream",price_per_call_usdc:"8"
  });
  if(req.method!=="POST") return res.status(405).json({error:"method_not_allowed"});
  const before=req.body?.before, after=req.body?.after;
  if(!Array.isArray(before)||!Array.isArray(after)||before.length>100||after.length>100) return res.status(400).json({error:"invalid_snapshots"});
  const bm=new Map(before.map(x=>[String(x?.id??""),x]).filter(([id])=>id));
  const am=new Map(after.map(x=>[String(x?.id??""),x]).filter(([id])=>id));
  const added=[],removed=[],changed=[];
  for(const [id,row] of am){
    if(!bm.has(id)) {added.push(row);continue;}
    const old=bm.get(id);
    const fields={};
    for(const key of new Set([...Object.keys(old||{}),...Object.keys(row||{})])){
      if(JSON.stringify(old?.[key])!==JSON.stringify(row?.[key])) fields[key]={before:old?.[key]??null,after:row?.[key]??null};
    }
    if(Object.keys(fields).length) changed.push({id,fields});
  }
  for(const [id,row] of bm) if(!am.has(id)) removed.push(row);
  return res.status(200).json({ok:true,added_count:added.length,removed_count:removed.length,changed_count:changed.length,added,removed,changed,provider:"Practical Automation Lab",generated_at:new Date().toISOString()});
}
