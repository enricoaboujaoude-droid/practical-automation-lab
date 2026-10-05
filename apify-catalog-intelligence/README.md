# Merchant Center Catalog Intelligence

Audit and repair ecommerce product data before it reaches Google Merchant Center, shopping feeds, marketplaces, or downstream automation.

This Actor exposes deterministic commerce-data tools from **Practical Automation Lab**. It does not need merchant credentials and does not use an LLM for validation.

## Best use cases

- Diagnose product-feed problems before Merchant Center upload
- Generate a prioritized remediation plan instead of only raw warnings
- Validate GTIN-8, UPC/GTIN-12, GTIN-13, and GTIN-14 check digits
- Compare two feed snapshots to detect price, availability, and other field changes
- Validate x402 v2 payment declarations for Base/EVM correctness

## Operations

### Catalog remediation plan — primary premium operation

Choose `catalog-remediation` and supply 1-100 product records.

The result includes the underlying audit plus prioritized corrective actions grouped by issue and business impact. It is designed for merchants, feed-management systems, ecommerce automation, and AI agents that need actionable output rather than a pass/fail response.

### Catalog feed audit

Choose `catalog-audit` to check 1-100 records for duplicate IDs, identifier consistency, GTIN formatting/checksums, URLs, prices, availability, and brand/MPN consistency.

### GTIN / UPC / EAN validation

Choose `gtin-check` with up to 100 values.

### Product feed diff

Choose `feed-diff` with `before` and `after` snapshots to identify added, removed, and changed commerce fields.

### x402 declaration validation

Choose `x402-validate` to statically inspect x402 v2 payment declarations without fetching or paying the declared resource.

## Recommended pay-per-event configuration

Configure these events in **Apify Console → Publication → Monetization → Pay per event**:

| Event | Suggested price |
| --- | ---: |
| `catalog-remediation` | $1.00 |
| `catalog-audit` | $0.25 |
| `feed-diff` | $0.25 |
| `gtin-check` | $0.10 |
| `x402-validate` | $0.10 |

The Actor charges only after the upstream operation returns successfully.

## Example input

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

The result is written both to the run's `OUTPUT` key-value-store record and to the default dataset, making it easy to consume from the Apify API, integrations, or agents.

## Reliability and privacy

The Actor sends only the submitted operation payload to the PAL commerce-data service. No store login, merchant token, payment credentials, or private key is required.
