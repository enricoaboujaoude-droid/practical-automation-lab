# PAL Catalog Check — next actions

Priority order:

1. Keep Issue #5 open until genuine external/public launch.
2. Preserve the canonical Partner-owned app: **Practical Automation Lab → PAL Catalog Check**. Do not reuse earlier merchant-organization app identities or credentials.
3. Preserve **Public distribution**. It has already been deliberately selected.
4. Fix the remaining App Store URL blocker before submission: rename the existing Render web service `pal-shopify-feed-health` **in place** to a neutral PAL Catalog Check name so the `onrender.com` application hostname no longer contains the word `Shopify`. Do not create a new Render workspace or service.
5. After the Render rename, update the runtime app URL environment value and the production Shopify configuration (`application_url` and OAuth redirect URL) to the new hostname.
6. Release the corrected configuration through the existing protected **Shopify App Deploy** GitHub Actions workflow. The workflow must continue rejecting `example.com` and must use the explicit `production` config path.
7. Clean reinstall on `PAL Feed Health Dev` and verify:
   - embedded app opens from Shopify Admin
   - a fresh/durable offline session is present in dedicated Neon Postgres
   - only `read_products` is granted
   - real scan completes successfully
   - rescan works
   - lifecycle/compliance webhooks return successfully
8. Confirm required Partner/App Store contact fields: API contact email, merchant support email, and emergency developer contact.
9. Upload/confirm the prepared 1200×1200 text-free PAL Catalog Check icon.
10. Capture real embedded-app screenshots. Do not fabricate or generate review screenshots.
11. Record the real review screencast showing install/open, scan result, finding/remediation, rescan, Support, and read-only behavior.
12. Run Shopify's automated pre-submission checks and resolve every failed requirement before submitting.
13. If the current one-time App Store registration fee (authorized up to $19 USD) is then the final meaningful blocker, register/pay it. No other pre-revenue spend is authorized.
14. Submit PAL Catalog Check for App Store review.
15. Measure public installs, first scans, repeat scans, commercial intent, retention, and eventual revenue. Do not count development-store activity as market demand.
16. Track any registration cost until genuine observable net PAL Catalog Check revenue exceeds it after relevant processing/platform costs.
17. Continue zero-cost distribution/product hardening and Opportunity Hunter research in parallel; create another build only for a materially stronger or complementary opportunity.

Current verified baseline before the URL rename:

- Partner organization: Practical Automation Lab
- app: PAL Catalog Check
- distribution: Public
- released configuration: `pal-catalog-check-4`
- dev store: PAL Feed Health Dev (`pal-feed-health-dev.myshopify.com`)
- migrated install/auth/session: PASS
- latest real scan: 17 products, readiness score 62
- latest GitHub CI: PASS (audit, DB check, tests, typecheck, build)
- latest observed `app/uninstalled` Shopify retry after migration: HTTP 200
- genuine external Shopify beta interest in latest verification window: 0
- revenue: $0
- App Store registration spend: $0
