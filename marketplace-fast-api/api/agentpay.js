import { audit, extractAgentPayRecords } from "../lib/catalog.js";
export default function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method==="GET") return res.status(200).json({
    ok:true,ready:true,service:"PAL Catalog Feed Auditor",marketplace:"AgenticTrade",method:"POST",
    price_per_call_usdc:"5",capabilities:["catalog-audit","gtin-validation","duplicate-id-detection","merchant-center-readiness"],
    limits:{records_per_audit:100}
  });
  if(req.method!=="POST") return res.status(405).json({error:"method_not_allowed"});
  const records=extractAgentPayRecords(req.body?.messages);
  if(!records) return res.status(200).json({ok:false,ready:true,error:"catalog_payload_required",detail:"Send messages containing JSON with {\"records\":[...]}."});
  if(records.length<1||records.length>100) return res.status(400).json({error:"invalid_records"});
  return res.status(200).json({...audit(records),marketplace:{provider:"AgenticTrade",billing:"handled_upstream"},generated_at:new Date().toISOString()});
}
