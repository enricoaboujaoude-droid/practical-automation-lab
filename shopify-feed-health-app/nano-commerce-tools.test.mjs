import assert from "node:assert/strict";
import test from "node:test";

import {
  feedDiff,
  gtinCheck,
  inspectGtin,
  validateFeedDiffBody,
  validateGtinBody,
} from "./nano-commerce-tools.mjs";

test("GTIN checker accepts valid GTIN-13 and rejects a bad check digit", () => {
  const valid = inspectGtin("4006381333931");
  const invalid = inspectGtin("4006381333932");
  assert.equal(valid.valid, true);
  assert.equal(valid.checksum_valid, true);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.checksum_valid, false);
});

test("GTIN checker handles batches and bounded validation", () => {
  assert.equal(validateGtinBody({ gtins: ["4006381333931"] }).ok, true);
  assert.equal(validateGtinBody({ gtins: [] }).ok, false);
  assert.equal(validateGtinBody({ gtins: Array.from({ length: 101 }, () => "4006381333931") }).ok, false);
  const result = gtinCheck(["4006381333931", "036000291452"]);
  assert.equal(result.summary.checked, 2);
  assert.equal(result.summary.valid, 2);
});

test("feed diff reports added, removed and changed commerce fields", () => {
  const before = [
    { id: "a", title: "Alpha", price: "10.00 USD", availability: "in_stock" },
    { id: "b", title: "Beta", price: "20.00 USD", availability: "in_stock" },
  ];
  const after = [
    { id: "a", title: "Alpha", price: "12.00 USD", availability: "out_of_stock" },
    { id: "c", title: "Gamma", price: "30.00 USD", availability: "in_stock" },
  ];
  const result = feedDiff(before, after);
  assert.deepEqual(result.added_ids, ["c"]);
  assert.deepEqual(result.removed_ids, ["b"]);
  assert.equal(result.summary.changed, 1);
  assert.deepEqual(
    result.changed[0].changes.map((change) => change.field),
    ["price", "availability"],
  );
});

test("feed diff validation requires unique non-empty ids and bounded snapshots", () => {
  assert.equal(validateFeedDiffBody({ before: [], after: [{ id: "a" }] }).ok, true);
  assert.equal(validateFeedDiffBody({ before: [], after: [] }).ok, false);
  assert.equal(
    validateFeedDiffBody({ before: [{ id: "a" }, { id: "a" }], after: [] }).ok,
    false,
  );
});
