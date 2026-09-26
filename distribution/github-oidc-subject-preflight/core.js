(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OidcSubjectPreflight = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATUS_RANK = { PASS: 0, REVIEW: 1, BLOCK: 2 };

  function result(status, code, message, detail) {
    return { status, code, message, ...(detail ? { detail } : {}) };
  }

  function globToRegExp(pattern) {
    const escaped = String(pattern)
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`);
  }

  function matches(pattern, value) {
    return pattern.includes("*") || pattern.includes("?")
      ? globToRegExp(pattern).test(value)
      : pattern === value;
  }

  function asArray(value) {
    return value == null ? [] : Array.isArray(value) ? value : [value];
  }

  function walk(value, visit, path = []) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, visit, path.concat(index)));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, item]) => {
        visit(key, item, path.concat(key));
        walk(item, visit, path.concat(key));
      });
    }
  }

  function buildSubjects(input) {
    const owner = String(input.owner || "").trim();
    const repo = String(input.repo || "").trim();
    const ownerId = String(input.ownerId || "").trim();
    const repoId = String(input.repoId || "").trim();
    const contextType = input.contextType || "ref";
    const contextValue = String(input.contextValue || "refs/heads/main").trim();
    if (!owner || !repo) throw new Error("owner and repo are required");
    if (!ownerId || !repoId) throw new Error("ownerId and repoId are required for the immutable subject");

    let suffix;
    if (contextType === "pull_request") suffix = "pull_request";
    else if (contextType === "environment") suffix = `environment:${contextValue}`;
    else if (contextType === "job_workflow_ref") suffix = `job_workflow_ref:${contextValue}`;
    else suffix = `ref:${contextValue}`;

    return {
      currentSub: `repo:${owner}/${repo}:${suffix}`,
      proposedSub: `repo:${owner}@${ownerId}/${repo}@${repoId}:${suffix}`,
    };
  }

  function awsRules(policy) {
    const subjectRules = [];
    const audienceRules = [];
    walk(policy, (key, value, path) => {
      const lower = String(key).toLowerCase();
      if (lower === "token.actions.githubusercontent.com:sub" || lower === "sub") {
        asArray(value).filter((v) => typeof v === "string").forEach((pattern) =>
          subjectRules.push({ pattern, path: path.join("."), mode: path.includes("StringLike") ? "glob" : "exact" })
        );
      }
      if (lower === "token.actions.githubusercontent.com:aud" || lower === "aud") {
        asArray(value).filter((v) => typeof v === "string").forEach((pattern) =>
          audienceRules.push({ pattern, path: path.join(".") })
        );
      }
    });
    return { subjectRules, audienceRules };
  }

  function azureRules(policy) {
    const credentials = Array.isArray(policy) ? policy : [policy];
    const subjectRules = [];
    const audienceRules = [];
    credentials.forEach((credential, index) => {
      asArray(credential && (credential.subject || credential.subjects)).forEach((pattern) => {
        if (typeof pattern === "string") subjectRules.push({ pattern, path: `[${index}].subject`, mode: "exact" });
      });
      asArray(credential && (credential.audiences || credential.audience)).forEach((pattern) => {
        if (typeof pattern === "string") audienceRules.push({ pattern, path: `[${index}].audiences` });
      });
    });
    return { subjectRules, audienceRules };
  }

  function gcpRules(policy) {
    const subjectRules = [];
    const audienceRules = [];
    const expressions = [];
    walk(policy, (key, value, path) => {
      const lower = String(key).toLowerCase();
      if (["subject", "subjects", "allowedsubjects"].includes(lower)) {
        asArray(value).forEach((pattern) => {
          if (typeof pattern === "string") subjectRules.push({ pattern, path: path.join("."), mode: "exact" });
        });
      }
      if (["audience", "audiences", "allowedaudiences"].includes(lower)) {
        asArray(value).forEach((pattern) => {
          if (typeof pattern === "string") audienceRules.push({ pattern, path: path.join(".") });
        });
      }
      if (["attributecondition", "condition", "expression"].includes(lower) && typeof value === "string") {
        expressions.push({ value, path: path.join(".") });
      }
    });
    for (const expression of expressions) {
      const subjectRegex = /(?:assertion\.sub|attribute\.subject)\s*==\s*['"]([^'"]+)['"]/g;
      const audienceRegex = /(?:assertion\.aud|attribute\.audience)\s*==\s*['"]([^'"]+)['"]/g;
      let match;
      while ((match = subjectRegex.exec(expression.value))) subjectRules.push({ pattern: match[1], path: expression.path, mode: "exact" });
      while ((match = audienceRegex.exec(expression.value))) audienceRules.push({ pattern: match[1], path: expression.path });
    }
    return { subjectRules, audienceRules, unsupported: expressions.length > 0 && subjectRules.length === 0 };
  }

  function isBroad(pattern) {
    const wildcardIndex = Math.min(
      ...[pattern.indexOf("*"), pattern.indexOf("?")].filter((n) => n >= 0)
    );
    if (!Number.isFinite(wildcardIndex)) return false;
    const contextIndex = [":ref:", ":environment:", ":pull_request", ":job_workflow_ref:"]
      .map((token) => pattern.indexOf(token))
      .filter((n) => n >= 0)
      .sort((a, b) => a - b)[0];
    return contextIndex == null || wildcardIndex < contextIndex;
  }

  function subjectEvaluation(rules, subject) {
    const matchedRules = rules.filter((rule) => matches(rule.pattern, subject));
    return { matched: matchedRules.length > 0, matchedRules, broad: matchedRules.some((rule) => isBroad(rule.pattern)) };
  }

  function analyze(input) {
    const provider = String(input.provider || "aws").toLowerCase();
    let policy = input.policy;
    if (typeof policy === "string") policy = JSON.parse(policy);
    if (!policy || typeof policy !== "object") throw new Error("policy must be a JSON object or array");

    let currentSub = String(input.currentSub || "").trim();
    let proposedSub = String(input.proposedSub || "").trim();
    if (!currentSub || !proposedSub) {
      const built = buildSubjects(input);
      currentSub ||= built.currentSub;
      proposedSub ||= built.proposedSub;
    }
    const audience = String(input.audience || "sts.amazonaws.com").trim();
    const extracted = provider === "azure" ? azureRules(policy) : provider === "gcp" ? gcpRules(policy) : awsRules(policy);
    const findings = [];

    if (!extracted.subjectRules.length) {
      findings.push(result(provider === "gcp" && extracted.unsupported ? "REVIEW" : "BLOCK", "NO_SUBJECT_RULE", "No deterministically evaluable OIDC subject rule was found."));
    }

    for (const rule of extracted.subjectRules) {
      if (rule.pattern.includes(".github/workflows/.github/workflows/")) {
        findings.push(result("BLOCK", "DUPLICATED_WORKFLOW_PATH", "A reusable-workflow subject repeats .github/workflows and can never equal GitHub's claim.", rule.pattern));
      }
    }

    const current = subjectEvaluation(extracted.subjectRules, currentSub);
    const proposed = subjectEvaluation(extracted.subjectRules, proposedSub);
    if (proposed.matched && current.matched) {
      findings.push(result("PASS", "SAFE_DUAL_MATCH", "Both current and proposed immutable subjects are trusted; staged migration is possible."));
    } else if (proposed.matched) {
      findings.push(result("REVIEW", "CUTOVER_ONLY", "The proposed immutable subject is trusted, but the current subject is not; coordinate the cutover."));
    } else if (current.matched) {
      findings.push(result("BLOCK", "IMMUTABLE_SUBJECT_NOT_TRUSTED", "The current subject is trusted but the proposed immutable subject is not; migration would break authentication."));
    } else if (extracted.subjectRules.length) {
      const caseOnly = extracted.subjectRules.some((rule) => rule.pattern.toLowerCase() === proposedSub.toLowerCase());
      findings.push(result("BLOCK", caseOnly ? "SUBJECT_CASE_MISMATCH" : "SUBJECT_NOT_TRUSTED", caseOnly ? "The proposed subject differs only by case; subject comparison is case-sensitive." : "Neither current nor proposed subject matches the trust policy."));
    }

    if (proposed.broad || current.broad) {
      findings.push(result("REVIEW", "BROAD_WILDCARD", "A matching wildcard crosses the repository/context boundary and may trust unintended workflows."));
    }

    if (extracted.audienceRules.length) {
      const audienceMatched = extracted.audienceRules.some((rule) => matches(rule.pattern, audience));
      findings.push(audienceMatched
        ? result("PASS", "AUDIENCE_MATCH", `Audience ${audience} is trusted.`)
        : result("BLOCK", "AUDIENCE_MISMATCH", `Audience ${audience} is not trusted by the policy.`));
    } else {
      findings.push(result("REVIEW", "AUDIENCE_UNVERIFIED", "No audience rule was found; verify it in the provider configuration."));
    }

    const status = findings.reduce((worst, finding) => STATUS_RANK[finding.status] > STATUS_RANK[worst] ? finding.status : worst, "PASS");
    return {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      status,
      provider,
      inputs: { currentSub, proposedSub, audience },
      evidence: {
        subjectRuleCount: extracted.subjectRules.length,
        audienceRuleCount: extracted.audienceRules.length,
        currentMatched: current.matched,
        proposedMatched: proposed.matched,
        matchedCurrentRules: current.matchedRules.map((r) => r.path),
        matchedProposedRules: proposed.matchedRules.map((r) => r.path),
      },
      findings,
    };
  }

  function redact(report) {
    return JSON.parse(JSON.stringify(report));
  }

  return { analyze, buildSubjects, redact, globToRegExp };
});
