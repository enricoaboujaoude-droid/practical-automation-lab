# PAL Catalog Check — next actions

Priority order:

1. Keep Issue #5 open and advance only verified launch-readiness work.
2. Complete every remaining no-cost App Store submission requirement.
3. Finish the one-time Shopify deployment-automation setup: create an app-scoped App Automation Token in the Shopify Dev Dashboard and store it directly in GitHub Actions as `SHOPIFY_APP_AUTOMATION_TOKEN`; store the app Client ID directly as `SHOPIFY_APP_CLIENT_ID`. Never paste either value into chat, issues, commits, or logs.
4. Run the controlled **Shopify App Deploy** GitHub Actions workflow on `main` so the current `shopify.app.toml` configuration, including mandatory compliance webhook subscriptions, is released as a Shopify app version.
5. Verify the released version in Shopify Dev Dashboard and confirm compliance subscriptions are visible to Shopify.
6. Finalize public/admin name and all required contact fields.
7. Capture real embedded-app screenshots.
8. Record the real review screencast.
9. Run Shopify automated pre-submission checks.
10. Choose Public distribution deliberately when ready.
11. If the current $19 App Store registration fee is then the only meaningful blocker, use the owner's conditional authorization and register.
12. Submit for review.
13. Measure public installs, first scan, repeat scan, commercial intent and eventual revenue.
14. Track registration cost until genuine net app revenue exceeds it.
15. Continue product hardening and zero-cost distribution while review is pending.
16. Continue Opportunity Hunter research in parallel and create a new approved build only for a materially stronger or complementary opportunity.
