import crypto from "node:crypto";
import { authenticate } from "../shopify.server";

function getHeader(request: Request, names: string[]) {
  for (const name of names) {
    const value = request.headers.get(name);
    if (value) return value;
  }
  return null;
}

function validShopDomain(shop: string) {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

function verifyHmac(rawBody: string, provided: string, secret: string) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const suppliedBuffer = Buffer.from(provided, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

export async function authenticateWebhookSafely(request: Request) {
  const fallbackRequest = request.clone();
  const topicHeader = getHeader(fallbackRequest, [
    "x-shopify-topic",
    "shopify-topic",
  ]);

  try {
    const context = await authenticate.webhook(request);
    return {
      shop: context.shop,
      topic:
        topicHeader ??
        String(context.topic || "")
          .toLowerCase()
          .replaceAll("_", "/"),
      usedFallback: false,
    };
  } catch (error) {
    if (!(error instanceof Response) || error.status !== 500) {
      throw error;
    }

    const rawBody = await fallbackRequest.text();
    const providedHmac = getHeader(fallbackRequest, [
      "x-shopify-hmac-sha256",
      "shopify-hmac-sha256",
    ]);
    const shop = getHeader(fallbackRequest, [
      "x-shopify-shop-domain",
      "shopify-shop-domain",
    ]);
    const topic = getHeader(fallbackRequest, [
      "x-shopify-topic",
      "shopify-topic",
    ]);
    const secret = process.env.SHOPIFY_API_SECRET || "";

    if (
      !providedHmac ||
      !shop ||
      !topic ||
      !secret ||
      !validShopDomain(shop) ||
      !verifyHmac(rawBody, providedHmac, secret)
    ) {
      throw new Response("Unauthorized", { status: 401 });
    }

    try {
      const payload = JSON.parse(rawBody) as Record<string, unknown>;
      const payloadShop =
        typeof payload.shop_domain === "string"
          ? payload.shop_domain
          : typeof payload.myshopify_domain === "string"
            ? payload.myshopify_domain
            : null;

      if (payloadShop && payloadShop !== shop) {
        throw new Response("Unauthorized", { status: 401 });
      }
    } catch (parseError) {
      if (parseError instanceof Response) throw parseError;
    }

    console.warn(
      `PAL_SHOPIFY_WEBHOOK fallback_auth=true topic=${topic.toLowerCase()}`,
    );

    return {
      shop,
      topic: topic.toLowerCase(),
      usedFallback: true,
    };
  }
}
