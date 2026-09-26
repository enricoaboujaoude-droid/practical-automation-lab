# GitHub Runner Routing Contract Preflight

A dependency-free, credential-free preflight for one job: **prove whether GitHub Actions workflow routing can be satisfied by a redacted self-hosted runner fleet before merge**.

It expands finite `strategy.matrix` runner labels, intersects `runs-on` labels and groups with repository access, and emits reproducible `PASS`, `REVIEW`, or `BLOCK` evidence.

## Deterministic checks

- no eligible runner for a job or matrix member;
- unknown runner group or missing repository access;
- single-runner availability bottleneck;
- unsafe bare `self-hosted` fallback;
- all eligible runners currently offline/busy;
- dynamic routing expressions that require manual review.

Known GitHub-hosted labels such as `ubuntu-latest` are explicitly out of scope. This static evidence does not prove live GitHub service health, autoscaling latency, runner software health, or eventual queue time.

## Inputs

Workflow YAML plus a redacted inventory:

```json
{
  "repository": "acme/widgets",
  "runners": [
    {"name":"linux-1","labels":["linux","x64"],"group":"production","status":"online","busy":false}
  ],
  "groups": [
    {"name":"production","repositories":["acme/widgets"]}
  ]
}
```

Do not include tokens, URLs, IPs, hostnames, credentials, or private environment data. Runner names may be aliases.

## Browser

Open `index.html` directly or serve the directory as static files. All analysis and downloads stay in the browser.

## CLI

Node.js 20+, no install step:

```bash
node cli.mjs --workflow .github/workflows/build.yml --inventory runner-inventory.json --json report.json --html report.html
```

Exit codes: `0` for PASS/REVIEW, `2` for BLOCK, `1` for invalid input/runtime errors.

## GitHub Action

```yaml
- name: Runner routing contract preflight
  uses: enricoaboujaoude-droid/practical-automation-lab/distribution/github-runner-routing-preflight@main
  with:
    workflow-path: .github/workflows/build.yml
    inventory-path: runner-inventory.json
```

Pin a commit SHA in production. The action creates JSON and standalone HTML evidence and publishes a step summary.

## Verify

```bash
npm test
npm run sample:safe
npm run sample:risky
```

The risky sample intentionally exits `2`. Measurable success is one non-owner repository referencing the Action and producing evidence for a real runner-fleet change.

## Architecture and cost

Browser-local static assets, zero-dependency Node CLI, and Node 20 Action. No API call, token, backend, authentication, database, analytics, Render, or paid service. Runtime cost: $0.
