# Practical Automation Lab

Practical Automation Lab builds privacy-conscious tools for product data, commerce operations, integration readiness, compliance-data preparation, and business economics.

**Live products:** https://practical-automation-lab.onrender.com/

## Paid Commerce Catalog Intelligence API

PAL exposes a production **MCP + x402 API** for ecommerce product-feed intelligence. It is designed for AI agents, commerce automation, feed-management systems, and developers working with Google Merchant Center data.

**Live marketplace:** https://pal-nano-catalog-audit.onrender.com/marketplace  
**Remote MCP:** https://pal-nano-catalog-audit.onrender.com/mcp  
**Official MCP Registry:** https://registry.modelcontextprotocol.io/?q=io.github.enricoaboujaoude-droid%2Fpal-commerce-catalog-intelligence  
**RapidAPI paid plans:** https://rapidapi.com/enricoaboujaoudedroid/api/pal-catalog-feed-auditor/pricing  
**RapidAPI API page:** https://rapidapi.com/enricoaboujaoudedroid/api/pal-catalog-feed-auditor  
**PayAPI Market (premium, settlement-verified):** https://payapi.market/api/pal-batch-catalog-remediation  
**Agent Tools ($20 full-catalog, verified):** https://agent-tools.cloud/services/pal-nano-catalog-audit-onrender-com-sub1146  
**PayAPI Market (audit):** https://payapi.market/api/pal-catalog-feed-auditor  
**Settlement-verified PayAPI listing:** https://payapi.market/api/pal-catalog-feed-auditor  
**Glama hosted connector:** https://glama.ai/mcp/connectors/io.github.enricoaboujaoude-droid/pal-commerce-catalog-intelligence  
**OpenAPI:** https://pal-nano-catalog-audit.onrender.com/openapi.json

RapidAPI public plans are now live: **BASIC $0 (10 requests/month)**, **PRO $25 (500/month, recommended)**, **ULTRA $75 (2,500/month)**, and **MEGA $150 (7,500/month)**, with usage overages on paid tiers.

Paid operations include:

- **Full catalog remediation — $20.00/call:** one prioritized Merchant Center/product-feed remediation plan for up to 2,000 products.
- **Batch catalog remediation — $5.00/call:** prioritized Merchant Center/product-feed remediation for up to 500 products in one payment.
- **Catalog remediation plan — $1.00/call:** prioritized Merchant Center/product-feed fixes for up to 100 products.
- **Catalog audit — $0.01/call:** duplicate IDs, GTIN/checksum issues, URLs, price formatting, availability, and identifier consistency.
- **GTIN / UPC / EAN validation — $0.01/call.**
- **Product feed diff — $0.01/call.**
- **x402 declaration validation — $0.05/call.**

Direct calls use **x402 v2 exact settlement in USDC on Base**. No PAL account or API key is required for direct paid calls.

### API provider revenue channel

API providers that want agent-native distribution can join AgenticTrade through PAL's referral link:

https://agentictrade.io/portal/register?ref=6HDHVHZ3

PAL earns **20% of AgenticTrade's platform commission from referred provider usage for the lifetime of the active referral**. The current referral dashboard shows one pending provider and no realized referral revenue yet.



## PAL Catalog Check for Shopify

**Install free from the Shopify App Store:** https://apps.shopify.com/pal-catalog-check

**Current merchant pilot:** We’re looking for 5 Shopify merchants to run one real Free-plan scan and send practical feedback on what the scanner catches or misses. No testimonial is required. Feedback: enricoaboujaoude@gmail.com

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

## API and integration migration tools

### Google Content API → Merchant API Migration Preflight

A browser-local migration-readiness checker for developers and agencies moving Google Shopping integrations from the deprecated Content API for Shopping to Merchant API. It helps identify migration-sensitive patterns without requiring API credentials or sending pasted integration material to PAL servers.

Google officially sunset Content API for Shopping on **18 August 2026**. Google says clients without an active extension began receiving intermittent `HTTP 410 Gone` failures from **1 September 2026**, with full decommissioning planned for early 2027. Existing integrations should migrate to Merchant API.

Run the migration preflight:
https://practical-automation-lab.onrender.com/google-merchant-api-migration-preflight.html

Official migration references:
- Google Content API sunset timetable: https://developers.google.com/shopping-content/guides/deprecation-and-sunset
- Merchant API compatibility guide: https://developers.google.com/merchant/api/guides/compatibility

### HubSpot API Migration Preflight

A browser-local compatibility preflight for developers, integration owners, and agencies reviewing HubSpot API and developer-platform migration risk. It is designed for migration planning without requiring HubSpot credentials or uploading source repositories.

