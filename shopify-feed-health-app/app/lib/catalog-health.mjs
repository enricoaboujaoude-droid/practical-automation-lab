export const ISSUE_LEVEL = Object.freeze({ ERROR: "error", WARNING: "warning" });

function issue(level, code, productId, title, message, remediation) {
  return { level, code, productId, title, message, remediation };
}

function variantKey(variant) {
  return (variant.selectedOptions || [])
    .map((option) => `${String(option.name || "").trim().toLowerCase()}=${String(option.value || "").trim().toLowerCase()}`)
    .sort()
    .join("|");
}

export function auditCatalog(products = []) {
  const issues = [];
  let variantsChecked = 0;
  let imagesChecked = 0;
  let productsWithCritical = 0;

  for (const product of products) {
    const before = issues.length;
    const productId = product.id || "unknown";
    const title = String(product.title || "Untitled product");
    const vendor = String(product.vendor || "").trim();
    const variants = product.variants?.nodes || [];
    const images = product.images?.nodes || [];

    if (!title.trim()) {
      issues.push(issue(ISSUE_LEVEL.ERROR, "MISSING_TITLE", productId, title, "Product title is missing.", "Add a clear merchant-facing product title."));
    }
    if (!vendor) {
      issues.push(issue(ISSUE_LEVEL.WARNING, "MISSING_BRAND", productId, title, "Vendor/brand is blank.", "Add the real brand/vendor where applicable; do not invent identifiers."));
    }
    if (!product.onlineStoreUrl) {
      issues.push(issue(ISSUE_LEVEL.WARNING, "NO_ONLINE_STORE_URL", productId, title, "No Online Store product URL is currently available.", "Confirm the product is published to the intended sales channel before relying on it in a shopping feed."));
    }
    if (!images.length) {
      issues.push(issue(ISSUE_LEVEL.ERROR, "MISSING_IMAGE", productId, title, "Product has no image.", "Add at least one accurate product image before feed submission."));
    }

    for (const image of images) {
      imagesChecked += 1;
      const width = Number(image.width || 0);
      const height = Number(image.height || 0);
      if (width && height && Math.min(width, height) < 500) {
        issues.push(issue(ISSUE_LEVEL.WARNING, "IMAGE_BELOW_500", productId, title, `Image is ${width}×${height}, below the 500×500 readiness target.`, "Replace or upgrade the image before the stricter Merchant Center image minimum takes effect."));
      }
    }

    const seen = new Map();
    for (const variant of variants) {
      variantsChecked += 1;
      const sku = String(variant.sku || "").trim();
      const barcode = String(variant.barcode || "").trim();
      const price = Number(variant.price || 0);
      if (!sku && !barcode) {
        issues.push(issue(ISSUE_LEVEL.WARNING, "IDENTIFIER_GAP", productId, title, `Variant “${variant.title || "Default"}” has neither SKU/MPN nor barcode/GTIN.`, "Supply accurate identifiers when they exist; never fabricate GTINs."));
      }
      if (!Number.isFinite(price) || price <= 0) {
        issues.push(issue(ISSUE_LEVEL.ERROR, "NON_POSITIVE_PRICE", productId, title, `Variant “${variant.title || "Default"}” has a non-positive or invalid price.`, "Set a valid sell price or exclude the item from the target feed."));
      }
      const key = variantKey(variant);
      if (key) {
        const previous = seen.get(key);
        if (previous) {
          issues.push(issue(ISSUE_LEVEL.ERROR, "DUPLICATE_VARIANT_OPTIONS", productId, title, `Duplicate option combination between variants “${previous}” and “${variant.title || "Default"}”.`, "Make variant option combinations unique."));
        } else {
          seen.set(key, variant.title || "Default");
        }
      }
    }

    if (product.variants?.pageInfo?.hasNextPage) {
      issues.push(issue(ISSUE_LEVEL.WARNING, "VARIANT_SCAN_TRUNCATED", productId, title, "This product has more variants than the MVP scan loaded.", "Use the future bulk-scan path before treating this product as fully checked."));
    }

    const newIssues = issues.slice(before);
    if (newIssues.some((entry) => entry.level === ISSUE_LEVEL.ERROR)) productsWithCritical += 1;
  }

  const errors = issues.filter((entry) => entry.level === ISSUE_LEVEL.ERROR).length;
  const warnings = issues.filter((entry) => entry.level === ISSUE_LEVEL.WARNING).length;
  const score = Math.max(0, 100 - Math.min(70, errors * 8) - Math.min(30, warnings * 2));

  return {
    generatedAt: new Date().toISOString(),
    productsChecked: products.length,
    variantsChecked,
    imagesChecked,
    productsWithCritical,
    errors,
    warnings,
    score,
    issues,
  };
}
