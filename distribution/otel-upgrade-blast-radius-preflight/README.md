# OpenTelemetry Dashboard/Alert Upgrade Blast-Radius Preflight

Credential-free, deterministic preflight for one job: before promoting an OpenTelemetry Collector, SDK, instrumentation, or semantic-convention upgrade, prove whether saved Grafana panels and Prometheus alerts still have the metrics and labels they depend on.

It compares a baseline and after-canary Prometheus exposition snapshot, extracts PromQL from Grafana dashboard JSON and Prometheus rule YAML, and emits stable `PASS`, `REVIEW`, or `BLOCK` evidence. Everything runs locally; no telemetry, credentials, backend, API, AI, database, or network fetch is used.

## Quick check

```bash
npm test
npm run safe
npm run incident
```

The incident fixture exits `1` intentionally and writes `sample-output.json`, `sample-output.html`, and `sample-output.sarif`.

## CLI

```bash
node cli.mjs \
  --before before.prom \
  --after after-canary.prom \
  --consumer dashboard.json \
  --consumer prometheus-rules.yml \
  --json otel-preflight.json \
  --html otel-preflight.html \
  --sarif otel-preflight.sarif
```

Exit `1` means `BLOCK`; `PASS` and `REVIEW` exit `0` so teams can choose whether reviews are policy-blocking.

## GitHub Action

```yaml
- name: Check OTel consumer blast radius
  uses: enricoaboujaoude-droid/practical-automation-lab/distribution/otel-upgrade-blast-radius-preflight@main
  with:
    before: evidence/before.prom
    after: evidence/after-canary.prom
    consumers: |
      monitoring/grafana-checkout.json
      monitoring/prometheus-rules.yml
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: otel-upgrade-preflight
    path: otel-preflight.*
```

## Stable rules

| Rule | Level | Meaning |
|---|---|---|
| `OTEL-METRIC-REMOVED` | BLOCK | A baseline metric referenced by a saved query is absent after the upgrade. |
| `OTEL-SELECTOR-LABEL-REMOVED` | BLOCK | A query selector requires a label no longer observed on that metric. |
| `OTEL-GROUP-LABEL-REMOVED` | REVIEW | A grouping/join label is absent from every surviving referenced metric. |

This is a static dependency preflight, not a PromQL evaluator. It intentionally supports only Prometheus exposition text, Grafana JSON, and Prometheus rule YAML in v0.1. It does not claim semantic equivalence, query correctness, alert firing, or production safety.

## Measurable success event

One non-owner public repository references the Action and analyzes real before/after inventory plus at least one Grafana or Prometheus consumer file. Owned fixtures, owner-run workflows, stars, page views, and repository publication do not count.

## Evidence basis

- OpenTelemetry demo breakage after attribute renames: https://opentelemetry.io/blog/2026/we-broke-the-demo/
- Collector upgrade removed an internal metric and broke a monitor: https://github.com/open-telemetry/opentelemetry-collector/issues/15568
- Schema renames can silently stop queries, SLOs, and alerts: https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/47420
- Operators repeatedly rewrote recommended alerts after metric renames: https://github.com/open-telemetry/opentelemetry-collector/issues/13544
