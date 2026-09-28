# PAL Nano Catalog Identifier Audit

A small deterministic paid API from Practical Automation Lab.

It audits product-catalog records for identifier and feed consistency:

- duplicate product IDs
- malformed or non-HTTP(S) product/image URLs
- GTIN length and checksum validity (GTIN-8/12/13/14)
- missing brand when an MPN is supplied
- missing identifiers when `identifier_exists` is true
- malformed price strings
- unsupported availability values

## Price

Each audit costs **0.01 XNO** and accepts up to 100 records.

The API uses a simple documented Nano 402 flow:

1. `POST /v1/audit` without payment.
2. Receive HTTP 402 with `pay_to` and `price_raw`.
3. Send at least that amount of XNO to the returned Nano address.
4. Retry the same request with `X-Nano-Payment: <send-block-hash>`.

The service verifies the send against the public Pursekeeper `/v1/verify` endpoint. The runtime stores only the public Nano receiving address; no wallet seed or private key is deployed or committed to this repository.

## Endpoints

- `GET /` — machine-readable service description
- `GET /health` — liveness
- `GET /v1/price` — current price and Nano receiving address
- `GET /v1/stats` — process-level counters
- `POST /v1/audit` — paid audit

### Example body

```json
{
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

## Scope

This is a deterministic consistency audit, not a guarantee of Google Merchant Center approval or regulatory compliance. It does not fetch submitted URLs and it does not retain submitted product records.
