const assert = require("node:assert/strict");
const { analyze, buildSubjects } = require("./core");

const legacy = "repo:acme/payments:ref:refs/heads/main";
const immutable = "repo:acme@123/payments@456:ref:refs/heads/main";
const aws = (subjects, audience = "sts.amazonaws.com", like = false) => ({
  Statement: [{ Condition: { [like ? "StringLike" : "StringEquals"]: {
    "token.actions.githubusercontent.com:sub": subjects,
    "token.actions.githubusercontent.com:aud": audience,
  } } }],
});
const run = (overrides = {}) => analyze({ provider: "aws", currentSub: legacy, proposedSub: immutable, audience: "sts.amazonaws.com", policy: aws([legacy, immutable]), ...overrides });

const tests = [
  ["legacy match", () => assert.equal(run({ proposedSub: legacy, policy: aws(legacy) }).status, "PASS")],
  ["immutable mismatch blocks", () => assert.equal(run({ policy: aws(legacy) }).status, "BLOCK")],
  ["Azure case mismatch blocks", () => assert(run({ provider: "azure", audience: "api://AzureADTokenExchange", policy: { subject: immutable.toUpperCase(), audiences: ["api://AzureADTokenExchange"] } }).findings.some(f => f.code === "SUBJECT_CASE_MISMATCH"))],
  ["duplicated workflow path blocks", () => { const bad = "repo:acme@123/payments@456:job_workflow_ref:acme/shared/.github/workflows/.github/workflows/deploy.yml@refs/heads/main"; assert(run({ proposedSub: bad, policy: aws([legacy, bad]) }).findings.some(f => f.code === "DUPLICATED_WORKFLOW_PATH")); }],
  ["environment subject generated", () => assert.equal(buildSubjects({ owner: "acme", repo: "payments", ownerId: 123, repoId: 456, contextType: "environment", contextValue: "prod" }).proposedSub, "repo:acme@123/payments@456:environment:prod")],
  ["pull request subject generated", () => assert.equal(buildSubjects({ owner: "acme", repo: "payments", ownerId: 123, repoId: 456, contextType: "pull_request" }).currentSub, "repo:acme/payments:pull_request")],
  ["reusable workflow generated", () => assert(buildSubjects({ owner: "acme", repo: "payments", ownerId: 123, repoId: 456, contextType: "job_workflow_ref", contextValue: "acme/shared/.github/workflows/deploy.yml@refs/heads/main" }).proposedSub.includes("job_workflow_ref:"))],
  ["audience mismatch blocks", () => assert(run({ policy: aws([legacy, immutable], "wrong.example") }).findings.some(f => f.code === "AUDIENCE_MISMATCH"))],
  ["broad wildcard requires review", () => assert.equal(run({ policy: aws("repo:*", "sts.amazonaws.com", true) }).status, "REVIEW")],
  ["safe dual transition passes", () => assert.equal(run().status, "PASS")],
  ["GCP equality condition passes", () => assert.equal(run({ provider: "gcp", audience: "github", policy: { attributeCondition: `attribute.subject == '${legacy}' || attribute.subject == '${immutable}'`, audiences: ["github"] } }).status, "PASS")],
];

let passed = 0;
for (const [name, test] of tests) {
  try { test(); passed++; console.log(`ok - ${name}`); }
  catch (error) { console.error(`not ok - ${name}\n${error.stack}`); process.exitCode = 1; }
}
console.log(`${passed}/${tests.length} tests passed`);
