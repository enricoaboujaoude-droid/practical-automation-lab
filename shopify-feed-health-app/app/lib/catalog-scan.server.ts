import { auditCatalog } from "./catalog-health.mjs";

type AdminClient = { graphql: (query: string, options?: Record<string, unknown>) => Promise<Response> };

const QUERY = `#graphql
  query FeedHealthCatalog($after: String) {
    products(first: 100, after: $after, sortKey: ID) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        vendor
        handle
        onlineStoreUrl
        images(first: 20) { nodes { id url width height altText } }
        variants(first: 100) {
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

export async function scanCatalog(admin: AdminClient) {
  const products: unknown[] = [];
  let after: string | null = null;
  let pages = 0;
  do {
    const response = await admin.graphql(QUERY, { variables: { after } });
    const body = await response.json();
    if (body.errors?.length) throw new Error(body.errors.map((error: { message?: string }) => error.message || "GraphQL error").join("; "));
    const connection = body.data?.products;
    if (!connection) throw new Error("Shopify returned no products connection.");
    products.push(...connection.nodes);
    pages += 1;
    after = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (after && pages < 25);

  return {
    report: auditCatalog(products),
    productPaginationCapped: Boolean(after),
  };
}
