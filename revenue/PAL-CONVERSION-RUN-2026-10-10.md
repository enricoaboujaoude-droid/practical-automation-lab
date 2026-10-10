# PAL conversion execution — 2026-10-10

## Objective and current revenue evidence

Focus on merchant payment conversion rather than sub-dollar validation receipts or passive registrations. No new material customer payment was verified in this run. The recorded Base USDC revenue ledger had a total 0.12 USDC from small verification-era transfers as of its 2026-10-10T11:22Z scan; this is **not** evidence of a newly won $20+ customer order.

The PAL Shopify App Store listing is publicly live with a Free plan and Shopify-billed Pro at USD 19/month or USD 199/year. The app had no visible public reviews at audit time. Neon aggregate app tables show five distinct recorded shop sessions, scans by one shop, and no scans in the past seven days. Session count must not be represented as active subscribers.

## Executed and independently checked

1. `shopify-store-audit.html`: inserted a read-only public preview that makes POST requests to Neon's live `palmarket` AIEO quick-audit route. Displays a clearly labeled heuristic score, bounded public product sample, and three lowest-coverage fields. Customers enter their own public HTTPS storefront (no merchant credentials). Supports `?store=https%3A%2F%2F...` prefill without auto-submitting.
2. Above-the-fold Shopify Pro conversion section advertises the exact public App Store plan terms ($19/month or $199/year) and links directly to Shopify's app page. Existing direct $25 USDC PayanAgent checkout and $5 agent-marketplace/paid API options remain on the page. Homepage hero now prioritizes sample → Shopify Free/Pro → developer API. Shopify Pro click events are instrumented.
3. Live Render site deployed at commit `60cfaf02de0ea63341b3747ea1c97ed64a12662d`. External GitHub Actions smoke test reported a valid Neon public storefront audit for 26 products with a heuristic score of 4/100 and confirmed both checkout/Shopify links on the published page.
4. A separate no-payment GitHub Actions probe verified that **both** Render's and Neon's $25 Shopify audit endpoints respond to unpaid requests with HTTP 402 and the payment-required header. This does NOT establish paid settlement completion and no wallet was charged.
5. Restarted bounded fresh-shop discovery against the public October 10 FisherLeads list, excluding known contacted stores. Fixed an untracked-file persistence bug. The workflow found ten publicly reachable Shopify catalogs with business contact information from 24 candidates and saved a dated queue.
6. Built a second GitHub workflow to audit up to 10 new stores using the Neon API. Ten of ten public samples returned score/coverage reports, saved at `revenue/new-store-aieo-audits.json`. Reports omit prospect email addresses.
7. Individually sent **two** non-repeated business messages, grounded in public sample evidence: `mellinpassage.com` (7 products; score 45; no visible identifier/image-alt coverage) and `meridianridgeco.com` (21 products; score 39; no visible identifier/image-alt coverage). Each message links to its own prefilled live check and the official Shopify App Store; no AI placement guarantee or hidden login was claimed. Both domains were added to outreach suppression immediately. No bulk email campaign was launched.
8. Configured the lead-queue workflow to run daily via GitHub Actions at 07:17 UTC; the audit workflow triggers when the queue changes. Discovery and diagnostic collection are automated at zero incremental lead-data spend; email sending is deliberately non-automated to prevent indiscriminate mass outreach.

## Follow-up gates

- Confirm actual merchant reply, app activation, subscription checkout, or blockchain payment receipt **before** reporting revenue. Sent messages, indexed APIs, preview audits and zero-charge HTTP 402 checks are not payments.
- Improve installed-shop activation only after observing a real onboarding issue; don't infer subscriber count from OAuth session records.
- Validate the full path from Shopify Pro purchase to billing/payout and the $25 PayanAgent settlement in a legitimate buyer transaction before promoting “customer revenues.”
- Preserve the no-spam suppression and explicit opt-out behavior; do not email any `revenue/shopify-outreach-suppression.json` domains again.
- Maintain Render rollback and the Neon migration data protections from `docs/PAL-RENDER-TO-NEON-MIGRATION-2026-10-10.md` while revenue products are still being moved.

## Grounded links

- Website: https://practical-automation-lab.onrender.com/
- Preflight/upgrade: https://practical-automation-lab.onrender.com/shopify-store-audit.html
- Shopify app: https://apps.shopify.com/pal-catalog-check
- $25 audit offer: https://payanagent.com/x402/kh7bfj8ff0xgesyj7cemjz2p518fynqm
- Audit evidence: `revenue/new-store-aieo-audits.json`
- Source contact queue: `revenue/shopify-lead-queue.json`
- Suppression: `revenue/shopify-outreach-suppression.json`
