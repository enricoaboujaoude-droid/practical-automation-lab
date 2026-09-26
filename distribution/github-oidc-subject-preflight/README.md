# GitHub OIDC Immutable-Subject Preflight

A browser-local, deterministic release gate for checking whether AWS, Azure, or GCP workload-identity trust will survive a GitHub Actions OIDC immutable-subject migration, repository rename, or transfer.

## One job

Paste the current and proposed `sub` claims plus the cloud trust JSON. The tool returns **PASS**, **REVIEW**, or **BLOCK** and a downloadable evidence report. No token, cloud credential, API, backend, database, or upload is involved.

It detects:

- current-only policies that will reject the proposed immutable subject;
- safe dual-policy transition windows;
- audience and case mismatches;
- duplicated reusable-workflow paths;
- broad repository/context wildcards;
- branch, environment, pull-request, and reusable-workflow subject forms;
- simple AWS IAM, Azure federated-credential, and GCP equality conditions.

Unsupported GCP expressions are deliberately reported as **REVIEW**, never guessed.

## Use

Open `index.html` in any modern browser, or serve the directory as static files:

```sh
python3 -m http.server 8080
```

No build step is required.

## Verify

```sh
npm test
```

The dependency-free suite covers legacy and immutable matching, Azure case sensitivity, duplicate workflow paths, environment/ref/pull-request/reusable-workflow forms, audience mismatch, broad wildcards, safe dual-policy transition, and a simple GCP equality condition.

## Measurable success event

One non-owner downloads a GitHub Release asset and produces a PASS/REVIEW/BLOCK evidence JSON for a real migration. Release download counts are the external measurement gate; private browser data is never collected.

## Hosting

Static only: GitHub repository/Release plus any free static host. Runtime cost is $0 and Render is not used.

## Scope and safety

This is a preflight assistant, not a proof of cloud authorization. Review the generated evidence and test changes in a controlled environment before production rollout. Never paste live JWTs, secrets, credentials, or private keys.
