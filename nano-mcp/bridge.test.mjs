import test from "node:test";
import assert from "node:assert/strict";
import {
  NANO_MAINNET,
  nanoPaymentRequired,
  extractMcpPayment,
  settleNanoMcpPayment,
  withPaymentResponse,
} from "./bridge.mjs";

test("quotes Nano over MCP x402 v2", () => {
  const r = nanoPaymentRequired({
    tool: "catalog_audit",
    amountRaw: "100000000000000000000000000",
    payTo: "nano_test",
    facilitatorUrl: "https://facilitator.example",
  });
  assert.equal(r.isError, true);
  assert.equal(r.structuredContent.accepts[0].network, NANO_MAINNET);
  assert.equal(r.structuredContent.accepts[0].asset, "XNO");
});

test("extracts Nano MCP payment", () => {
  const payment = {
    x402Version: 2,
    accepted: { network: NANO_MAINNET },
    payload: { transaction: "signed-nano-block" },
  };
  assert.deepEqual(
    extractMcpPayment({ _meta: { "x402/payment": payment } }),
    payment,
  );
});

test("rejects a non-Nano rail", () => {
  assert.throws(() => extractMcpPayment({
    _meta: { "x402/payment": { x402Version: 2, accepted: { network: "eip155:8453" } } },
  }), /not for nano:mainnet/);
});

test("verifies then settles without handling wallet keys", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      async json() {
        return url.endsWith("/verify")
          ? { isValid: true }
          : { success: true, transaction: "ABC" };
      },
    };
  };

  const response = await settleNanoMcpPayment({
    payment: { x402Version: 2 },
    paymentRequirements: { network: NANO_MAINNET },
    facilitatorUrl: "https://facilitator.example/",
    fetchImpl,
  });

  assert.deepEqual(calls, [
    "https://facilitator.example/verify",
    "https://facilitator.example/settle",
  ]);
  assert.equal(response.network, NANO_MAINNET);
});

test("adds MCP payment response metadata", () => {
  const result = withPaymentResponse(
    { content: [{ type: "text", text: "ok" }] },
    { network: NANO_MAINNET, settlement: { success: true } },
  );
  assert.equal(result._meta["x402/payment-response"].network, NANO_MAINNET);
});
