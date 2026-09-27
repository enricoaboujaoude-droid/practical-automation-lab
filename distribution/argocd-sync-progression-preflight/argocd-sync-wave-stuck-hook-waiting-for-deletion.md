# Argo CD sync wave stuck, hook waiting for deletion, or waves reordered after upgrade

If an Argo CD Application stays `Syncing`, a hook remains `Waiting for deletion`, a later wave never starts, or an App-of-Apps upgrade changes ordering, the failure may be a progression-contract problem rather than a Kubernetes schema error.

This guide shows how to reproduce those risks before merge with the [Argo CD Sync-Progression Contract Preflight](./).

## Fast check

Render the manifests that Argo CD will apply, then run:

```bash
node cli.mjs \
  --manifests rendered.yaml \
  --project appproject.yaml \
  --current 3.3.9 \
  --target 3.4.2 \
  --format sarif \
  --output argocd-sync-evidence.sarif
```

The analyzer is local and dependency-free. It does not connect to a cluster or upload manifests.

## What a BLOCK or REVIEW means

| Rule | Condition | Why progression can stop |
|---|---|---|
| `WAVE_INVALID` | a sync-wave annotation is not an integer | ordering is ambiguous |
| `SERVICEACCOUNT_ORDER` | a workload or Job is scheduled at or before its ServiceAccount | the consumer may start before the dependency exists |
| `HOOK_PHASE_MIXED` | one hook mixes normal sync with deletion phases | lifecycle ordering becomes contradictory |
| `HOOK_DELETE_POLICY_MISSING` | a named hook lacks an explicit recreation/deletion policy | retries can wait forever for the old hook to disappear |
| `ARGO_3_4_2_APP_OF_APPS_ORDER` | App-of-Apps waves target the reported 3.4.2 regression range | child Application ordering can differ after upgrade |
| `SYNCWINDOW_AUTOMATED_MULTIWAVE` | automated multi-wave sync intersects a deny SyncWindow | the operation may remain queued or stuck |

Exit code `0` means no blocking finding. Exit code `2` means at least one deterministic BLOCK. JSON, standalone HTML, and SARIF evidence use stable rule IDs and identify the affected object, observed values, and remediation.

## GitHub Actions

```yaml
- uses: enricoaboujaoude-droid/practical-automation-lab/distribution/argocd-sync-progression-preflight@main
  with:
    manifests: rendered.yaml
    project: appproject.yaml
    current-version: 3.3.9
    target-version: 3.4.2
```

Run it on pull requests that change Argo CD manifests, hooks, AppProjects, sync windows, or the Argo CD version. Keep the output as a review artifact so an ordering or lifecycle exception is explicit before deployment.

## Incident shapes this check reproduces

- [App-of-Apps wave ordering changed after v3.3.9 to v3.4.2](https://github.com/argoproj/argo-cd/issues/27917)
- [hook retry remained waiting for deletion](https://github.com/argoproj/argo-cd/issues/27507)
- [Job ran before its ServiceAccount because of hook/wave ordering](https://github.com/argoproj/argo-cd/issues/26956)
- [Applications remained Syncing with SyncWindows](https://github.com/argoproj/argo-cd/issues/26128)

The tool is a deterministic release-safety check. It does not prove that arbitrary runtime dependencies, custom health checks, or external services will succeed.
