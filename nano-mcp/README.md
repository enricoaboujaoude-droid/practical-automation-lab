# Nano x402 MCP bridge

This branch starts a PAL Nano revenue build rather than another micropayment-content experiment.

## Goal

Allow an MCP tool to quote and settle XNO using the standard x402 MCP transport. The client receives PaymentRequired, signs a Nano payment, retries through `_meta["x402/payment"]`, and the server verifies/settles through a Nano x402 facilitator.

## Why

The x402 Foundation now specifies MCP as a payment transport. Nano already has an exact scheme and facilitator with `/verify` and `/settle`. The missing PAL-side piece is a reusable bridge that lets existing paid tools expose Nano as a standard agent payment rail.

## Revenue use

This is not monetized by charging for the bridge itself. It is intended to add Nano as a payment rail to higher-value PAL tools/services, so agents can purchase them repeatedly without a human checkout flow.

## Security boundary

This bridge never creates wallets and never receives seed phrases/private keys. Payment signing remains client-side. Settlement is delegated to the configured facilitator.

## Next

1. Add protocol-shape tests with a mocked facilitator.
2. Attach the bridge to one existing PAL paid tool.
3. Publish a machine-readable MCP tool descriptor advertising Nano pricing.
4. Measure paid calls and only continue if usage can support meaningful recurring revenue.
