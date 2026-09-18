import { auditCatalog } from "./catalog-health.mjs";

type AdminClient = {
  graphql: (query: string, options?: Record<string, unknown>) => Promise<Response>;
};

export type ScanLimits = {
  maxProducts: number;
  productPageSize: number;
  variantLimit: number;
  imageLimit: number;
};

export const FREE_SCAN_LIMITS: ScanLimits = Object.freeze({
  maxProducts: 2_500,
  productPageSize: 100,
  variantLimit: 100,
  imageLimit: 20,
});

export const PRO_SCAN_LIMITS: ScanLimits = Object.freeze({
  maxProducts: 10_000,
  productPageSize: 100,
  variantLimit: 250,
  imageLimit: 100,
});

const QUERY = `#graphql
  query CatalogHealth(
    $after: String
    $productFirst: Int!
    $variantFirst: Int!
    $imageFirst: Int!
  ) {
    products(first: $productFirst, after: $after, sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        vendor
        handle
        onlineStoreUrl
        images(first: $imageFirst) {
          pageInfo { hasNextPage }
          nodes { id url width height altText }
        }
        variants(first: $variantFirst) {
          pageInfo { hasNextPage }
          nodes {
            id
            title
            sku
            barcode
            price
            selectedOptions { name value }
          }
        }
      }
    }
  }
`;

export async function scanCatalog(
  admin: AdminClient,
  limits: ScanLimits = FREE_SCAN_LIMITS,
) {
  const products: unknown[] = [];
  let after: string | null = null;
  let productPaginationCapped = false;

  do {
    const remaining = limits.maxProducts - products.length;
    if (remaining <= 0) {
      productPaginationCapped = Boolean(after);
      break;
    }

    const productFirst = Math.min(limits.productPageSize, remaining);
    const response = await admin.graphql(QUERY, {
      variables: {
        after,
        productFirst,
        variantFirst: limits.variantLimit,
        imageFirst: limits.imageLimit,
      },
    });
    const body = await response.json();
    if (body.errors?.length) {
      throw new Error(
        body.errors
          .map((error: { message?: string }) => error.message || "GraphQL error")
          .join("; "),
      );
    }

    const connection = body.data?.products;
    if (!connection) throw new Error("Shopify returned no products connection.");

    products.push(...connection.nodes);
    after = connection.pageInfo.hasNextPage
      ? connection.pageInfo.endCursor
      : null;

    if (products.length >= limits.maxProducts && connection.pageInfo.hasNextPage) {
      productPaginationCapped = true;
      break;
    }
  } while (after);

  return {
    report: auditCatalog(products, {
      variantLimit: limits.variantLimit,
      imageLimit: limits.imageLimit,
    }),
    productPaginationCapped,
    limits,
  };
}
