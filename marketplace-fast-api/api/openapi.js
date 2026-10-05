export default function handler(req,res){
  const base="https://pal-marketplace-fast-api.vercel.app";
  res.status(200).json({
    openapi:"3.0.3",
    info:{title:"PAL Commerce Catalog Intelligence API",version:"1.0.0",description:"Fast marketplace endpoints for ecommerce catalog audits, remediation, GTIN validation, and feed diffing."},
    servers:[{url:base}],
    paths:{
      "/api/catalog-audit":{post:{summary:"Audit product catalog records",responses:{"200":{description:"Audit result"}}}},
      "/api/catalog-remediation":{post:{summary:"Generate prioritized catalog remediation",responses:{"200":{description:"Remediation result"}}}},
      "/api/gtin-check":{post:{summary:"Validate GTIN UPC EAN identifiers",responses:{"200":{description:"GTIN result"}}}},
      "/api/feed-diff":{post:{summary:"Compare feed snapshots",responses:{"200":{description:"Diff result"}}}}
    }
  });
}
