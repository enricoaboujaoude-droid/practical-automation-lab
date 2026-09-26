# `pg_restore`: unsupported archive version, then `transaction_timeout`

These two errors are different compatibility failures in the same restore path.

## 1. `unsupported version (1.16) in file header`

The local `pg_restore` executable is too old to read the archive format. If the archive was produced by PostgreSQL 18, use a PostgreSQL 18 `pg_restore` binary to inspect it:

```bash
/usr/lib/postgresql/18/bin/pg_restore --list database.backup > archive.list
```

Upgrading only the client solves archive decoding. It does not make an older destination server compatible with SQL emitted by PostgreSQL 18.

## 2. `unrecognized configuration parameter "transaction_timeout"`

This indicates that a newer dump is being loaded into an older destination server that does not support the emitted setting. A PostgreSQL 18 client can read the archive, but a PostgreSQL 16 destination can still reject PostgreSQL 18-era commands.

The safest choices are:

1. restore into an equal or newer PostgreSQL major version; or
2. obtain a new dump created for the documented destination version using a compatible `pg_dump` workflow.

Do not treat `warning: errors ignored on restore` as proof of a complete restore. Use `--exit-on-error` in a disposable environment and verify application invariants and data separately.

## Metadata-only preflight

The [PostgreSQL Restore Portability Preflight](./README.md) compares the generated `archive.list` with a redacted target inventory before the real restore. For a PostgreSQL 16 destination:

```json
{
  "serverVersion": "16.13",
  "roles": ["app_owner"],
  "availableExtensions": ["vector"]
}
```

Run:

```bash
node cli.mjs --toc archive.list --target target.json --json report.json --html report.html
```

The tool blocks when the source or `pg_dump` major version is newer than the destination, or when required owner roles/extensions are absent. It runs locally and never uploads the archive or target inventory.

This check is deliberately narrow. It does not rewrite a dump, execute a restore, or certify that restored data and application behavior are correct.
