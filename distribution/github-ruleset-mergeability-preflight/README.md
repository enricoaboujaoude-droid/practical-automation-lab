# GitHub Ruleset Mergeability Preflight

A dependency-free browser tool that checks whether a GitHub ruleset's required status checks and a workflow can actually satisfy each other before the ruleset is activated.

## One job

Paste exported ruleset JSON and the workflow YAML expected to produce its required checks. The tool returns **PASS**, **REVIEW**, or **BLOCK**, plus downloadable JSON and HTML evidence.

It deterministically detects:

- a required merge queue without a `merge_group` workflow trigger;
- required check names absent from the pasted workflow jobs;
- wildcard syntax in exact required-check contexts;
- duplicate required-check contexts;
- `paths` / `paths-ignore` filters that can skip a required workflow;
- branch filters, conditional jobs, matrix names, and reusable-workflow outputs that require review.

The tool deliberately marks repository-dependent behavior as **REVIEW** rather than inventing live GitHub state.

## Run

Open `index.html` directly, or serve the directory as static files:

```sh
python3 -m http.server 8080
```

No build step, token, GitHub API, backend, database, account, or upload is required.

## Test

```sh
npm test
```

The seven-case suite covers missing `merge_group`, an exact check match, wildcard and duplicate contexts, skipped paths, an absent job, and a safe configuration.

## Measurable success event

One non-owner downloads the public artifact and generates a PASS/REVIEW/BLOCK evidence file for a real ruleset change. No private configuration is collected.

## Hosting and cost

Static browser assets only. GitHub source plus free static hosting is sufficient; runtime cost is $0 and Render is not used.

## Scope

This preflight models documented configuration relationships. It does not modify a repository, inspect live check runs, guarantee GitHub service behavior, or replace a controlled test in ruleset `evaluate` mode.
