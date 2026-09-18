import test from "node:test";
import assert from "node:assert/strict";
import {
  diffReports,
  historyCsv,
  scanIssuesCsv,
} from "./pro-insights.mjs";

function report(overrides = {}) {
  return {
    generatedAt: "2026-09-18T00:00:00.000Z",
    productsChecked: 10,
    variantsChecked: 12,
    imagesChecked: 10,
    errors: 1,
    warnings: 2,
    score: 88,
    imageReadiness: {
      productsMissingImages: 0,
      imagesBelow500: 1,
      productsWithImageRisk: 1,
      readyImages: 9,
      readyPercent: 90,
      enforcementDate: "2027-01-31",
    },
    issues: [
      {
        level: "warning",
        code: "IMAGE_BELOW_500",
        productId: "p1",
        title: "Product",
        message: "Image is too small.",
        remediation: "Replace the image.",
      },
    ],
    ...overrides,
  };
}

test("diffReports detects score, issue and image-readiness changes", () => {
  const previous = report();
  const current = report({
    score: 75,
    errors: 3,
    warnings: 3,
    imageReadiness: {
      ...previous.imageReadiness,
      imagesBelow500: 3,
      productsWithImageRisk: 2,
    },
    issues: [
      ...previous.issues,
      {
        level: "error",
        code: "MISSING_IMAGE",
        productId: "p2",
        title: "Second Product",
        message: "Product has no image.",
        remediation: "Add an image.",
      },
    ],
  });

  const diff = diffReports(previous, current);
  assert.equal(diff.scoreDelta, -13);
  assert.equal(diff.errorDelta, 2);
  assert.equal(diff.warningDelta, 1);
  assert.equal(diff.imageRiskDelta, 2);
  assert.equal(diff.newIssues.length, 1);
  assert.equal(diff.resolvedIssues.length, 0);
});

test("scanIssuesCsv safely quotes merchant-facing text", () => {
  const csv = scanIssuesCsv(
    report({
      issues: [
        {
          level: "warning",
          code: "TEST",
          productId: "p1",
          title: "A \"quoted\" title",
          message: "Comma, inside",
          remediation: "Do this",
        },
      ],
    }),
  );

  assert.match(csv, /"A ""quoted"" title"/);
  assert.match(csv, /"Comma, inside"/);
});

test("historyCsv emits bounded scan summary columns", () => {
  const csv = historyCsv([
    {
      generatedAt: new Date("2026-09-18T00:00:00.000Z"),
      source: "scheduled",
      score: 91,
      errors: 0,
      warnings: 2,
      productsChecked: 100,
      variantsChecked: 140,
      imagesChecked: 100,
      imageRisks: 1,
    },
  ]);

  assert.match(csv, /generated_at/);
  assert.match(csv, /"scheduled"/);
  assert.match(csv, /"91"/);
});
