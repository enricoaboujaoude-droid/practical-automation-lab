export default function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  return res.status(200).json({ok:true,service:"PAL Marketplace Fast API",version:"1.0.0"});
}
