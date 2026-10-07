import test from "node:test";
import assert from "node:assert/strict";
import { auditCatalog } from "./catalog-health.mjs";

test("healthy product stays high-scoring", () => {
  const report = auditCatalog([{ id: "p1", title: "Trail Shoe", description: "A durable trail running shoe with a grippy outsole, breathable upper, reinforced toe protection, and cushioning for mixed-terrain training.", productType: "Trail Running Shoes", tags: ["trail", "running"], vendor: "PAL Test", onlineStoreUrl: "https://example.com/products/trail-shoe", images: { nodes: [{ width: 1200, height: 1200, altText: "Blue trail running shoe with rugged outsole" }], pageInfo: { hasNextPage: false } }, variants: { nodes: [{ title: "Blue / 42", sku: "TS-42-B", barcode: "1234567890123", price: "99.00", selectedOptions: [{ name: "Size", value: "42" }, { name: "Color", value: "Blue" }] }], pageInfo: { hasNextPage: false } } }]);
  assert.equal(report.errors, 0);
  assert.equal(report.warnings, 0);
  assert.equal(report.score, 100);
  assert.equal(report.imageReadiness.imagesBelow500, 0);
  assert.equal(report.imageReadiness.productsMissingImages, 0);
  assert.equal(report.imageReadiness.readyPercent, 100);
  assert.equal(report.imageReadiness.enforcementDate, "2027-01-31");
});

test("flags image, identifier, price and duplicate variant problems", () => {
  const report = auditCatalog([{ id: "p2", title: "Risky Product", description: "", productType: "", tags: [], vendor: "", onlineStoreUrl: null, images: { nodes: [{ width: 300, height: 300, altText: "" }], pageInfo: { hasNextPage: false } }, variants: { nodes: [{ title: "A", sku: "", barcode: "", price: "0", selectedOptions: [{ name: "Size", value: "M" }] }, { title: "B", sku: "", barcode: "", price: "20", selectedOptions: [{ name: "Size", value: "M" }] }], pageInfo: { hasNextPage: false } } }]);
  const codes = new Set(report.issues.map((entry) => entry.code));
  for (const code of ["MISSING_BRAND", "AIEO_MISSING_DESCRIPTION", "AIEO_MISSING_PRODUCT_TYPE", "AIEO_MISSING_IMAGE_ALT", "NO_ONLINE_STORE_URL", "IMAGE_BELOW_500", "IDENTIFIER_GAP", "NON_POSITIVE_PRICE", "DUPLICATE_VARIANT_OPTIONS"]) assert.ok(codes.has(code), `missing ${code}`);
  assert.ok(report.errors > 0);
  assert.ok(report.score < 100);
  assert.equal(report.imageReadiness.imagesBelow500, 1);
  assert.equal(report.imageReadiness.productsWithImageRisk, 1);
});

test("reports dynamic Pro truncation limits and missing-image readiness risk", () => {
  const report = auditCatalog(
    [{
      id: "p3",
      title: "Large Product",
      description: "A complete product description with enough factual context for an AI shopping system to identify and compare the item reliably across shopping surfaces.",
      productType: "Test Product",
      tags: ["test"],
      vendor: "PAL",
      onlineStoreUrl: "https://example.com/products/large",
      images: { nodes: [], pageInfo: { hasNextPage: true } },
      variants: { nodes: [], pageInfo: { hasNextPage: true } },
    }],
    { variantLimit: 250, imageLimit: 100 },
  );

  const byCode = new Map(report.issues.map((entry) => [entry.code, entry]));
  assert.match(byCode.get("VARIANT_SCAN_TRUNCATED").message, /250 variants/);
  assert.match(byCode.get("IMAGE_SCAN_TRUNCATED").message, /100 images/);
  assert.equal(report.imageReadiness.productsMissingImages, 1);
  assert.equal(report.imageReadiness.productsWithImageRisk, 1);
});


test("flags thin descriptions as an AIEO context gap", () => {
  const report = auditCatalog([{
    id: "p4",
    title: "Minimal Lamp",
    description: "Small desk lamp.",
    productType: "Desk Lamps",
    tags: ["lighting"],
    vendor: "PAL",
    onlineStoreUrl: "https://example.com/products/minimal-lamp",
    images: { nodes: [{ width: 1000, height: 1000, altText: "Black desk lamp" }], pageInfo: { hasNextPage: false } },
    variants: { nodes: [{ title: "Default", sku: "LAMP-1", barcode: "4006381333931", price: "49.00", selectedOptions: [] }], pageInfo: { hasNextPage: false } },
  }]);

  const codes = new Set(report.issues.map((entry) => entry.code));
  assert.ok(codes.has("AIEO_THIN_DESCRIPTION"));
  assert.equal(report.aieoReadiness.productsWithThinDescriptions, 1);
  assert.equal(report.aieoReadiness.productsMissingDescriptions, 0);
  assert.equal(report.aieoReadiness.signalModel, "heuristic-readiness");
});
