# Merchant Center Catalog Intelligence

Turn ecommerce product feeds into **actionable Merchant Center remediation**, not just another validation report.

This Actor accepts public Google Merchant XML/CSV/TSV feeds, pasted feed content, or JSON product records. It can audit and remediate up to **1,000 products per run**, processing catalog work in 100-product batches.

It exposes deterministic commerce-data tools from **Practical Automation Lab**. It does not need merchant credentials and does not use an LLM for validation.

## What makes this Actor different

Most feed validators stop at "this field is wrong." The primary `catalog-remediation` operation returns a prioritized fix plan grouped by issue and business impact, with concrete corrective actions and affected products.

It also includes GTIN validation, feed-diff monitoring, and x402 payment-declaration validation in one Actor.

## Inputs

For `catalog-remediation` or `catalog-audit`, provide one of:

- `feedUrl`: public Google Merchant XML, CSV, or TSV feed
- `feedContent`: pasted XML, CSV, or TSV
- `records`: JSON array of product records

Maximum feed size: **10 MB**  
Maximum products per catalog run: **1,000**

## Operations

### Catalog remediation plan — primary premium operation

Choose `catalog-remediation`.

Each paid event covers up to **100 products**. A 1,000-product feed is processed as ten independently billed batches.

The result includes the base audit plus prioritized corrective actions grouped by issue code and business impact.

### Catalog feed audit

Choose `catalog-audit`.

Checks duplicate IDs, GTIN formatting/checksums, URLs, price formatting, availability, and brand/MPN/identifier consistency.

### GTIN / UPC / EAN validation

Choose `gtin-check` with up to 1,000 values. The Actor batches them automatically.

### Product feed diff

Choose `feed-diff` with `before` and `after` snapshots of up to 100 rows each.

### x402 declaration validation

Choose `x402-validate` to statically inspect x402 v2 payment declarations without fetching or paying the declared resource.

## Recommended pay-per-event configuration

Configure these events in **Apify Console → Publication → Monetization → Pay per event**:

| Event | Suggested price | Billing unit |
| --- | ---: | --- |
| `catalog-remediation` | $1.00 | up to 100 products |
| `catalog-audit` | $0.25 | up to 100 products |
| `feed-diff` | $0.25 | one comparison |
| `gtin-check` | $0.10 | up to 100 GTINs |
| `x402-validate` | $0.10 | one declaration |

Results are saved before the event charge is issued, following Apify's pay-per-event guidance.

## Example: audit a public feed

```json
{
  "operation": "catalog-remediation",
  "feedUrl": "https://example.com/google-shopping-feed.xml",
  "feedFormat": "auto"
}
```

## Example: audit JSON records

```json
{
  "operation": "catalog-remediation",
  "records": [
    {
      "id": "sku-100",
      "title": "Example Product",
      "link": "https://example.com/products/sku-100",
      "image_link": "https://example.com/images/sku-100.jpg",
      "gtin": "4006381333931",
      "brand": "Example",
      "mpn": "SKU-100",
      "price": "19.99 USD",
      "availability": "in_stock",
      "identifier_exists": true
    }
  ]
}
```

## Output

Every successful batch is written to the default dataset. A run-level summary is written to the `OUTPUT` key-value-store record.

## Privacy

Only the submitted public catalog data or operation payload is sent to the PAL commerce-data service. No store login, merchant token, payment credential, customer record, or private key is required.
