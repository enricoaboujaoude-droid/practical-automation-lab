# Self-hosted GitHub Actions job stuck waiting for a runner

When a job remains at **Waiting for a runner to pick up this job**, separate three questions before changing the workflow:

1. Does any runner satisfy every literal `runs-on` label?
2. If a runner group is named, can that group access the repository?
3. Is the matching set redundant, or is one offline/busy machine the entire route?

A green runner elsewhere in the fleet does not help when it lacks one required label. Automatic fallback to a GitHub-hosted image can also be unsafe when the workload exceeds hosted-runner memory or architecture limits.

## Reproduce the routing contract locally

Save the affected workflow and a **redacted** fleet inventory. Runner names may be aliases; omit hostnames, IP addresses, tokens, URLs, and credentials.

For a workflow containing:

```yaml
jobs:
  publish:
    runs-on: [self-hosted, omni-build]
```

use an inventory shaped like:

```json
{
  "repository": "example/project",
  "runners": [
    {
      "name": "build-runner-1",
      "labels": ["Linux", "X64", "omni-build"],
      "group": "Default",
      "status": "offline",
      "busy": false
    }
  ],
  "groups": [
    {"name":"Default","repositories":["example/project"]}
  ]
}
```

Run:

```bash
node cli.mjs --workflow docker-publish.yml --inventory runner-inventory.json --json report.json --html report.html
```

That contract should produce:

- `SINGLE_RUNNER_BOTTLENECK`: only one runner can ever take the job;
- `NO_CURRENTLY_IDLE_RUNNER`: every eligible runner in the supplied snapshot is offline or busy.

A matrix member with no matching labels produces `NO_ELIGIBLE_RUNNER`. A group without repository access produces `GROUP_REPOSITORY_ACCESS`.

## What to change

The evidence identifies the routing failure; the operator still chooses the remedy:

- add a second runner carrying the same purpose-specific label;
- correct a label, group, matrix value, or repository-access mapping;
- keep the constrained route and add a bounded queue timeout plus live availability alert;
- use a hosted fallback only after proving its memory, architecture, network, and security constraints are adequate.

The local preflight intentionally does not call GitHub or promise live availability. A static PASS should be followed by a controlled workflow dispatch; point-in-time status should come from an authenticated fleet monitor owned by the repository.

## Free local checker

[GitHub Runner Routing Contract Preflight](./README.md) runs in the browser, CLI, or GitHub Action and exports JSON plus standalone HTML evidence. Analysis is local and requires no token or backend.
