import { gtinChecksumValid, cleanString } from "../lib/catalog.js";
export default function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="POST") return res.status(405).json({error:"method_not_allowed"});
  const gtins=req.body?.gtins;
  if(!Array.isArray(gtins)||gtins.length<1||gtins.length>100) return res.status(400).json({error:"invalid_gtins",detail:"gtins must contain 1 to 100 values"});
  const results=gtins.map(value=>{
    const gtin=cleanString(value).replace(/\s+/g,"");
    const format_valid=/^\d+$/.test(gtin)&&[8,12,13,14].includes(gtin.length);
    return {gtin,format_valid,checksum_valid:format_valid?gtinChecksumValid(gtin):false,valid:format_valid&&gtinChecksumValid(gtin)};
  });
  return res.status(200).json({ok:results.every(x=>x.valid),count:results.length,results,provider:"Practical Automation Lab",generated_at:new Date().toISOString()});
}
