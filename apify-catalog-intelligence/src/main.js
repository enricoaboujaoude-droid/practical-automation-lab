import { Actor } from 'apify';
import { XMLParser } from 'fast-xml-parser';
import { parse as parseCsv } from 'csv-parse/sync';

const PAL_BASE_URL = 'https://pal-nano-catalog-audit.onrender.com';
const MAX_FEED_BYTES = 10 * 1024 * 1024;
const MAX_PRODUCTS = 1000;
const BATCH_SIZE = 100;

const OPERATIONS = {
  'catalog-remediation': {
    path: '/v1/upstream/catalog-remediation',
    eventName: 'catalog-remediation',
    source: 'catalog',
  },
  'catalog-audit': {
    path: '/v1/upstream/catalog-audit',
    eventName: 'catalog-audit',
    source: 'catalog',
  },
  'gtin-check': {
    path: '/v1/upstream/gtin-check',
    eventName: 'gtin-check',
    source: 'gtins',
  },
  'feed-diff': {
    path: '/v1/upstream/feed-diff',
    eventName: 'feed-diff',
    source: 'feed-diff',
  },
  'x402-validate': {
    path: '/v1/upstream/x402-validate',
    eventName: 'x402-validate',
    source: 'declaration',
  },
};

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function scalar(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    for (const key of ['#text', 'text', 'value', '@_href', 'href']) {
      if (value[key] != null) return scalar(value[key]);
    }
  }
  return '';
}

function normalizeRecord(row) {
  const record = row && typeof row === 'object' ? row : {};
  const pick = (...keys) => {
    for (const key of keys) {
      if (record[key] != null && scalar(record[key]).trim() !== '') return scalar(record[key]).trim();
    }
    return '';
  };

  const result = {
    id: pick('id', 'sku', 'item_group_id'),
    title: pick('title', 'name'),
    link: pick('link', 'url', 'product_url'),
    image_link: pick('image_link', 'image', 'image_url'),
    gtin: pick('gtin', 'ean', 'upc', 'isbn'),
    brand: pick('brand'),
    mpn: pick('mpn', 'sku'),
    price: pick('price'),
    availability: pick('availability', 'stock_status'),
  };

  const identifierExists = record.identifier_exists ?? record.identifierExists;
  if (identifierExists != null && scalar(identifierExists).trim() !== '') {
    const normalized = scalar(identifierExists).trim().toLowerCase();
    result.identifier_exists = ['true', '1', 'yes'].includes(normalized);
  }

  for (const [key, value] of Object.entries(record)) {
    if (result[key] == null && value != null && typeof value !== 'object') result[key] = value;
  }

  return result;
}

function detectFeedFormat(text, requested = 'auto') {
  if (requested && requested !== 'auto') return requested;
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<')) return 'xml';
  const firstLine = trimmed.split(/\r?\n/, 1)[0] || '';
  return (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? 'tsv' : 'csv';
}

function parseXmlFeed(text) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    trimValues: true,
    parseTagValue: false,
  });
  const doc = parser.parse(text);
  const items =
    doc?.rss?.channel?.item ??
    doc?.channel?.item ??
    doc?.feed?.entry ??
    doc?.feed?.item ??
    doc?.items?.item ??
    [];
  const rows = asArray(items);
  if (!rows.length) throw new Error('No product entries found in XML feed');
  return rows.map(normalizeRecord);
}

function parseDelimitedFeed(text, delimiter) {
  const rows = parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
    delimiter,
  });
  if (!rows.length) throw new Error('No product rows found in delimited feed');
  return rows.map(normalizeRecord);
}

function parseFeed(text, requestedFormat = 'auto') {
  const format = detectFeedFormat(text, requestedFormat);
  if (format === 'xml') return { format, records: parseXmlFeed(text) };
  if (format === 'csv') return { format, records: parseDelimitedFeed(text, ',') };
  if (format === 'tsv') return { format, records: parseDelimitedFeed(text, '\t') };
  throw new Error(`Unsupported feedFormat "${format}". Use auto, xml, csv, or tsv.`);
}

async function fetchFeed(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('feedUrl must be a valid absolute HTTP(S) URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('feedUrl must use HTTP or HTTPS');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(parsed, {
      headers: { accept: 'application/xml,text/xml,text/csv,text/tab-separated-values,text/plain,*/*' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`feedUrl returned HTTP ${response.status}`);

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_FEED_BYTES) throw new Error('feedUrl exceeds the 10 MB input limit');

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_FEED_BYTES) throw new Error('feedUrl exceeds the 10 MB input limit');
    return buffer.toString('utf8');
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCatalogRecords(input) {
  if (Array.isArray(input.records) && input.records.length) {
    if (input.records.length > MAX_PRODUCTS) throw new Error(`records supports at most ${MAX_PRODUCTS} products`);
    return { source: 'records', format: 'json', records: input.records.map(normalizeRecord) };
  }

  let text = '';
  let source = '';
  if (typeof input.feedContent === 'string' && input.feedContent.trim()) {
    if (Buffer.byteLength(input.feedContent, 'utf8') > MAX_FEED_BYTES) throw new Error('feedContent exceeds the 10 MB input limit');
    text = input.feedContent;
    source = 'feedContent';
  } else if (typeof input.feedUrl === 'string' && input.feedUrl.trim()) {
    text = await fetchFeed(input.feedUrl.trim());
    source = 'feedUrl';
  } else {
    throw new Error('Provide records, feedUrl, or feedContent for this operation');
  }

  const parsed = parseFeed(text, String(input.feedFormat || 'auto'));
  if (parsed.records.length > MAX_PRODUCTS) {
    throw new Error(`Feed contains ${parsed.records.length} products; maximum is ${MAX_PRODUCTS}`);
  }
  return { source, format: parsed.format, records: parsed.records };
}

