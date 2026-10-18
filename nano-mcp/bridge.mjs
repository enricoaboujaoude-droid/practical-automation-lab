/**
 * PAL Nano x402 <-> MCP bridge primitives.
 *
 * Purpose: expose Nano-priced tools using the x402 Foundation MCP transport
 * while delegating payment verification/settlement to a Nano x402 facilitator.
 *
 * No wallet keys are handled here. The client signs the Nano payment.
 */

export const NANO_MAINNET = "nano:mainnet";

export function nanoPaymentRequired({
  tool,
  description,
  amountRaw,
  payTo,
  facilitatorUrl,
  mimeType = "application/json",
}) {
  if (!tool || !amountRaw || !payTo || !facilitatorUrl) {
    throw new Error("tool, amountRaw, payTo and facilitatorUrl are required");
  }

  return {
    isError: true,
    structuredContent: {
      x402Version: 2,
      resource: {
        url: `mcp://tool/${tool}`,
        description: description || tool,
        mimeType,
      },
      accepts: [{
        scheme: "exact",
        network: NANO_MAINNET,
        amount: String(amountRaw),
        asset: "XNO",
        payTo,
        maxTimeoutSeconds: 60,
        extra: { facilitatorUrl },
      }],
    },
    content: [{
      type: "text",
      text: "Payment required. Retry with _meta['x402/payment'].",
    }],
  };
}

export function extractMcpPayment(params) {
  const payment = params?._meta?.["x402/payment"];
  if (!payment) return null;
  if (payment.x402Version !== 2) throw new Error("unsupported x402 version");
  if (payment.accepted?.network !== NANO_MAINNET) {
    throw new Error("payment is not for nano:mainnet");
  }
  return payment;
}

export async function settleNanoMcpPayment({
  payment,
  paymentRequirements,
  facilitatorUrl,
  fetchImpl = fetch,
}) {
  if (!payment) throw new Error("payment is required");
  const base = facilitatorUrl.replace(/\/$/, "");

  const verify = await fetchImpl(`${base}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentPayload: payment, paymentRequirements }),
  });
  const verified = await verify.json();
  if (!verify.ok || verified?.isValid === false) {
    throw new Error(`Nano payment verification failed: ${JSON.stringify(verified)}`);
  }

  const settle = await fetchImpl(`${base}/settle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paymentPayload: payment, paymentRequirements }),
  });
  const settlement = await settle.json();
  if (!settle.ok || settlement?.success === false) {
    throw new Error(`Nano payment settlement failed: ${JSON.stringify(settlement)}`);
  }

  return {
    x402Version: 2,
    network: NANO_MAINNET,
    settlement,
  };
}

export function withPaymentResponse(toolResult, paymentResponse) {
  return {
    ...toolResult,
    _meta: {
      ...(toolResult?._meta || {}),
      "x402/payment-response": paymentResponse,
    },
  };
}
