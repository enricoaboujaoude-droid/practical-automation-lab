# Shopify app deployment automation

Status: prepared, waiting for one-time account credential setup.

## Why this exists

Shopify now supports app-scoped App Automation Tokens for CI/CD. PAL uses a controlled GitHub Actions workflow at `.github/workflows/shopify-app-deploy.yml` so app configuration changes can be deployed and released without repeating manual Dev Dashboard version releases.

The workflow is intentionally `workflow_dispatch` only. It does not release on every repository push.

## Required GitHub Actions secrets

Configure these in the `enricoaboujaoude-droid/practical-automation-lab` repository:

- `SHOPIFY_APP_AUTOMATION_TOKEN` — generated for the PAL app in Shopify Dev Dashboard. Never put this value in chat, source control, an issue, or a public log.
- `SHOPIFY_APP_CLIENT_ID` — the PAL Shopify app Client ID. Treat it as protected project configuration even though Shopify documentation describes the client ID as public metadata; do not post it in chat or source control under PAL's stricter project security rule.

## One-time Shopify action

In Shopify Dev Dashboard:

1. Open the PAL app.
2. Go to **Settings**.
3. Find **App Automation Token**.
4. Create a token with an appropriate expiry.
5. Copy it directly into the GitHub Actions secret named `SHOPIFY_APP_AUTOMATION_TOKEN` without pasting it anywhere else.

Also store the app Client ID directly in the GitHub Actions secret named `SHOPIFY_APP_CLIENT_ID`.

## Controlled release

After both secrets exist:

1. Open GitHub Actions for `practical-automation-lab`.
2. Choose **Shopify App Deploy**.
3. Run the workflow on `main`.
4. The workflow checks out the repository, uses Node 22.22.0, installs Shopify CLI, validates that the required secrets exist, and runs `shopify app deploy --allow-updates` against `shopify-feed-health-app`.
5. Verify the new app version in Shopify Dev Dashboard before proceeding to App Store submission.

## Safety controls

- The workflow does not use `--allow-deletes`.
- It does not deploy the Render web service; Render remains the web-app host.
- It never echoes secret values intentionally.
- Do not enable verbose Shopify CLI logging in CI because logs can contain sensitive context.
- Rotate the App Automation Token before expiry.
- Keep Issue #5 open until genuine public launch.
