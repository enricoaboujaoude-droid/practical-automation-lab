# Terraform provider upgrade forces replacement: a safe preflight

A provider upgrade can turn an otherwise unchanged resource into a destroy/create operation. Terraform prints this as **must be replaced**, **forces replacement**, or the `-/+` action.

This guide explains how to separate an upgrade-induced replacement from an existing configuration change before applying it.

## The failure pattern

A typical sequence is:

1. The baseline provider version produces no replacement.
2. `terraform init -upgrade` changes the dependency lockfile.
3. The candidate plan proposes `delete` + `create` for an existing resource.
4. One or more attributes appear in `replace_paths` or are marked `# forces replacement`.

This can happen when a provider changes defaults, schema flags, state upgrades, attribute names, or unknown-value behavior. For example, [AWS provider issue #49618](https://github.com/hashicorp/terraform-provider-aws/issues/49618) documents a deprecated-region migration that proposes replacement even though the resource identity is unchanged.

## Preserve comparable evidence

Create the baseline and candidate plans from the same:

- Terraform configuration and commit
- input variables
- state snapshot
- Terraform version
- refresh mode

Only the provider selections in `.terraform.lock.hcl` should differ.

Save both plans as JSON:

```bash
terraform show -json baseline.tfplan > baseline-plan.json
terraform show -json candidate.tfplan > candidate-plan.json
```

Keep a copy of the baseline and candidate lockfiles beside those plans. Do not upload state, credentials, or provider tokens.

## What to compare

A useful gate should verify all of the following:

- at least one provider version changed;
- configuration and variable fingerprints still match;
- the candidate contains a `delete` + `create` action absent from the baseline;
- the resource address and type;
- Terraform's `replace_paths`;
- values that became unknown only in the candidate;
- whether the replacement affects a database, identity, network, or cluster resource.

A plain text diff is noisy because plan JSON contains unrelated computed values. The decision should be based on normalized resource actions and provenance, not prose.

## Run the local preflight

This repository includes a deterministic browser-local tool, CLI, and GitHub Action:

[Terraform Provider-Upgrade Replacement Contract Preflight](./README.md)

CLI:

```bash
node cli.js \
  --baseline-plan baseline-plan.json \
  --candidate-plan candidate-plan.json \
  --baseline-lockfile baseline.lock.hcl \
  --candidate-lockfile candidate.lock.hcl
```

The result is:

- **PASS**: provider versions changed, provenance matches, and no new replacement was found.
- **REVIEW**: evidence is incomplete but no replacement was proven.
- **BLOCK**: provenance is invalid or the upgrade introduced a replacement.

The tool emits JSON and standalone HTML evidence. It runs locally, does not execute Terraform, and makes no network requests.

## What BLOCK means

Do not apply automatically. Confirm the proposed replacement against:

1. the provider upgrade guide and changelog;
2. the provider issue tracker;
3. the resource's real lifecycle and blast radius;
4. available import, state-upgrade, or staged-migration procedures.

A BLOCK is evidence for review, not a claim that the provider is wrong.