# Terraform Provider-Upgrade Replacement Contract Preflight

Compare the same Terraform configuration under a baseline and candidate provider lockfile, then block newly introduced destroy/create actions before an upgrade reaches production.

The tool is deterministic and credential-free. Four local files enter; JSON and standalone HTML evidence leave. It does not run Terraform, contact a cloud API, upload files, or use AI.

## Troubleshooting guide

If a provider update makes an existing resource show `must be replaced`, `forces replacement`, or `-/+`, use the [Terraform provider upgrade forces replacement preflight guide](./terraform-provider-upgrade-forces-replacement.md) to preserve comparable plans and isolate upgrade-induced replacement paths.

## Inputs

1. Baseline `terraform show -json` plan
2. Candidate `terraform show -json` plan
3. Baseline `.terraform.lock.hcl`
4. Candidate `.terraform.lock.hcl`

Generate both plans from the same configuration, variables, state snapshot, Terraform version, and refresh mode. Only the provider lockfile should change.

## What it proves

- At least one provider version changed between lockfiles.
- Configuration and variable fingerprints match between plans.
- Which destroy/create actions appear only in the candidate plan.
- Terraform `replace_paths`, newly unknown values, and DB/IAM/network/cluster risk classification.
- Deterministic `PASS`, `REVIEW`, or `BLOCK` evidence.

`BLOCK` means provenance is invalid or an upgrade-introduced replacement exists. `REVIEW` means evidence is incomplete but no blocking condition was proven. `PASS` means provider versions changed, fingerprints match, and no new replacement was found.

## Browser-local use

Open `index.html`, select the four files, and download both evidence formats. The browser makes no network requests.

## CLI

```bash
node cli.js \
  --baseline-plan baseline-plan.json \
  --candidate-plan candidate-plan.json \
  --baseline-lockfile baseline.lock.hcl \
  --candidate-lockfile candidate.lock.hcl
```

Exit code `2` means BLOCK, `1` means invalid input, and `0` means PASS or REVIEW.

## GitHub Action

```yaml
- name: Provider upgrade contract preflight
  id: upgrade-preflight
  uses: enricoaboujaoude-droid/practical-automation-lab/distribution/terraform-provider-upgrade-preflight@main
  with:
    baseline-plan: baseline-plan.json
    candidate-plan: candidate-plan.json
    baseline-lockfile: baseline.lock.hcl
    candidate-lockfile: candidate.lock.hcl
```

Upload `upgrade-preflight.json` and `upgrade-preflight.html` with your normal artifact-retention policy if an approval record is required.

## Tests and sample

```bash
npm test
npm run sample
```

The included fixture models an AWS database provider upgrade that turns a no-op into replacement. Tests also cover Azure identity, Cloudflare network, Kubernetes cluster, provenance mismatches, unknown expansion, and existing baseline replacements.

## Measurable success event

The first external success event is a non-owner public repository referencing this Action and producing an evidence file for a real provider upgrade. Publication of this repository alone is not usage.

## Scope

This is a preflight evidence tool, not a guarantee of infrastructure safety. Review Terraform's plan and provider release notes before applying. No paid infrastructure, backend, authentication, database, telemetry, or Render dependency is used.
