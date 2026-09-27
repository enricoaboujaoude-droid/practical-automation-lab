# OpenTelemetry upgrade broke a Grafana dashboard or Prometheus alert

An OpenTelemetry Collector, SDK, instrumentation, or semantic-convention upgrade can be operationally healthy while silently removing the metric or label a saved PromQL query expects. The Collector keeps running, but a Grafana panel becomes empty or an alert stops matching.

This guide shows a credential-free preflight that checks those dependencies before the upgrade is promoted.

## Failure pattern

Typical symptoms include:

- a Collector metric changes name or stops being emitted;
- a semantic-convention migration renames an attribute used as a Prometheus label;
- a dashboard selector still references the old label;
- an alert or recording rule still references the old metric;
- no query error occurs—the result is simply empty or incomplete.

OpenTelemetry Collector issue [#13544](https://github.com/open-telemetry/opentelemetry-collector/issues/13544) reports recommended Prometheus alert rules breaking after repeated metric-name changes. Collector issue [#15568](https://github.com/open-telemetry/opentelemetry-collector/issues/15568) reports a monitor breaking when an internal metric disappeared after an upgrade. Collector-Contrib issue [#47420](https://github.com/open-telemetry/opentelemetry-collector-contrib/issues/47420) describes saved queries, SLOs, and alerts silently stopping after schema renames.

## Capture before and after inventories

Use the same endpoint and collection method for both snapshots. Collector internal Prometheus metrics default to port 8888 unless configured otherwise.

Before the upgrade:

```bash
curl --fail --silent --show-error http://127.0.0.1:8888/metrics > evidence/before.prom
```

After deploying a canary with the candidate version:

```bash
curl --fail --silent --show-error http://CANARY_HOST:8888/metrics > evidence/after-canary.prom
```

Do not commit snapshots containing labels that disclose hostnames, tenant identifiers, or other sensitive values. The checker needs metric and label names, not production label values; redact values consistently if necessary.

## Check saved consumers

Export the affected Grafana dashboards as JSON and include Prometheus rule YAML from the same repository or release bundle.

```bash
node cli.mjs \\
  --before evidence/before.prom \\
  --after evidence/after-canary.prom \\
  --consumer monitoring/grafana-checkout.json \\
  --consumer monitoring/prometheus-rules.yml \\
  --json otel-preflight.json \\
  --html otel-preflight.html \\
  --sarif otel-preflight.sarif
```

Interpretation:

- `PASS`: no referenced baseline metric or required selector label disappeared.
- `REVIEW`: a grouping or join label disappeared from every surviving referenced metric.
- `BLOCK`: a saved query references a missing metric or requires a missing selector label.

A `BLOCK` exits with status 1, which can stop promotion in CI. The JSON, standalone HTML, and SARIF outputs contain stable rule IDs and exact consumer paths.

## Run it in a release workflow

```yaml
- name: Check OTel dashboard and alert dependencies
  uses: enricoaboujaoude-droid/practical-automation-lab/distribution/otel-upgrade-blast-radius-preflight@main
  with:
    before: evidence/before.prom
    after: evidence/after-canary.prom
    consumers: |
      monitoring/grafana-checkout.json
      monitoring/prometheus-rules.yml

- name: Preserve evidence
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: otel-upgrade-preflight
    path: otel-preflight.*
```

## What this check does not prove

This is a static dependency check, not a PromQL evaluator or production health test. A PASS does not prove equivalent metric values, alert firing behavior, cardinality, sampling, or dashboard semantics. It narrows one expensive failure mode: saved Prometheus/Grafana consumers losing the metric and label names they require.

The browser-local tool, CLI, Action, fixtures, and sample evidence are in the [OpenTelemetry upgrade blast-radius preflight](./README.md). The project is owned and maintained by Practical Automation Lab.
