import assert from "node:assert/strict";
import test from "node:test";

import {
  feedDiff,
  gtinCheck,
  inspectGtin,
  validateFeedDiffBody,
  validateGtinBody,
} from "./nano-commerce-tools.mjs";
import {
  decodeX402Header,
  encodeX402Header,
  nanoX402DiscoveryItems,
  nanoX402PaymentRequired,
  nanoX402Requirements,
  x402PayloadUseKey,
} from "./nano-x402.mjs";

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


test("x402 challenge uses exact nano:mainnet and the configured PAL receiver", () => {
  const previous = process.env.PAL_NANO_ADDRESS;
  process.env.PAL_NANO_ADDRESS =
    "nano_1gcpoxg6o1heqtmub9srjbpdwoe9bm1n85tks3yznjhb9iywktixczc7ydpr";
  try {
    const req = {
      get(name) {
        const key = String(name).toLowerCase();
        if (key === "host" || key === "x-forwarded-host") return "pal.example";
        if (key === "x-forwarded-proto") return "https";
        return undefined;
      },
      protocol: "https",
    };
    const spec = {
      path: "/api/nano/gtin-check",
      description: "GTIN checker",
    };
    const body = nanoX402PaymentRequired(req, spec);
    assert.equal(body.x402Version, 2);
    assert.equal(body.resource.url, "https://pal.example/api/nano/gtin-check");
    assert.equal(body.accepts[0].scheme, "exact");
    assert.equal(body.accepts[0].network, "nano:mainnet");
    assert.equal(body.accepts[0].asset, "XNO");
    assert.equal(
      body.accepts[0].payTo,
      "nano_1gcpoxg6o1heqtmub9srjbpdwoe9bm1n85tks3yznjhb9iywktixczc7ydpr",
    );
    assert.equal(body.accepts[0].extra.workThreshold, "fffffff800000000");
    const roundTrip = decodeX402Header(encodeX402Header(body));
    assert.equal(roundTrip.ok, true);
    assert.deepEqual(roundTrip.payload, body);
  } finally {
    if (previous === undefined) delete process.env.PAL_NANO_ADDRESS;
    else process.env.PAL_NANO_ADDRESS = previous;
  }
});

test("x402 payment payload keys are deterministic and request-independent", () => {
  const payload = {
    x402Version: 2,
    accepted: { scheme: "exact", network: "nano:mainnet", amount: "1", asset: "XNO", payTo: "nano_test" },
    payload: { block: { previous: "A" } },
  };
  assert.equal(x402PayloadUseKey(payload), x402PayloadUseKey(structuredClone(payload)));
  assert.match(x402PayloadUseKey(payload), /^x402:[a-f0-9]{64}$/);
});

test("x402 discovery publishes every PAL Nano commerce service", () => {
  const previous = process.env.PAL_NANO_ADDRESS;
  process.env.PAL_NANO_ADDRESS =
    "nano_1gcpoxg6o1heqtmub9srjbpdwoe9bm1n85tks3yznjhb9iywktixczc7ydpr";
  try {
    const services = [
      { path: "/a" },
      { path: "/b" },
      { path: "/c" },
    ];
    const items = nanoX402DiscoveryItems("https://pal.example", services);
    assert.deepEqual(items.map((item) => item.resource), [
      "https://pal.example/a",
      "https://pal.example/b",
      "https://pal.example/c",
    ]);
    for (const item of items) {
      assert.equal(item.x402Version, 2);
      assert.equal(item.accepts[0].scheme, "exact");
      assert.equal(item.accepts[0].network, "nano:mainnet");
    }
  } finally {
    if (previous === undefined) delete process.env.PAL_NANO_ADDRESS;
    else process.env.PAL_NANO_ADDRESS = previous;
  }
});

test("x402 requirement builder rejects a missing receiver", () => {
  const previous = process.env.PAL_NANO_ADDRESS;
  delete process.env.PAL_NANO_ADDRESS;
  try {
    assert.throws(() => nanoX402Requirements(), /PAL_NANO_ADDRESS/);
  } finally {
    if (previous !== undefined) process.env.PAL_NANO_ADDRESS = previous;
  }
});
