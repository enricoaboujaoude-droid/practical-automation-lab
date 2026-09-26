# Supabase API-key Migration Preflight

A dependency-free, read-only Node CLI for checking whether a Supabase project is ready to replace legacy `anon` and `service_role` keys with `sb_publishable_` and `sb_secret_` keys.

It is deliberately narrow. It checks user-selected REST, Auth, and Edge Function endpoints with the exact header/key combinations expected after migration and emits a machine-readable report before legacy keys are disabled.

## Safety model

- Credentials stay in local environment variables.
- Only `GET` and `HEAD` are accepted.
- Cross-origin probes are rejected.
- Redirects are not followed.
- Response bodies are never read or stored.
- Reports contain only 12-character SHA-256 key fingerprints, never key values.
- No telemetry, backend, dependency install, or account is required.

Use a test or staging project first. Although probes are read-only, an endpoint may still have application-specific read side effects.

## Requirements

- Node.js 20 or newer
- A user-owned Supabase project with new publishable and secret keys enabled

## Run

```bash
cp preflight.config.example.json preflight.config.json
export SUPABASE_PUBLISHABLE_KEY='sb_publishable_...'
export SUPABASE_SECRET_KEY='sb_secret_...'
node ./bin/supabase-key-preflight.js --config ./preflight.config.json --output ./report.json
```

Windows CMD:

```bat
copy preflight.config.example.json preflight.config.json
set "SUPABASE_PUBLISHABLE_KEY=sb_publishable_..."
set "SUPABASE_SECRET_KEY=sb_secret_..."
node bin\supabase-key-preflight.js --config preflight.config.json --output report.json
```

Exit codes:

- `0`: every probe passed
- `1`: configuration or execution error
- `2`: at least one probe returned an unexpected result

## Add an Edge Function probe

Add a read-only health or diagnostic route owned by you:

```json
{
  "id": "function-health-user-jwt",
  "method": "GET",
  "path": "/functions/v1/health",
  "keyType": "publishable",
  "authStyle": "apikey-and-bearer",
  "expectedStatuses": [200]
}
```

`apikey-and-bearer` is included only for explicitly selected endpoints. For new secret keys, prefer `apikey` because an opaque `sb_secret_` value is not a user JWT.

## Test

```bash
npm test
```

The tests verify read-only enforcement, same-origin enforcement, header behavior, status classification, and credential redaction.

## Scope

This preflight reports compatibility evidence; it does not rotate or disable keys, mutate Auth users, verify every RLS policy, or fix platform-side failures. Keep legacy keys enabled until your own application tests and rollback plan also pass.
