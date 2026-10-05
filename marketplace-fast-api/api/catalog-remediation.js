import { remediation } from "../lib/catalog.js";
export default function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="POST") return res.status(405).json({error:"method_not_allowed"});
  const records=req.body?.records;
  if(!Array.isArray(records)||records.length<1||records.length>100) return res.status(400).json({error:"invalid_records",detail:"records must contain 1 to 100 product objects"});
  return res.status(200).json({...remediation(records),provider:"Practical Automation Lab",generated_at:new Date().toISOString()});
}
