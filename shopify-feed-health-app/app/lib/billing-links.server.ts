export function getPlanSelectionUrl(shop: string) {
  const appHandle = String(process.env.PAL_SHOPIFY_APP_HANDLE || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  const normalizedShop = String(shop || "").trim().toLowerCase();
  const suffix = ".myshopify.com";

  if (!appHandle || !normalizedShop.endsWith(suffix)) return null;

  const storeHandle = normalizedShop.slice(0, -suffix.length);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(storeHandle)) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9-_]*$/.test(appHandle)) return null;

  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}
