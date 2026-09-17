# Shopify app release request

Purpose: trigger the controlled GitHub Actions release workflow for PAL Catalog Check.

Release intent:
- publish the current Shopify app configuration from `main`
- target the Partner-owned PAL Catalog Check app selected for Public distribution
- deploy through the explicit `production` configuration path
- set the production application URL to the existing Render service
- set embedded mode explicitly
- publish the production OAuth redirect URL
- include mandatory privacy-compliance webhook subscriptions
- preserve the current free, read-only review surface
- reject any placeholder `example.com` application URL before release
- do not add paid functionality or unrelated changes

Requested: 2026-09-18 — explicit production config redeploy, retry after adding required app name
