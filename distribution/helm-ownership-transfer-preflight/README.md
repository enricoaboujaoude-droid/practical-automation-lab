# Helm Ownership Transfer Preflight

A deterministic, browser-local preflight for Helm `--take-ownership`, chart splits, and multi-release resource collisions. It models the ownership/deletion graph that a plain rendered-manifest diff misses.

## One job

Before transferring a Kubernetes object from one Helm release to another, answer: **can the old release history, the adopting chart, or unexpected live ownership delete or block this object?**

The analyzer reports:

- `DELETE_AFTER_TRANSFER` when both old history and adopter reference the identity;
- `INVALID_OWNER` and `OWNER_NAMESPACE_MISMATCH` for surprising live ownership;
- `SHARED_CLUSTER_RESOURCE` for CRDs and other cluster-scoped collisions;
- `DUPLICATE_TARGET_IDENTITY`, `KEEP_POLICY_MISSING`, `HOOK_LIFECYCLE_GAP`, and missing/unowned live evidence.

This is evidence, not a deployment engine. It never contacts a cluster, uploads a manifest, or modifies an object.

## Browser

Serve this directory as static files and open `index.html`. Choose the old stored manifest, adopting manifest, and optional redacted live inventory. Export JSON or standalone HTML evidence.

## CLI

```bash
node cli.mjs \
  --old samples/helm-32218-old.yaml \
  --adopting samples/helm-32218-adopting.yaml \
  --live samples/helm-32218-live.json \
  --old-release release-a --old-namespace test \
  --new-release release-b --new-namespace test \
  --json report.json --html report.html
```

Exit code `1` means `BLOCK`; `0` means `PASS` or `REVIEW`. Treat `REVIEW` as unresolved evidence, not approval.

Useful read-only evidence commands:

```bash
helm get manifest release-a -n test > old.yaml
helm template release-b ./chart-b -n test > adopting.yaml
kubectl get configmap shared-config -n test -o json > live.json
```

## Test

```bash
npm test
npm run sample
```

The tests reproduce the destructive transfer shape reported in [helm/helm#32218](https://github.com/helm/helm/issues/32218), plus invalid-owner, cluster-scoped, duplicate, missing-live, safe, and evidence-export cases.

## Privacy and hosting

All analysis runs locally. The static UI emits an in-page `helmOwnershipPreflight:analysisComplete` event containing only status and finding count; a host may connect that event to privacy-safe first-use measurement without receiving manifests. No backend, database, authentication, Render service, token, or paid infrastructure is required.

## Scope limits

The YAML reader intentionally extracts only resource identity and metadata labels/annotations. It does not emulate Kubernetes admission, server-side apply, immutable fields, controllers, finalizers, or live Helm execution. Always stage and back up production migrations.
