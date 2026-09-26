# Helm invalid ownership metadata and `--take-ownership` deletion risk

Helm's ownership error is a safety guard, not merely an annotation problem. Before adding labels, deleting a live object, or passing `--take-ownership`, distinguish three cases:

1. **Unowned live resource** — another controller or a previous installation created it without Helm metadata.
2. **Different release owner** — another release already controls the same group/kind/namespace/name.
3. **Transferred resource still present in old release history** — the dangerous case reproduced in [helm/helm#32218](https://github.com/helm/helm/issues/32218): release B adopts an object, then a later upgrade of release A can delete it even though the live annotations point to B.

## Collect read-only evidence

Do not paste Secrets or private values into a public report.

```bash
helm get manifest release-a -n test > old-release.yaml
helm template release-b ./chart-b -n test > adopting-release.yaml
kubectl get configmap shared-config -n test -o json > live-object.json
```

For a CRD or another cluster-scoped object, omit `-n` from the `kubectl get` command.

## Run the local preflight

Clone or download the [Helm Ownership Transfer Preflight](./README.md). Nothing is uploaded.

```bash
node cli.mjs \
  --old old-release.yaml \
  --adopting adopting-release.yaml \
  --live live-object.json \
  --old-release release-a --old-namespace test \
  --new-release release-b --new-namespace test \
  --json report.json --html report.html
```

A `BLOCK` result exits with code 1. Important findings:

| Finding | Meaning | Safe next decision |
|---|---|---|
| `DELETE_AFTER_TRANSFER` | Both the old stored release and adopter reference the object | Do not transfer and then upgrade the old release without an explicitly tested transition |
| `INVALID_OWNER` | Live owner is neither the declared old nor new release | Resolve the real owner; do not force adoption |
| `SHARED_CLUSTER_RESOURCE` | A CRD or other cluster object has competing release histories | Assign exactly one lifecycle owner |
| `UNOWNED_LIVE_RESOURCE` | Helm metadata is absent | Identify the creating controller and rollback path before adoption |
| `LIVE_STATE_UNVERIFIED` | No live metadata was supplied | Export the live object and rerun |

## What the preflight does not prove

It does not emulate admission webhooks, server-side apply, immutable fields, controllers, finalizers, or Helm execution. A clean static report is not permission to skip backups or staging. `helm.sh/resource-policy: keep` can reduce some deletion exposure, but it is not a substitute for sequencing and live-owner verification.

## Minimal #32218 reproduction included

The repository ships old/adopting/live fixtures that deterministically return `BLOCK` with `DELETE_AFTER_TRANSFER`. Run:

```bash
npm test
npm run sample
```