HubSpot is moving its developer ecosystem toward the Projects-based platform and date-based API versions. Current published transition points include the **31 October 2026** sunset of legacy CRM Cards, the **4 December 2026** Pipelines API V1 sunset, and **30 March 2027** end of support for HubSpot v4 APIs. These deadlines can affect existing integrations, app certification, and ongoing compatibility.

Run the migration preflight:
https://practical-automation-lab.onrender.com/hubspot-api-migration-preflight.html

Official migration references:
- HubSpot developer changelog: https://developers.hubspot.com/changelog
- Legacy CRM Cards deprecation: https://developers.hubspot.com/changelog/deprecating-support-for-classic-crm-cards
- HubSpot v4 API end of support: https://developers.hubspot.com/changelog/deprecating-support-for-hubspot-v4-apis
- Developer Platform migration guidance: https://developers.hubspot.com/developer-platform-basics

Both tools are technical migration-readiness aids. They do not guarantee that an integration is complete, certified, or free of runtime issues.

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

## Open-source operator tools

### Argo CD Sync-Progression Contract Preflight

A browser-local tool, zero-dependency CLI, and GitHub Action that checks whether rendered Argo CD/Kubernetes manifests can deterministically progress through sync waves and hooks. It emits PASS/REVIEW/BLOCK JSON, HTML, or SARIF evidence for dependency-order inversions, hook lifecycle deadlocks, SyncWindow conflicts, invalid waves, and the reported Argo CD 3.4.2 App-of-Apps ordering regression.

- [Tool, CLI, Action, tests, and samples](distribution/argocd-sync-progression-preflight/)
- [Guide: sync wave stuck, hook waiting for deletion, or waves reordered after upgrade](distribution/argocd-sync-progression-preflight/argocd-sync-wave-stuck-hook-waiting-for-deletion.md)

### Terraform Provider-Upgrade Replacement Contract Preflight

A credential-free browser tool, CLI, and GitHub Action that compares baseline and candidate Terraform plan JSON plus provider lockfiles. It emits deterministic PASS/REVIEW/BLOCK evidence for provider-upgrade-induced destroy/create actions, provenance mismatches, replacement paths, newly unknown values, and high-risk database, identity, network, or cluster replacements.

- [Tool, CLI, Action, tests, and sample](distribution/terraform-provider-upgrade-preflight/)
- [Guide: provider upgrade forces replacement](distribution/terraform-provider-upgrade-preflight/terraform-provider-upgrade-forces-replacement.md)

### Helm Ownership Transfer Preflight

A browser-local tool and zero-dependency CLI for Helm `--take-ownership`, chart splits, and multi-release collisions. It combines old release history, an adopting manifest, and optional live metadata to emit deterministic PASS/REVIEW/BLOCK evidence for cross-release deletion, unexpected owners, shared cluster-scoped resources, hooks, and missing live verification.

- [Tool, CLI, tests, and Helm #32218 fixture](distribution/helm-ownership-transfer-preflight/)

### GitHub Runner Routing Contract Preflight

A credential-free browser tool, CLI, and GitHub Action that expands finite workflow matrices and compares `runs-on` labels/groups with a redacted self-hosted runner inventory. It emits deterministic PASS/REVIEW/BLOCK evidence for unsatisfiable routes, repository-access conflicts, broad fallbacks, and single-runner bottlenecks.

- [Tool, CLI, Action, tests, and samples](distribution/github-runner-routing-preflight/)

### PostgreSQL Restore Portability Preflight

A dependency-free browser tool, CLI, and GitHub Action that compares `pg_restore --list` metadata with a redacted destination inventory. It produces deterministic PASS/REVIEW/BLOCK evidence for missing owner roles, unavailable extensions, and unsafe PostgreSQL major-version direction—without uploading the dump or connecting to the database.

- [Tool, CLI, Action, tests, and samples](distribution/pg-restore-portability-preflight/)
- [Guide: unsupported archive version and `transaction_timeout`](distribution/pg-restore-portability-preflight/pg-restore-unsupported-version-transaction-timeout.md)

### OpenTelemetry Dashboard/Alert Upgrade Blast-Radius Preflight

A browser-local tool, zero-dependency CLI, and Node 20 GitHub Action that compares before/after-canary Prometheus inventories with Grafana dashboard JSON and Prometheus rule YAML. It emits deterministic PASS/REVIEW/BLOCK JSON, standalone HTML, and SARIF evidence when saved consumers lose metrics or required labels during an OpenTelemetry upgrade.

- [Tool, CLI, Action, tests, fixtures, and evidence samples](distribution/otel-upgrade-blast-radius-preflight/)
- [Guide: OpenTelemetry upgrade broke a Grafana dashboard or Prometheus alert](distribution/otel-upgrade-blast-radius-preflight/opentelemetry-upgrade-broke-grafana-dashboard-prometheus-alert.md)

## Important

Never commit secrets, access tokens, customer data, merchant catalog contents, or private credentials to this repository.
