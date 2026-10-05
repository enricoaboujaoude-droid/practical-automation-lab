import { randomUUID } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { parse as parseCsv } from 'csv-parse/sync';

const PAL_BASE_URL = 'https://pal-nano-catalog-audit.onrender.com';
const MAX_FEED_BYTES = 10 * 1024 * 1024;
const MAX_PRODUCTS = 1000;
const BATCH_SIZE = 100;

const EVENT_PRICES_USD = Object.freeze({
  'catalog-remediation': 1.00,
  'catalog-audit': 0.25,
  'gtin-check': 0.10,
  'feed-diff': 0.25,
  'x402-validate': 0.10,
});

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

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Required Apify runtime variable ${name} is missing`);
  return value;
}

function apiBaseUrl() {
  const raw = String(process.env.APIFY_API_PUBLIC_BASE_URL || 'https://api.apify.com').trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/$/, '');
}

function runtime() {
  return {
    runId: requiredEnv('ACTOR_RUN_ID'),
    datasetId: requiredEnv('ACTOR_DEFAULT_DATASET_ID'),
    keyValueStoreId: requiredEnv('ACTOR_DEFAULT_KEY_VALUE_STORE_ID'),
    inputKey: String(process.env.ACTOR_INPUT_KEY || 'INPUT'),
    token: requiredEnv('APIFY_TOKEN'),
    apiBase: apiBaseUrl(),
    maxChargeUsd: Number(process.env.ACTOR_MAX_TOTAL_CHARGE_USD || Number.POSITIVE_INFINITY),
  };
}

async function apifyRequest(rt, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${rt.token}`);
  if (options.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (!headers.has('accept')) headers.set('accept', 'application/json');

  const response = await fetch(`${rt.apiBase}/v2${path}`, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apify API ${options.method || 'GET'} ${path} failed HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return response;
}

async function getInput(rt) {
  const response = await apifyRequest(
    rt,
    `/key-value-stores/${encodeURIComponent(rt.keyValueStoreId)}/records/${encodeURIComponent(rt.inputKey)}`,
  );
  const text = await response.text();
  if (!text.trim()) return {};
  return JSON.parse(text);
}

async function pushData(rt, item) {
  await apifyRequest(rt, `/datasets/${encodeURIComponent(rt.datasetId)}/items`, {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

async function setValue(rt, key, value) {
  await apifyRequest(
    rt,
    `/key-value-stores/${encodeURIComponent(rt.keyValueStoreId)}/records/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      body: JSON.stringify(value),
    },
  );
}

let plannedChargeUsd = 0;

function ensureChargeBudget(rt, eventName) {
  const price = EVENT_PRICES_USD[eventName];
  if (!Number.isFinite(price)) throw new Error(`No local price configured for event ${eventName}`);

  if (Number.isFinite(rt.maxChargeUsd) && plannedChargeUsd + price > rt.maxChargeUsd + 1e-9) {
    throw new Error(
      `The next ${eventName} result would exceed the run's maximum total charge of $${rt.maxChargeUsd.toFixed(2)}. ` +
      'Increase the maximum run charge to process additional batches.',
    );
  }
}

async function charge(rt, eventName) {
  ensureChargeBudget(rt, eventName);

  const response = await apifyRequest(rt, `/actor-runs/${encodeURIComponent(rt.runId)}/charge`, {
    method: 'POST',
    headers: {
      'idempotency-key': `${rt.runId}-${eventName}-${randomUUID()}`,
    },
    body: JSON.stringify({ eventName, count: 1 }),
  });

  plannedChargeUsd += EVENT_PRICES_USD[eventName];
  const text = await response.text();
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

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
  try { parsed = new URL(url); }
  catch { throw new Error('feedUrl must be a valid absolute HTTP(S) URL'); }
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
        'user-agent': 'PAL-Apify-Actor/1.2',
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

async function saveAndCharge(rt, { operation, eventName, result, batchIndex = 1, batchCount = 1 }) {
  ensureChargeBudget(rt, eventName);

  const output = {
    ok: true,
    operation,
    provider: 'Practical Automation Lab',
    batch: { index: batchIndex, count: batchCount },
    result,
    generated_at: new Date().toISOString(),
  };

  // Apify recommends persisting the paid result before emitting the charge event.
  await pushData(rt, output);
  await charge(rt, eventName);
  return output;
}

async function runCatalogOperation(rt, input, config, operation) {
  const loaded = await loadCatalogRecords(input);
  const batches = chunks(loaded.records, BATCH_SIZE);
  const results = [];

  for (let index = 0; index < batches.length; index += 1) {
    ensureChargeBudget(rt, config.eventName);
    const result = await callPal(config.path, { records: batches[index] });
    results.push(await saveAndCharge(rt, {
      operation,
      eventName: config.eventName,
      result,
      batchIndex: index + 1,
      batchCount: batches.length,
    }));
  }

  return {
    source: loaded.source,
    feed_format: loaded.format,
    product_count: loaded.records.length,
    batches: results.length,
    results,
  };
}

async function runGtinOperation(rt, input, config, operation) {
  const gtins = input.gtins;
  if (!Array.isArray(gtins) || gtins.length < 1 || gtins.length > MAX_PRODUCTS) {
    throw new Error(`gtin-check requires 1 to ${MAX_PRODUCTS} values`);
  }

  const batches = chunks(gtins, BATCH_SIZE);
  const results = [];
  for (let index = 0; index < batches.length; index += 1) {
    ensureChargeBudget(rt, config.eventName);
    const result = await callPal(config.path, { gtins: batches[index] });
    results.push(await saveAndCharge(rt, {
      operation,
      eventName: config.eventName,
      result,
      batchIndex: index + 1,
      batchCount: batches.length,
    }));
  }
  return { gtin_count: gtins.length, batches: results.length, results };
}

async function runSingleOperation(rt, input, config, operation) {
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

  ensureChargeBudget(rt, config.eventName);
  const result = await callPal(config.path, body);
  return saveAndCharge(rt, { operation, eventName: config.eventName, result });
}

const rt = runtime();

try {
  const input = await getInput(rt);
  const operation = String(input.operation || 'catalog-remediation');
  const config = OPERATIONS[operation];
  if (!config) {
    throw new Error(`Unsupported operation "${operation}". Choose one of: ${Object.keys(OPERATIONS).join(', ')}`);
  }

  let result;
  if (config.source === 'catalog') result = await runCatalogOperation(rt, input, config, operation);
  else if (config.source === 'gtins') result = await runGtinOperation(rt, input, config, operation);
  else result = await runSingleOperation(rt, input, config, operation);

  await setValue(rt, 'OUTPUT', {
    ok: true,
    operation,
    provider: 'Practical Automation Lab',
    billing: {
      platform: 'Apify',
      model: 'pay-per-event',
      event: config.eventName,
      planned_charge_usd: Number(plannedChargeUsd.toFixed(2)),
    },
    ...result,
    generated_at: new Date().toISOString(),
  });
} catch (error) {
  const failure = {
    ok: false,
    provider: 'Practical Automation Lab',
    error: error instanceof Error ? error.message : String(error),
    generated_at: new Date().toISOString(),
  };

  try { await setValue(rt, 'OUTPUT', failure); }
  catch (storageError) {
    console.error('Could not persist failure output:', storageError instanceof Error ? storageError.message : String(storageError));
  }

  console.error(failure.error);
  process.exitCode = 1;
}
