# PAL Catalog Check — next actions

Priority order:

1. Keep Issue #5 open until genuine external/public launch.
2. Preserve the canonical Partner-owned app: **Practical Automation Lab → PAL Catalog Check**. Do not reuse earlier merchant-organization app identities or credentials.
3. Preserve **Public distribution**.
4. Preserve the clean production endpoint: **https://pal-catalog-check-app.onrender.com**.
5. Preserve released Shopify version **`pal-catalog-check-5`** unless a later verified release intentionally replaces it.
6. Keep the legacy Render service alive temporarily as rollback infrastructure until final pre-submission validation is complete.
7. Remove the obsolete **PAL Feed Health** legacy installation from the development store; do not remove PAL Catalog Check.
8. After legacy-app cleanup, confirm PAL Catalog Check still opens and rescans successfully.
9. Confirm required Partner/App Store contact fields: API contact email, merchant support email, emergency developer contact, and review contact.
10. Upload/confirm the prepared 1200×1200 text-free PAL Catalog Check icon.
11. Capture real embedded-app screenshots. Do not fabricate or generate review screenshots.
12. Record the real review screencast showing install/open, scan result, finding/remediation, rescan, Support, and read-only behavior.
13. Run Shopify's automated pre-submission checks and resolve every failed requirement, including lifecycle/privacy webhook recognition.
14. If the current one-time App Store registration fee (authorized up to $19 USD) is then the final meaningful blocker, register/pay it. No other pre-revenue spend is authorized.
15. Submit PAL Catalog Check for App Store review.
16. Measure public installs, first scans, repeat scans, commercial intent, retention, and eventual revenue. Do not count development-store activity as market demand.
17. Track any registration cost until genuine observable net PAL Catalog Check revenue exceeds it after relevant processing/platform costs.
18. Continue zero-cost distribution/product hardening and Opportunity Hunter research in parallel; create another build only for a materially stronger or complementary opportunity.

Current verified baseline:

- Partner organization: Practical Automation Lab
- app: PAL Catalog Check
- distribution: Public
- released configuration: `pal-catalog-check-5`
- production URL: https://pal-catalog-check-app.onrender.com
- dev store: PAL Feed Health Dev (`pal-feed-health-dev.myshopify.com`)
- clean endpoint install/auth/session: PASS
- latest real scan: 17 products, readiness score 62
- two controlled post-cutover rescans: PASS, HTTP 200, same 17/62 result
- fresh durable Neon offline session: PASS
- scope: `read_products` only
- latest GitHub CI: PASS (audit, DB check, tests, typecheck, build)
- legacy Render traffic during controlled cutover verification: none
- genuine external Shopify beta interest in latest verification window: 0
- revenue: $0
- App Store registration spend: $0
