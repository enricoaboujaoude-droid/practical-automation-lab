# Argo CD Sync-Progression Contract Preflight

Decide before merge or upgrade whether an Argo CD sync can deterministically progress through its waves and hooks.

The analyzer is browser-local and dependency-free. It reads rendered YAML, optional AppProject YAML, and current/target Argo CD versions. It emits reproducible `PASS`, `REVIEW`, or `BLOCK` evidence without cluster credentials or uploads.

## Checks in v0.1

- non-integer sync waves;
- ServiceAccount consumers scheduled at or before their dependency;
- hooks mixing normal-sync and deletion phases;
- named hooks without an explicit deletion/recreation policy;
- App-of-Apps wave use against the reported Argo CD 3.4.2 ordering regression;
- automated multi-wave syncs intersecting deny SyncWindows.

Every finding includes a stable rule ID, affected object, evidence, and remediation. Rules intentionally stop at deterministic conditions supported by published incidents or Argo CD semantics.

## Run

```bash
npm test
node cli.mjs --manifests sample/safe.yaml --target 3.3.9
node cli.mjs --manifests sample/blocked.yaml --current 3.3.9 --target 3.4.2
```

Formats: `json` (default), `html`, or `sarif`. A BLOCK result exits with code `2`.

```bash
node cli.mjs --manifests rendered.yaml --project appproject.yaml --current 3.3.9 --target 3.4.2 --format sarif --output evidence.sarif
```

Serve this directory as static files to use `index.html`; analysis stays in the browser.

## GitHub Action

```yaml
- uses: enricoaboujaoude-droid/practical-automation-lab/distribution/argocd-sync-progression-preflight@main
  with:
    manifests: rendered.yaml
    project: appproject.yaml
    current-version: 3.3.9
    target-version: 3.4.2
```

Success event: a non-owner public repository references the Action and produces evidence for a real Argo CD manifest change or upgrade. Publication and owner-run tests do not count.

## Troubleshooting

- [Argo CD sync wave stuck, hook waiting for deletion, or waves reordered after upgrade](argocd-sync-wave-stuck-hook-waiting-for-deletion.md)

## Evidence basis

- App-of-Apps v3.4.2 ordering regression: https://github.com/argoproj/argo-cd/issues/27917
- hook retry waiting-for-deletion deadlock: https://github.com/argoproj/argo-cd/issues/27507
- hook/wave ordering failure: https://github.com/argoproj/argo-cd/issues/26956
- SyncWindow stuck state: https://github.com/argoproj/argo-cd/issues/26128
- Argo CD wave/hook semantics: https://argo-cd.readthedocs.io/en/stable/user-guide/sync-waves/

This is a release-safety aid, not a proof that every runtime dependency or custom health check will succeed.
