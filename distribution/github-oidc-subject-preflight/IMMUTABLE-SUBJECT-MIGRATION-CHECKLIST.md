# GitHub Actions OIDC immutable-subject migration checklist

Use this before creating, renaming, transferring, or opting a repository into GitHub's immutable OIDC subject format.

## Symptoms this addresses

- AWS: `Not authorized to perform sts:AssumeRoleWithWebIdentity`
- Azure: `AADSTS700213` or `AADSTS7002138`
- A trust policy still contains `repo:OWNER/REPO:...` while GitHub emits `repo:OWNER@OWNER_ID/REPO@REPO_ID:...`
- Reusable workflows, environments, branches, or audiences no longer match exactly

## Safe order

1. Record the current subject, audience, and workflow context.
2. Preview the proposed immutable subject, including the numeric owner and repository IDs.
3. Add the proposed subject to cloud trust without removing the current subject.
4. Verify that both subjects match during the transition window.
5. Change or opt in the GitHub subject format.
6. Verify a real workflow run.
7. Remove the legacy mutable subject only after the new path succeeds.

Do not paste a JWT, cloud credential, secret, or private key into third-party tools.

## Local deterministic check

The [GitHub OIDC Immutable-Subject Preflight](https://github.com/enricoaboujaoude-droid/practical-automation-lab/tree/main/distribution/github-oidc-subject-preflight) evaluates pasted AWS IAM trust JSON, Azure federated-credential JSON, or supported GCP equality conditions entirely in the browser. It reports PASS, REVIEW, or BLOCK for:

- legacy-only versus safe dual-subject trust;
- exact-case and audience mismatches;
- branch, environment, pull-request, and reusable-workflow forms;
- duplicated reusable-workflow paths;
- repository/context-crossing wildcards.

The tool is owned by Practical Automation Lab, has no backend or telemetry, and its tests and source are public. Unsupported expressions return REVIEW rather than being guessed.

## Authoritative references

- [GitHub OpenID Connect reference](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims)
- [GitHub immutable-subject announcement](https://github.blog/changelog/2026-04-23-immutable-subject-claims-for-github-actions-oidc-tokens/)
- [Microsoft Entra migration guidance](https://learn.microsoft.com/en-us/entra/workload-id/workload-identities-github-immutable-subjects)
