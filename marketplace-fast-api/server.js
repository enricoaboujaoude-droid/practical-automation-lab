import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  audit,
  remediation,
  gtinChecksumValid,
  cleanString,
  extractAgentPayRecords
} from "./lib/catalog.js";

const PORT = Number(process.env.PORT || 3000);
const API_MARKET_PAID_ROUTES = new Set([
  "/api/catalog-audit", "/api/catalog-remediation", "/api/gtin-check", "/api/feed-diff"
]);
// These four routes are exclusive to upstream API.market billing. They fail closed until
// a merchant-specific secret is provisioned; storefront sample and health remain public.
function hasApiMarketOriginKey(req) {
  const expected = String(process.env.PAL_API_MARKET_SHARED_SECRET || "");
  const provided = String(req.headers?.["x-pal-origin-key"] || "");
  if (expected.length < 32 || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

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

function isPrivateIp(address){
  if(isIP(address)===4){
    const p=address.split(".").map(Number);
    return p[0]===10 ||
      p[0]===127 ||
      (p[0]===169&&p[1]===254) ||
      (p[0]===172&&p[1]>=16&&p[1]<=31) ||
      (p[0]===192&&p[1]===168) ||
      (p[0]===0) ||
      (p[0]>=224);
  }
  if(isIP(address)===6){
    const a=address.toLowerCase();
    return a==="::1" || a==="::" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb");
  }
  return true;
}

async function assertPublicHttpsUrl(value){
  const url=new URL(String(value||""));
  if(url.protocol!=="https:") throw new Error("store_url_must_be_https");
  if(url.username||url.password) throw new Error("store_url_must_not_include_credentials");
  if(url.port && url.port!=="443") throw new Error("store_url_custom_port_not_allowed");
  if(isIP(url.hostname)) throw new Error("store_url_ip_literal_not_allowed");
  const addresses=await lookup(url.hostname,{all:true,verbatim:true});
  if(!addresses.length || addresses.some(x=>isPrivateIp(x.address))) throw new Error("store_url_must_resolve_publicly");
  return url;
}

async function fetchPublicJson(startUrl){
  let current=await assertPublicHttpsUrl(startUrl);
  for(let i=0;i<4;i+=1){
    const response=await fetch(current,{
      method:"GET",
      headers:{accept:"application/json","user-agent":"PAL-AIEO-Audit/1.0"},
      redirect:"manual",
      signal:AbortSignal.timeout(15000)
    });
    if(response.status>=300&&response.status<400){
      const location=response.headers.get("location");
      if(!location) throw new Error("store_redirect_without_location");
      current=await assertPublicHttpsUrl(new URL(location,current).toString());
      continue;
    }
    const raw=await response.text();
    if(!response.ok) throw new Error(`shopify_catalog_http_${response.status}`);
    let body;
    try{body=raw?JSON.parse(raw):{};}catch{throw new Error("shopify_catalog_not_json");}
    return {body,finalUrl:current.toString()};
  }
  throw new Error("too_many_store_redirects");
}

function htmlText(value){
  return String(value||"").replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
}

function percentage(n,d){
  return d>0?Math.round((n/d)*1000)/10:0;
}

async function shopifyAieoQuickAudit(storeUrl){
  const input=await assertPublicHttpsUrl(storeUrl);
  const origin=`${input.protocol}//${input.host}`;
  const catalogUrl=new URL("/products.json?limit=50",origin).toString();
  const {body,finalUrl}=await fetchPublicJson(catalogUrl);
  const products=Array.isArray(body?.products)?body.products:null;
  if(!products) throw new Error("public_shopify_products_endpoint_not_detected");
  if(products.length===0) throw new Error("shopify_catalog_empty");

  const variants=[];
  let productsWithUsefulDescription=0;
  let productsWithAlt=0;
  let productsWithType=0;
  let productsWithVendor=0;
  let productsWithGoodTitle=0;

  for(const product of products){
    const desc=htmlText(product?.body_html);
    if(desc.length>=80) productsWithUsefulDescription+=1;
    if(Array.isArray(product?.images)&&product.images.some(img=>cleanString(img?.alt).length>=5)) productsWithAlt+=1;
    if(cleanString(product?.product_type)) productsWithType+=1;
    if(cleanString(product?.vendor)) productsWithVendor+=1;
    if(cleanString(product?.title).length>=20) productsWithGoodTitle+=1;

    for(const variant of Array.isArray(product?.variants)?product.variants:[]){
      if(variants.length>=100) break;
      variants.push({
        id:String(variant?.id??""),
        title:[cleanString(product?.title),cleanString(variant?.title)==="Default Title"?"":cleanString(variant?.title)].filter(Boolean).join(" — "),
        link:`${origin}/products/${encodeURIComponent(cleanString(product?.handle))}`,
        image_link:cleanString(product?.images?.[0]?.src),
        gtin:cleanString(variant?.barcode),
        brand:cleanString(product?.vendor),
        mpn:cleanString(variant?.sku),
        availability:variant?.available===false?"out_of_stock":"in_stock",
        identifier_exists:Boolean(cleanString(variant?.barcode)||cleanString(variant?.sku))
      });
    }
    if(variants.length>=100) break;
  }

  const baseAudit=audit(variants);
  const totalVariants=variants.length;
  const barcodeCount=variants.filter(x=>x.gtin).length;
  const skuCount=variants.filter(x=>x.mpn).length;
  const identifierCount=variants.filter(x=>x.gtin||x.mpn).length;
  const productCount=products.length;

  const coverage={
    identifiers_pct:percentage(identifierCount,totalVariants),
    gtin_barcode_pct:percentage(barcodeCount,totalVariants),
    sku_mpn_pct:percentage(skuCount,totalVariants),
    vendor_brand_pct:percentage(productsWithVendor,productCount),
    product_type_pct:percentage(productsWithType,productCount),
    useful_description_pct:percentage(productsWithUsefulDescription,productCount),
    image_alt_text_pct:percentage(productsWithAlt,productCount),
    descriptive_title_pct:percentage(productsWithGoodTitle,productCount)
  };

  const score=Math.max(0,Math.min(100,Math.round(
    coverage.identifiers_pct*0.25+
    coverage.vendor_brand_pct*0.15+
    coverage.product_type_pct*0.10+
    coverage.useful_description_pct*0.20+
    coverage.image_alt_text_pct*0.20+
    coverage.descriptive_title_pct*0.10
  )));

  const recommendations=[];
  if(coverage.identifiers_pct<90) recommendations.push("Increase GTIN or SKU/MPN coverage so shopping agents can resolve products and variants reliably.");
  if(coverage.useful_description_pct<80) recommendations.push("Expand product descriptions with concrete attributes, use cases, materials/specifications, and differentiators that AI shopping systems can extract.");
  if(coverage.image_alt_text_pct<80) recommendations.push("Add descriptive image alt text so multimodal/AI search systems receive explicit product context.");
  if(coverage.product_type_pct<80) recommendations.push("Populate product type/category consistently to strengthen product classification.");
  if(coverage.vendor_brand_pct<90) recommendations.push("Populate vendor/brand consistently across the catalog.");
  if(coverage.descriptive_title_pct<80) recommendations.push("Use descriptive product titles that identify the product and key variant rather than short or generic labels.");
  if(baseAudit.error_count>0) recommendations.push("Fix structural catalog errors first: duplicate IDs, malformed GTINs, invalid links, and identifier inconsistencies.");

  return {
    ok:true,
    service:"PAL AIEO Quick Shopify Audit",
    audit_type:"public_storefront_no_login",
    store_origin:origin,
    catalog_source:finalUrl,
    checked_at:new Date().toISOString(),
    sample:{
      products:productCount,
      variants:totalVariants,
      product_limit:50,
      variant_limit:100
    },
    aieo_score:score,
    score_note:"Heuristic readiness score based on identifier, brand, product type, description, image-alt and title coverage; it is not a Shopify or Google score.",
    coverage,
    structural_audit:{
      issue_count:baseAudit.issue_count,
      error_count:baseAudit.error_count,
      warning_count:baseAudit.warning_count,
      top_issues:baseAudit.issues.slice(0,25)
    },
    recommendations:recommendations.slice(0,6),
    upgrade:{
      service:"PAL Live Shopify Store Commerce Audit",
      price_usdc:25,
      value:"deeper live-store audit with prioritized Merchant Center/catalog remediation"
    }
  };
}


async function shopifyAieoFullAudit(storeUrl){
  const input=await assertPublicHttpsUrl(storeUrl);
  const origin=`${input.protocol}//${input.host}`;
  const catalogUrl=new URL("/products.json?limit=250",origin).toString();
  const {body,finalUrl}=await fetchPublicJson(catalogUrl);
  const products=Array.isArray(body?.products)?body.products:null;
  if(!products) throw new Error("public_shopify_products_endpoint_not_detected");
  if(products.length===0) throw new Error("shopify_catalog_empty");

  const variants=[];
  let productsWithUsefulDescription=0;
  let productsWithAlt=0;
  let productsWithType=0;
  let productsWithVendor=0;
  let productsWithGoodTitle=0;

  for(const product of products){
    const desc=htmlText(product?.body_html);
    if(desc.length>=80) productsWithUsefulDescription+=1;
    if(Array.isArray(product?.images)&&product.images.some(img=>cleanString(img?.alt).length>=5)) productsWithAlt+=1;
    if(cleanString(product?.product_type)) productsWithType+=1;
    if(cleanString(product?.vendor)) productsWithVendor+=1;
    if(cleanString(product?.title).length>=20) productsWithGoodTitle+=1;

    for(const variant of Array.isArray(product?.variants)?product.variants:[]){
      if(variants.length>=250) break;
      variants.push({
        id:String(variant?.id??""),
        title:[cleanString(product?.title),cleanString(variant?.title)==="Default Title"?"":cleanString(variant?.title)].filter(Boolean).join(" — "),
        link:`${origin}/products/${encodeURIComponent(cleanString(product?.handle))}`,
        image_link:cleanString(product?.images?.[0]?.src),
        gtin:cleanString(variant?.barcode),
        brand:cleanString(product?.vendor),
        mpn:cleanString(variant?.sku),
        availability:variant?.available===false?"out_of_stock":"in_stock",
        identifier_exists:Boolean(cleanString(variant?.barcode)||cleanString(variant?.sku))
      });
    }
    if(variants.length>=250) break;
  }

  const baseAudit=audit(variants);
  const totalVariants=variants.length;
  const barcodeCount=variants.filter(x=>x.gtin).length;
  const skuCount=variants.filter(x=>x.mpn).length;
  const identifierCount=variants.filter(x=>x.gtin||x.mpn).length;
  const productCount=products.length;

  const coverage={
    identifiers_pct:percentage(identifierCount,totalVariants),
    gtin_barcode_pct:percentage(barcodeCount,totalVariants),
    sku_mpn_pct:percentage(skuCount,totalVariants),
    vendor_brand_pct:percentage(productsWithVendor,productCount),
    product_type_pct:percentage(productsWithType,productCount),
    useful_description_pct:percentage(productsWithUsefulDescription,productCount),
    image_alt_text_pct:percentage(productsWithAlt,productCount),
    descriptive_title_pct:percentage(productsWithGoodTitle,productCount)
  };

  const score=Math.max(0,Math.min(100,Math.round(
    coverage.identifiers_pct*0.25+
    coverage.vendor_brand_pct*0.15+
    coverage.product_type_pct*0.10+
    coverage.useful_description_pct*0.20+
    coverage.image_alt_text_pct*0.20+
    coverage.descriptive_title_pct*0.10
  )));

  const recommendations=[];
  if(coverage.identifiers_pct<90) recommendations.push("Increase GTIN or SKU/MPN coverage so shopping agents can resolve products and variants reliably.");
  if(coverage.useful_description_pct<80) recommendations.push("Expand product descriptions with concrete attributes, use cases, materials/specifications, and differentiators that AI shopping systems can extract.");
  if(coverage.image_alt_text_pct<80) recommendations.push("Add descriptive image alt text so multimodal/AI search systems receive explicit product context.");
  if(coverage.product_type_pct<80) recommendations.push("Populate product type/category consistently to strengthen product classification.");
  if(coverage.vendor_brand_pct<90) recommendations.push("Populate vendor/brand consistently across the catalog.");
  if(coverage.descriptive_title_pct<80) recommendations.push("Use descriptive product titles that identify the product and key variant rather than short or generic labels.");
  if(baseAudit.error_count>0) recommendations.push("Fix structural catalog errors first: duplicate IDs, malformed GTINs, invalid links, and identifier inconsistencies.");

  return {
    ok:true,
    service:"PAL Live Shopify Store Commerce Audit",
    audit_type:"public_storefront_no_login",
    store_origin:origin,
    catalog_source:finalUrl,
    checked_at:new Date().toISOString(),
    sample:{
      products:productCount,
      variants:totalVariants,
      product_limit:250,
      variant_limit:250
    },
    aieo_score:score,
    score_note:"Heuristic readiness score based on identifier, brand, product type, description, image-alt and title coverage; it is not a Shopify or Google score.",
    coverage,
    structural_audit:{
      issue_count:baseAudit.issue_count,
      error_count:baseAudit.error_count,
      warning_count:baseAudit.warning_count,
      top_issues:baseAudit.issues.slice(0,25)
    },
    recommendations:recommendations.slice(0,10),
    commercial:{
      price_usdc:25,
      billing:"handled_upstream",
      value:"deeper live-store audit with prioritized Merchant Center/catalog remediation"
    }
  };
}

function openApi(base){
  return {
    openapi:"3.0.3",
    info:{
      title:"PAL AIEO Commerce Catalog Intelligence API",
      version:"1.1.0",
      description:"Low-latency AIEO catalog intelligence for AI shopping, agentic commerce, marketplaces and Merchant Center-compatible product data."
    },
    servers:[{url:base}],
    components:{
      securitySchemes:{ApiMarketOriginKey:{type:"apiKey",in:"header",name:"x-pal-origin-key",description:"Configured only in the API.market seller source Authentication."}},
      schemas:{
        ProductRecord:{type:"object",additionalProperties:true,properties:{id:{type:"string"},title:{type:"string"},brand:{type:"string"},gtin:{type:"string"},price:{type:"string"},availability:{type:"string"}}},
        CatalogRecordsRequest:{type:"object",required:["records"],properties:{records:{type:"array",minItems:1,maxItems:100,items:{$ref:"#/components/schemas/ProductRecord"}}}},
        GtinRequest:{type:"object",required:["gtins"],properties:{gtins:{type:"array",minItems:1,maxItems:100,items:{type:"string"}}}},
        FeedDiffRequest:{type:"object",required:["before","after"],properties:{before:{type:"array",maxItems:100,items:{$ref:"#/components/schemas/ProductRecord"}},after:{type:"array",maxItems:100,items:{$ref:"#/components/schemas/ProductRecord"}}}}
      }
    },
    paths:{
      "/api/health":{get:{summary:"Health check",responses:{"200":{description:"OK"}}}},
      "/api/catalog-audit":{
        get:{summary:"Catalog audit readiness probe",responses:{"200":{description:"Ready"}}},
        post:{security:[{ApiMarketOriginKey:[]}],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/CatalogRecordsRequest"}}}},summary:"Audit ecommerce product records for AIEO and AI-shopping readiness",responses:{"200":{description:"Audit result"}}}
      },
      "/api/catalog-remediation":{
        get:{summary:"Catalog remediation readiness probe",responses:{"200":{description:"Ready"}}},
        post:{security:[{ApiMarketOriginKey:[]}],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/CatalogRecordsRequest"}}}},summary:"Generate prioritized AIEO remediation with Merchant Center compatibility",responses:{"200":{description:"Remediation result"}}}
      },
      "/api/gtin-check":{
        get:{summary:"GTIN validation readiness probe",responses:{"200":{description:"Ready"}}},
        post:{security:[{ApiMarketOriginKey:[]}],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/GtinRequest"}}}},summary:"Validate GTIN UPC EAN identifiers",responses:{"200":{description:"GTIN result"}}}
      },
      "/api/feed-diff":{
        get:{summary:"Feed diff readiness probe",responses:{"200":{description:"Ready"}}},
        post:{security:[{ApiMarketOriginKey:[]}],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/FeedDiffRequest"}}}},summary:"Compare product-feed snapshots",responses:{"200":{description:"Feed diff result"}}}
      },
      "/api/shopify-aieo-quick-audit":{
        get:{summary:"Shopify AIEO quick-audit readiness probe",responses:{"200":{description:"Ready"}}},
        post:{summary:"Audit a public Shopify store for AI-shopping/AIEO readiness",responses:{"200":{description:"AIEO audit result"},"400":{description:"Invalid or inaccessible store"}}}
      },
      "/api/shopify-store-audit":{
        get:{summary:"Shopify full-store AIEO audit readiness probe",responses:{"200":{description:"Ready"}}},
        post:{summary:"Run a deeper public Shopify storefront audit for AI-shopping and Merchant Center readiness",responses:{"200":{description:"Full storefront audit result"},"400":{description:"Invalid or inaccessible store"}}}
      },
      "/api/agentpay":{
        get:{summary:"AgenticTrade service metadata",responses:{"200":{description:"Metadata"}}},
        post:{summary:"AgenticTrade-compatible catalog audit",responses:{"200":{description:"Audit result"}}}
      }
    }
  };
}

const probeMetadata = {
  "/api/catalog-audit": {
    service:"PAL Ecommerce Catalog Audit",
    method:"POST",
    price_per_call_usdc:"5",
    capabilities:["aieo","ai-shopping-readiness","catalog-audit","merchant-center-readiness"]
  },
  "/api/catalog-remediation": {
    service:"PAL Catalog Remediation Plan",
    method:"POST",
    price_per_call_usdc:"15",
    capabilities:["aieo","catalog-remediation","merchant-center-readiness","product-feed"]
  },
  "/api/gtin-check": {
    service:"PAL GTIN UPC EAN Validator",
    method:"POST",
    price_per_call_usdc:"3",
    capabilities:["gtin","upc","ean","checksum","product-identifiers"]
  },
  "/api/feed-diff": {
    service:"PAL Product Feed Diff",
    method:"POST",
    price_per_call_usdc:"8",
    capabilities:["product-feed","diff","catalog-monitoring","ecommerce"]
  },
  "/api/shopify-aieo-quick-audit": {
    service:"PAL AIEO Quick Shopify Audit",
    method:"POST",
    price_per_call_usdc:"5",
    capabilities:["shopify","aieo","ai-shopping","catalog-readiness","merchant-center","public-storefront-audit"]
  },
  "/api/shopify-store-audit": {
    service:"PAL Live Shopify Store Commerce Audit",
    method:"POST",
    price_per_call_usdc:"25",
    capabilities:["shopify","aieo","ai-shopping","catalog-readiness","merchant-center","public-storefront-audit","full-store"]
  }
};

const server=http.createServer(async (req,res)=>{
  const started=Date.now();
  const url=new URL(req.url||"/","http://localhost");
  const path=url.pathname;

  if(req.method==="OPTIONS") return send(res,204,{});

  try{
    if(req.method==="GET" && path==="/api/health"){
      return send(res,200,{ok:true,service:"PAL Marketplace Fast API",version:"1.2.1",latency_ms:Date.now()-started},{"x-magicapi-billing":"API=0"});
    }

    if(req.method==="GET" && path==="/api/openapi"){
      const proto=(req.headers["x-forwarded-proto"]||"https").split(",")[0].trim();
      return send(res,200,openApi(`${proto}://${req.headers.host}`),{"cache-control":"public, max-age=300","x-magicapi-billing":"API=0"});
    }

    if(req.method==="GET" && probeMetadata[path]){
      return send(res,200,{
        ok:true,
        ready:true,
        provider:"Practical Automation Lab",
        billing:"handled_upstream",
        ...probeMetadata[path]
      },{"x-magicapi-billing":"API=0"});
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

    if (API_MARKET_PAID_ROUTES.has(path)) {
      if (!process.env.PAL_API_MARKET_SHARED_SECRET || String(process.env.PAL_API_MARKET_SHARED_SECRET).length < 32) {
        return send(res,503,{error:"upstream_billing_configuration_required"});
      }
      if (!hasApiMarketOriginKey(req)) return send(res,401,{error:"invalid_api_market_origin_key"});
    }
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

    if(path==="/api/shopify-aieo-quick-audit"){
      const storeUrl=cleanString(body?.url);
      if(!storeUrl) return send(res,400,{error:"missing_url",detail:"Provide a public Shopify storefront URL in body.url"});
      const result=await shopifyAieoQuickAudit(storeUrl);
      return send(res,200,result);
    }

    if(path==="/api/shopify-store-audit"){
      const storeUrl=cleanString(body?.url);
      if(!storeUrl) return send(res,400,{error:"missing_url",detail:"Provide a public Shopify storefront URL in body.url"});
      const result=await shopifyAieoFullAudit(storeUrl);
      return send(res,200,result);
    }

    if(path==="/api/agentpay"){
      const records=extractAgentPayRecords(body?.messages);
      if(!records){
        return send(res,200,{ok:false,ready:true,error:"catalog_payload_required",detail:"Send messages containing JSON with {\"records\":[...]}. "});
      }
      if(records.length<1||records.length>100) return send(res,400,{error:"invalid_records"});
      return send(res,200,{...audit(records),marketplace:{provider:"AgenticTrade",billing:"handled_upstream"},generated_at:new Date().toISOString()});
    }

    return send(res,404,{error:"not_found"});
  }catch(error){
    const detail=error instanceof Error?error.message:String(error);
    const status=detail==="body_too_large"?413:
      /store_url_|shopify_catalog_|public_shopify_|too_many_store_redirects/.test(detail)?400:400;
    return send(res,status,{error:"request_failed",detail});
  }
});

server.listen(PORT,"0.0.0.0",()=>{
  console.log(`PAL Marketplace Fast API listening on ${PORT}`);
});
