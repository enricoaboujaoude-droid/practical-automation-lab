import { gtinChecksumValid, cleanString } from "../lib/catalog.js";
export default function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method==="GET") return res.status(200).json({
    ok:true,ready:true,provider:"Practical Automation Lab",service:"PAL GTIN UPC EAN Validator",
    method:"POST",billing:"handled_upstream",price_per_call_usdc:"3"
  });
  if(req.method!=="POST") return res.status(405).json({error:"method_not_allowed"});
  const gtins=req.body?.gtins;
  if(!Array.isArray(gtins)||gtins.length<1||gtins.length>100) return res.status(400).json({error:"invalid_gtins",detail:"gtins must contain 1 to 100 values"});
  const results=gtins.map(value=>{
    const gtin=cleanString(value).replace(/\s+/g,"");
    const format_valid=/^\d+$/.test(gtin)&&[8,12,13,14].includes(gtin.length);
    const checksum_valid=format_valid?gtinChecksumValid(gtin):false;
    return {gtin,format_valid,checksum_valid,valid:format_valid&&checksum_valid};
  });
  return res.status(200).json({ok:results.every(x=>x.valid),count:results.length,results,provider:"Practical Automation Lab",generated_at:new Date().toISOString()});
}
