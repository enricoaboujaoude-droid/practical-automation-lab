# PostgreSQL Restore Portability Preflight

A dependency-free, local preflight for one job: **find portability blockers before a PostgreSQL archive restore begins**.

It compares metadata from `pg_restore --list` with a small, redacted target inventory and emits reproducible `PASS`, `REVIEW`, or `BLOCK` evidence. The archive and target details stay on the operator's machine.

## Scoped checks

- archive owner roles missing on the target;
- extensions unavailable on the target;
- source or `pg_dump` major version newer than the destination.

This is not a restore drill and does not prove data integrity, row counts, application compatibility, privileges, or runtime success. A clear result should be followed by a disposable restore with `--exit-on-error`.

## Browser

Serve this directory as static files and open `index.html`, or use any static host. Paste the TOC and redacted target inventory, then download JSON or HTML evidence. No backend, analytics, database, credential, or uploaded dump is required.

## CLI

Requirements: Node.js 20 or newer. No install step.

```bash
pg_restore --list backup.dump > archive.list
node cli.mjs --toc archive.list --target target.json --json report.json --html report.html
```

Exit codes: `0` for PASS/REVIEW, `2` for BLOCK, `1` for invalid input/runtime errors. Add `--no-owner` only when the real restore will explicitly use that option.

Target inventory schema:

```json
{
  "serverVersion": "16.4",
  "roles": ["app_owner"],
  "availableExtensions": ["pg_trgm", "plpgsql"]
}
```

Generate it with read-only catalog queries on the destination; do not include passwords, hostnames, connection strings, or dump data.

## GitHub Action

Reference this repository path from a workflow after generating or checking in redacted metadata:

```yaml
- name: PostgreSQL restore portability preflight
  uses: enricoaboujaoude-droid/practical-automation-lab/distribution/pg-restore-portability-preflight@main
  with:
    toc-path: archive.list
    target-path: target.json
```

The action writes `pg-restore-preflight.json` and `pg-restore-preflight.html`, publishes a step summary, and fails with exit code 2 on BLOCK. Pin a commit SHA in production.

## Verify

```bash
npm test
npm run sample:safe
npm run sample:risky
```

The risky sample intentionally exits `2`. Measurable success is one non-owner repository referencing the action and producing a report for a real restore plan.
