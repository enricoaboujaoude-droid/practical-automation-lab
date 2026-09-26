# GitHub required check stuck “Expected — Waiting”: preflight checklist

This checklist helps diagnose a class of GitHub ruleset deadlocks before a ruleset or workflow change reaches a protected branch.

## Configuration pairs to verify

1. **Merge queue ↔ `merge_group` trigger**  
   If a ruleset requires merge queue, the workflow that produces each required check should handle `merge_group` as well as `pull_request`.

2. **Required context ↔ emitted job name**  
   Every exact required-status-check context must correspond to a job/check the workflow can emit. GitHub required contexts are not wildcard patterns.

3. **Required workflow ↔ path filters**  
   A required workflow filtered by `paths` or `paths-ignore` can be skipped for some changes, leaving the required check waiting.

4. **Target branch ↔ branch filters**  
   For `pull_request`, branch filters apply to the pull request's base branch. Stacked pull requests targeting intermediate branches can therefore skip a workflow scoped only to `main` or `develop`.

5. **Unique context names**  
   Duplicate check names can make the source of a passing status ambiguous and should be reviewed before enforcement.

## Local deterministic preflight

[GitHub Ruleset Mergeability Preflight](./index.html) accepts exported ruleset JSON plus workflow YAML and emits PASS, REVIEW, or BLOCK with downloadable JSON and HTML evidence.

It runs entirely in the browser. No GitHub token, repository access, backend, or upload is required.

### What it can prove

- required merge queue without a `merge_group` trigger;
- required contexts absent from workflow job names;
- wildcard and duplicate required contexts;
- path filters that can skip a required workflow;
- branch filters and other repository-dependent cases that need review.

### Scope boundary

The tool does not inspect live check runs or decide whether an old status belongs to the current base/head. Use the report as a configuration preflight, then verify the exact live commit and ruleset behavior in GitHub.

## Ownership

This guide and the linked open-source preflight are maintained in this repository. They are provided as a zero-cost diagnostic surface for the blocked-merge and “Expected — Waiting” failure pattern.