function chunks(values, size) {
  const result = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

async function callPal(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${PAL_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'PAL-Apify-Actor/1.1',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; }
    catch { payload = { raw: text }; }
    if (!response.ok) {
      const detail = payload?.detail || payload?.error || text || `HTTP ${response.status}`;
      throw new Error(`PAL upstream rejected the request: ${detail}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveAndCharge({ operation, eventName, result, batchIndex = 1, batchCount = 1 }) {
  const output = {
    ok: true,
    operation,
    provider: 'Practical Automation Lab',
    batch: { index: batchIndex, count: batchCount },
    result,
    generated_at: new Date().toISOString(),
  };

  await Actor.pushData(output);
  const charge = await Actor.charge({ eventName });
  if (Number(charge?.chargedCount ?? 0) < 1) {
    throw new Error('The run spending limit does not allow the next paid result. Increase the maximum run charge and try again.');
  }
  return output;
}

async function runCatalogOperation(input, config, operation) {
  const loaded = await loadCatalogRecords(input);
  const batches = chunks(loaded.records, BATCH_SIZE);
  const results = [];

  for (let index = 0; index < batches.length; index += 1) {
    const result = await callPal(config.path, { records: batches[index] });
    const saved = await saveAndCharge({
      operation,
      eventName: config.eventName,
      result,
      batchIndex: index + 1,
      batchCount: batches.length,
    });
    results.push(saved);
  }

  return {
    source: loaded.source,
    feed_format: loaded.format,
    product_count: loaded.records.length,
    batches: results.length,
    results,
  };
}

async function runGtinOperation(input, config, operation) {
  const gtins = input.gtins;
  if (!Array.isArray(gtins) || gtins.length < 1 || gtins.length > MAX_PRODUCTS) {
    throw new Error(`gtin-check requires 1 to ${MAX_PRODUCTS} values`);
  }
  const batches = chunks(gtins, BATCH_SIZE);
  const results = [];
  for (let index = 0; index < batches.length; index += 1) {
    const result = await callPal(config.path, { gtins: batches[index] });
    results.push(await saveAndCharge({
      operation,
      eventName: config.eventName,
      result,
      batchIndex: index + 1,
      batchCount: batches.length,
    }));
  }
  return { gtin_count: gtins.length, batches: results.length, results };
}

async function runSingleOperation(input, config, operation) {
  let body;
  if (config.source === 'feed-diff') {
    const before = input.before;
    const after = input.after;
    if (!Array.isArray(before) || !Array.isArray(after)) throw new Error('feed-diff requires before and after arrays');
    if (before.length > BATCH_SIZE || after.length > BATCH_SIZE || before.length + after.length < 1) {
      throw new Error('feed-diff supports up to 100 rows per snapshot and at least one total row');
    }
    body = { before, after };
  } else {
    const declaration = input.declaration;
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
      throw new Error('x402-validate requires declaration as an object');
    }
    body = declaration;
  }

  const result = await callPal(config.path, body);
  return saveAndCharge({ operation, eventName: config.eventName, result });
}

await Actor.init();
try {
  const input = (await Actor.getInput()) ?? {};
  const operation = String(input.operation || 'catalog-remediation');
  const config = OPERATIONS[operation];
  if (!config) throw new Error(`Unsupported operation "${operation}". Choose one of: ${Object.keys(OPERATIONS).join(', ')}`);

  let result;
  if (config.source === 'catalog') result = await runCatalogOperation(input, config, operation);
  else if (config.source === 'gtins') result = await runGtinOperation(input, config, operation);
  else result = await runSingleOperation(input, config, operation);

  const summary = {
    ok: true,
    operation,
    provider: 'Practical Automation Lab',
    billing: { platform: 'Apify', model: 'pay-per-event', event: config.eventName },
    ...result,
    generated_at: new Date().toISOString(),
  };
  await Actor.setValue('OUTPUT', summary);
} catch (error) {
  const output = {
    ok: false,
    provider: 'Practical Automation Lab',
    error: error instanceof Error ? error.message : String(error),
    generated_at: new Date().toISOString(),
  };
  await Actor.setValue('OUTPUT', output);
  throw error;
} finally {
  await Actor.exit();
}
