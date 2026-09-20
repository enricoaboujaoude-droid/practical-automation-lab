# Practical Automation Lab

Practical Automation Lab builds privacy-conscious tools for product data, commerce operations, integration readiness, compliance-data preparation, and business economics.

**Live products:** https://practical-automation-lab.onrender.com/

## PAL Catalog Check for Shopify

PAL Catalog Check is a read-only Shopify catalog-readiness scanner. It reviews product and variant data for issues that can create product-feed problems and provides remediation guidance without editing the store.

- Shopify scope: `read_products`
- no customer or order access
- no product write access
- embedded Shopify interface
- Free and Pro plans

Product information:
https://practical-automation-lab.onrender.com/shopify-catalog-check.html

Support:
https://practical-automation-lab.onrender.com/pal-catalog-check-support.html

Privacy:
https://practical-automation-lab.onrender.com/pal-catalog-check-privacy.html

## Product Feed Preflight Auditor

Browser-local Shopify and Google Merchant product-feed preflight checks for structural errors, identifier gaps, image risks, and variant inconsistencies.

https://practical-automation-lab.onrender.com/product-feed-preflight.html

## Integration readiness tools

- Google Content API → Merchant API Migration Preflight  
  https://practical-automation-lab.onrender.com/google-merchant-api-migration-preflight.html
- HubSpot API Migration Preflight  
  https://practical-automation-lab.onrender.com/hubspot-api-migration-preflight.html

## Compliance-data readiness tools

### EUDR DDS V3 Technical Preflight

A free browser-local technical checker for teams preparing EUDR Due Diligence Statement V3 data for the EU Information System. It can inspect selected DDS XML/JSON, supplier CSV data and GeoJSON for machine-readable readiness issues such as V1/V2 migration leftovers, activity type, HS headings, quantities, producer-country/geolocation fields, coordinate precision and grouped-reference constraints.

The EUDR applies from **30 December 2026** for large and medium operators and from **30 June 2027** for most micro and small operators. The European Commission's current operator API documentation identifies **V3** as the current API and says V1/V2 are being replaced by the new V3 service contracts.

Run the technical preflight:
https://practical-automation-lab.onrender.com/eudr-dds-v3-preflight.html

Official technical references used by the tool:
- European Commission EUDR overview: https://environment.ec.europa.eu/topics/forests/deforestation/regulation-deforestation-free-products_en
- EUDR Information System DDS V3 API: https://eudr.webcloud.ec.europa.eu/tracesnt/help/eudr-documentation/operator/api/due-diligence-statement-v3.html
- EUDR Information System validation rules: https://eudr.webcloud.ec.europa.eu/tracesnt/help/eudr-documentation/operator/validation-rules.html

This is technical/data-readiness software, not legal advice, and a clean result does not guarantee regulatory compliance or acceptance by the EUDR Information System.

### EU Battery Passport Readiness Preflight

Browser-local technical/data-readiness checks for teams preparing battery product and passport data for upcoming EU battery-passport workflows.

https://practical-automation-lab.onrender.com/eu-battery-passport-preflight.html

## Business calculators

- Automation ROI Calculator
- Manual Task Cost Calculator
- Automation Payback Calculator
- Break-even ROAS Calculator
- E-commerce Profit Margin Calculator
- Maximum CPA Calculator
- Discount Profit Impact Calculator

All public browser-local tools are designed to keep uploaded or pasted business data in the browser unless a page explicitly states otherwise.

## Important

Never commit secrets, access tokens, customer data, merchant catalog contents, or private credentials to this repository.
