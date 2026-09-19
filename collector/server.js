'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const PADDLE_NOTIFICATION_WEBHOOK_SECRET = process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET || '';
const FASTSPRING_WEBHOOK_SECRET = process.env.FASTSPRING_WEBHOOK_SECRET || '';
const FASTSPRING_API_USERNAME = process.env.FASTSPRING_API_USERNAME || '';
const FASTSPRING_API_PASSWORD = process.env.FASTSPRING_API_PASSWORD || '';
const FASTSPRING_CHECKOUT_PATH = process.env.FASTSPRING_CHECKOUT_PATH || '';
const FASTSPRING_CHECKOUT_LIVE = String(process.env.FASTSPRING_CHECKOUT_LIVE || 'false').toLowerCase() === 'true';
const SITE_ORIGIN = 'https://practical-automation-lab.onrender.com';
const ALLOWED_EVENTS = new Set([
  'audit_started',
  'audit_completed',
  'report_downloaded',
  'commercial_cta_viewed',
  'commercial_cta_clicked',
  'shopify_beta_interest',
  'merchant_migration_started',
  'merchant_migration_completed',
  'merchant_migration_report_downloaded',
  'merchant_migration_commercial_cta_clicked',
  'hubspot_migration_started',
  'hubspot_migration_completed',
  'hubspot_migration_report_downloaded',
  'hubspot_migration_commercial_cta_clicked',
  'eudr_preflight_started',
  'eudr_preflight_completed',
  'eudr_preflight_report_downloaded',
  'eudr_preflight_commercial_cta_clicked',
  'battery_passport_preflight_started',
  'battery_passport_preflight_completed',
  'battery_passport_report_downloaded',
  'battery_passport_commercial_cta_clicked',
  'commercial_lead_submitted',
]);

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function insertEvent(eventName, isTest) {
  if (!ALLOWED_EVENTS.has(eventName)) {
    const error = new Error('Unsupported event');
    error.statusCode = 400;
    throw error;
  }

  await pool.query(
    'insert into pal_feed_auditor_events (event_name, is_test) values ($1, $2)',
    [eventName, Boolean(isTest)]
  );

  console.log(`PAL_EVENT event=${eventName} is_test=${Boolean(isTest)}`);
}

async function initialize() {
  await pool.query(`
    create table if not exists pal_feed_auditor_events (
      id bigserial primary key,
      event_name text not null,
      is_test boolean not null default false,
      occurred_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    alter table pal_feed_auditor_events
      drop constraint if exists pal_feed_auditor_events_event_name_check
  `);
  await pool.query(`
    alter table pal_feed_auditor_events
      add constraint pal_feed_auditor_events_event_name_check
      check (event_name in (
        'audit_started',
        'audit_completed',
        'report_downloaded',
        'commercial_cta_viewed',
        'commercial_cta_clicked',
        'shopify_beta_interest',
        'merchant_migration_started',
        'merchant_migration_completed',
        'merchant_migration_report_downloaded',
        'merchant_migration_commercial_cta_clicked',
        'hubspot_migration_started',
        'hubspot_migration_completed',
        'hubspot_migration_report_downloaded',
        'hubspot_migration_commercial_cta_clicked',
        'eudr_preflight_started',
        'eudr_preflight_completed',
        'eudr_preflight_report_downloaded',
        'eudr_preflight_commercial_cta_clicked',
        'battery_passport_preflight_started',
        'battery_passport_preflight_completed',
        'battery_passport_report_downloaded',
        'battery_passport_commercial_cta_clicked',
        'commercial_lead_submitted'
      ))
  `);
  await pool.query(`
    create index if not exists pal_feed_auditor_events_occurred_at_idx
      on pal_feed_auditor_events (occurred_at desc)
  `);

  await pool.query(`
    create table if not exists pal_commercial_leads (
      id bigserial primary key,
      email text not null,
      company text,
      product text not null,
      intent text not null,
      message text,
      consent boolean not null default false,
      status text not null default 'new',
      created_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create index if not exists pal_commercial_leads_created_at_idx
      on pal_commercial_leads (created_at desc)
  `);

  await pool.query(`
    create table if not exists pal_paddle_webhook_events (
      event_id text primary key,
      event_type text not null,
      occurred_at timestamptz,
      resource_id text,
      customer_id text,
      transaction_id text,
      subscription_id text,
      status text,
      is_simulation boolean not null default false,
      claim_id text,
      plan text,
      source text,
      currency_code text,
      amount_minor bigint,
      processed_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    alter table pal_paddle_webhook_events
      add column if not exists is_simulation boolean not null default false,
      add column if not exists claim_id text,
      add column if not exists plan text,
      add column if not exists source text,
      add column if not exists currency_code text,
      add column if not exists amount_minor bigint
  `);

  await pool.query(`
    create index if not exists pal_paddle_webhook_events_processed_at_idx
      on pal_paddle_webhook_events (processed_at desc)
  `);

  await pool.query(`
    create index if not exists pal_paddle_webhook_events_claim_id_idx
      on pal_paddle_webhook_events (claim_id, occurred_at desc)
      where claim_id is not null
  `);

  await pool.query(`
    update pal_paddle_webhook_events
       set is_simulation = true
     where event_id like 'ntfsimevt_%'
       and is_simulation = false
  `);

  await pool.query(`
    create table if not exists pal_fastspring_webhook_events (
      event_id text primary key,
      event_type text not null,
      live boolean not null default false,
      occurred_at timestamptz,
      order_id text,
      subscription_id text,
      status text,
      claim_id text,
      plan text,
      source text,
      currency_code text,
      amount_minor bigint,
      processed_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create index if not exists pal_fastspring_webhook_events_processed_at_idx
      on pal_fastspring_webhook_events (processed_at desc)
  `);

  await pool.query(`
    create index if not exists pal_fastspring_webhook_events_claim_id_idx
      on pal_fastspring_webhook_events (claim_id, occurred_at desc)
      where claim_id is not null
  `);

  await insertEvent('audit_started', true);
  console.log('PAL_MEASUREMENT_PROBE ok=true event=audit_started production_excluded=true');
}

function applySecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin === SITE_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', SITE_ORIGIN);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(req, res, status, payload) {
  applySecurityHeaders(res);
  applyCors(req, res);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendEmpty(req, res, status = 204) {
  applySecurityHeaders(res);
  applyCors(req, res);
  res.statusCode = status;
  res.end();
}

async function readSmallTextBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 128) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body.trim()));
    req.on('error', reject);
  });
}

async function readJsonBody(req, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        const error = new Error('Payload too large');
        error.statusCode = 413;
        reject(error);
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        const error = new Error('Invalid JSON');
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

async function readRawBody(req, maxBytes = 262144) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) {
        const error = new Error('Payload too large');
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function verifyPaddleSignature(rawBody, signatureHeader) {
  if (!PADDLE_NOTIFICATION_WEBHOOK_SECRET) {
    const error = new Error('Paddle webhook secret is not configured');
    error.statusCode = 503;
    throw error;
  }

  if (!signatureHeader || !rawBody) {
    const error = new Error('Missing Paddle signature or body');
    error.statusCode = 400;
    throw error;
  }

  let timestamp = null;
  const signatures = [];
  for (const part of String(signatureHeader).split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 'ts') timestamp = value;
    if (key === 'h1' && value) signatures.push(value);
  }

  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) {
    const error = new Error('Invalid Paddle signature header');
    error.statusCode = 400;
    throw error;
  }

  const eventTime = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(eventTime) || Math.abs(now - eventTime) > 300) {
    const error = new Error('Expired Paddle webhook signature');
    error.statusCode = 408;
    throw error;
  }

  const expected = crypto
    .createHmac('sha256', PADDLE_NOTIFICATION_WEBHOOK_SECRET)
    .update(`${timestamp}:${rawBody}`, 'utf8')
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const valid = signatures.some(candidate => {
    const candidateBuffer = Buffer.from(candidate, 'utf8');
    return (
      candidateBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(candidateBuffer, expectedBuffer)
    );
  });

  if (!valid) {
    const error = new Error('Invalid Paddle webhook signature');
    error.statusCode = 401;
    throw error;
  }
}

function verifyFastSpringSignature(rawBody, signatureHeader) {
  if (!FASTSPRING_WEBHOOK_SECRET) {
    const error = new Error('FastSpring webhook secret is not configured');
    error.statusCode = 503;
    throw error;
  }

  if (!signatureHeader || !rawBody) {
    const error = new Error('Missing FastSpring signature or body');
    error.statusCode = 400;
    throw error;
  }

  const expected = crypto
    .createHmac('sha256', FASTSPRING_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(String(signatureHeader).trim(), 'utf8');
  const valid =
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer);

  if (!valid) {
    const error = new Error('Invalid FastSpring webhook signature');
    error.statusCode = 401;
    throw error;
  }
}

function fastSpringEventDate(event, data) {
  const candidates = [event?.created, data?.changed, data?.changedValue];
  for (const value of candidates) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) continue;
    const milliseconds = number < 100000000000 ? number * 1000 : number;
    const date = new Date(milliseconds);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function fastSpringTags(data) {
  const candidates = [
    data?.tags,
    data?.order?.tags,
    data?.subscription?.tags,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate;
    }
  }
  return {};
}

function fastSpringAmountMinor(data) {
  const candidates = [data?.total, data?.order?.total];
  for (const value of candidates) {
    if (typeof value !== 'number' && typeof value !== 'string') continue;
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) {
      return String(Math.round(number * 100));
    }
  }
  return null;
}

async function recordFastSpringEvent(event) {
  const eventId = cleanText(event?.id, 128);
  const eventType = cleanText(event?.type, 128);
  const data = event && typeof event.data === 'object' && event.data ? event.data : {};

  if (!eventId || !eventType) {
    const error = new Error('Invalid FastSpring event');
    error.statusCode = 400;
    throw error;
  }

  const live = event?.live === true || data?.live === true;
  const occurredAt = fastSpringEventDate(event, data);
  const tags = fastSpringTags(data);
  const claimId = cleanText(tags.pal_claim_id, 128);
  const plan = cleanText(tags.pal_plan, 32);
  const source = cleanText(tags.pal_source, 64);

  const orderId = cleanText(
    eventType.startsWith('order.')
      ? data.id || data.order
      : data?.order?.id || data?.order?.order || data?.order,
    128
  );

  const subscriptionId = cleanText(
    eventType.startsWith('subscription.')
      ? data.id || data.subscription
      : data?.subscription?.id || data?.subscription?.subscription || data?.subscription,
    128
  );

  let status = cleanText(data.state || data.status, 64).toLowerCase();
  if (!status && typeof data.active === 'boolean') {
    status = data.active ? 'active' : 'inactive';
  }
  if (!status && eventType === 'order.completed') status = 'completed';
  if (!status && eventType === 'subscription.charge.completed') status = 'completed';

  const currencyCode = cleanText(
    data.currency || data?.order?.currency,
    3
  ).toUpperCase();
  const amountMinor = fastSpringAmountMinor(data);

  await pool.query(
    `insert into pal_fastspring_webhook_events
      (event_id, event_type, live, occurred_at, order_id, subscription_id, status, claim_id, plan, source, currency_code, amount_minor)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (event_id) do nothing`,
    [
      eventId,
      eventType,
      live,
      occurredAt,
      orderId || null,
      subscriptionId || null,
      status || null,
      claimId || null,
      plan || null,
      source || null,
      currencyCode || null,
      amountMinor,
    ]
  );

  console.log(
    `PAL_FASTSPRING_WEBHOOK event_id=${eventId} event_type=${eventType} live=${live} order_id=${orderId || '-'} subscription_id=${subscriptionId || '-'}`
  );
}

async function getFastSpringEntitlement(claimId) {
  const { rows } = await pool.query(
    `select event_type, status, occurred_at, processed_at
       from pal_fastspring_webhook_events
      where claim_id = $1
        and live = true
      order by coalesce(occurred_at, processed_at) desc
      limit 50`,
    [claimId]
  );

  if (rows.length === 0) {
    return { active: false, state: 'pending' };
  }

  const deactivated = rows.find(row => row.event_type === 'subscription.deactivated');
  if (deactivated) {
    const laterActive = rows.find(row =>
      ['subscription.activated', 'subscription.charge.completed'].includes(row.event_type) &&
      new Date(row.occurred_at || row.processed_at) >
        new Date(deactivated.occurred_at || deactivated.processed_at)
    );
    if (!laterActive) return { active: false, state: 'deactivated' };
  }

  const activeSubscription = rows.find(row =>
    ['subscription.activated', 'subscription.charge.completed'].includes(row.event_type)
  );
  if (activeSubscription) {
    return { active: true, state: 'active' };
  }

  const completedOrder = rows.find(row => row.event_type === 'order.completed');
  if (completedOrder) {
    return { active: true, state: 'paid' };
  }

  return { active: false, state: 'pending' };
}

async function recordPaddleEvent(event) {
  const eventId = cleanText(event?.event_id, 128);
  const eventType = cleanText(event?.event_type, 128);
  const occurredAt = cleanText(event?.occurred_at, 80);
  const data = event && typeof event.data === 'object' && event.data ? event.data : {};

  if (!eventId || !eventType) {
    const error = new Error('Invalid Paddle event');
    error.statusCode = 400;
    throw error;
  }

  const resourceId = cleanText(data.id, 128);
  const customerId = cleanText(data.customer_id, 128);
  const transactionId = cleanText(
    eventType.startsWith('transaction.') ? data.id : data.transaction_id,
    128
  );
  const subscriptionId = cleanText(
    eventType.startsWith('subscription.') ? data.id : data.subscription_id,
    128
  );
  const status = cleanText(data.status, 64);
  const customData =
    data && typeof data.custom_data === 'object' && data.custom_data
      ? data.custom_data
      : {};
  const claimId = cleanText(customData.pal_claim_id, 128);
  const plan = cleanText(customData.pal_plan, 32);
  const source = cleanText(customData.pal_source, 64);
  const currencyCode = cleanText(
    data.currency_code || data?.details?.totals?.currency_code,
    3
  ).toUpperCase();
  const rawAmount = cleanText(data?.details?.totals?.total, 32);
  const amountMinor = /^\d+$/.test(rawAmount) ? rawAmount : null;
  const isSimulation = eventId.startsWith('ntfsimevt_');

  await pool.query(
    `insert into pal_paddle_webhook_events
      (event_id, event_type, occurred_at, resource_id, customer_id, transaction_id, subscription_id, status, is_simulation, claim_id, plan, source, currency_code, amount_minor)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     on conflict (event_id) do nothing`,
    [
      eventId,
      eventType,
      occurredAt || null,
      resourceId || null,
      customerId || null,
      transactionId || null,
      subscriptionId || null,
      status || null,
      isSimulation,
      claimId || null,
      plan || null,
      source || null,
      currencyCode || null,
      amountMinor,
    ]
  );

  console.log(
    `PAL_PADDLE_WEBHOOK event_id=${eventId} event_type=${eventType} simulation=${isSimulation} resource_id=${resourceId || '-'}`
  );
}

async function getPaddleEntitlement(claimId) {
  const { rows } = await pool.query(
    `select event_type, status, occurred_at, processed_at
       from pal_paddle_webhook_events
      where claim_id = $1
        and is_simulation = false
      order by coalesce(occurred_at, processed_at) desc
      limit 25`,
    [claimId]
  );

  if (rows.length === 0) {
    return { active: false, state: 'pending' };
  }

  const subscriptionEvent = rows.find(row => row.event_type.startsWith('subscription.'));
  if (subscriptionEvent) {
    const state = String(subscriptionEvent.status || '').toLowerCase();
    if (['canceled', 'paused', 'past_due'].includes(state)) {
      return { active: false, state };
    }
    if (['active', 'trialing'].includes(state)) {
      return { active: true, state };
    }
  }

  const completedTransaction = rows.find(
    row =>
      row.event_type === 'transaction.completed' &&
      String(row.status || '').toLowerCase() === 'completed'
  );

  if (completedTransaction) {
    return { active: true, state: 'paid' };
  }

  return { active: false, state: 'pending' };
}

async function getPalEntitlement(claimId) {
  const fastSpring = await getFastSpringEntitlement(claimId);
  if (fastSpring.active || fastSpring.state !== 'pending') {
    return { provider: 'fastspring', ...fastSpring };
  }

  const paddle = await getPaddleEntitlement(claimId);
  if (paddle.active || paddle.state !== 'pending') {
    return { provider: 'paddle', ...paddle };
  }

  return { provider: null, active: false, state: 'pending' };
}

function fastSpringApiHeaders() {
  if (!FASTSPRING_API_USERNAME || !FASTSPRING_API_PASSWORD) {
    const error = new Error('FastSpring API credentials are not configured');
    error.statusCode = 503;
    throw error;
  }

  return {
    'Authorization': 'Basic ' + Buffer.from(
      FASTSPRING_API_USERNAME + ':' + FASTSPRING_API_PASSWORD,
      'utf8'
    ).toString('base64'),
    'User-Agent': 'PracticalAutomationLab/1.0',
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

function fastSpringApiCheckoutBase() {
  const parts = FASTSPRING_CHECKOUT_PATH.split('/').map(part => part.trim()).filter(Boolean);
  if (parts.length !== 2) {
    const error = new Error('FastSpring checkout path is not configured');
    error.statusCode = 503;
    throw error;
  }

  return 'https://api.fastspring.com/v2/checkouts/' +
    parts.map(encodeURIComponent).join('/') +
    '/sessions';
}

async function parseFastSpringApiResponse(response) {
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 500) };
    }
  }

  if (!response.ok) {
    console.error(
      'PAL_FASTSPRING_API_ERROR status=' + response.status +
      ' body=' + JSON.stringify(data).slice(0, 1000)
    );
    const error = new Error('FastSpring checkout service rejected the request');
    error.statusCode = response.status >= 500 ? 502 : 400;
    throw error;
  }

  return data;
}

async function createFastSpringCheckoutSession({ claimId, plan, source }) {
  const productPath = plan === 'monthly'
    ? 'pal-pro-monthly'
    : plan === 'annual'
      ? 'pal-pro-annual'
      : '';

  if (!productPath) {
    const error = new Error('Invalid plan');
    error.statusCode = 400;
    throw error;
  }

  const base = fastSpringApiCheckoutBase();
  const headers = fastSpringApiHeaders();

  const createResponse = await fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      live: FASTSPRING_CHECKOUT_LIVE,
      orderTags: {
        pal_claim_id: claimId,
        pal_plan: plan,
        pal_source: source,
      },
    }),
  });
  const session = await parseFastSpringApiResponse(createResponse);
  const sessionId = cleanText(session?.id, 128);

  if (!sessionId) {
    const error = new Error('FastSpring did not return a checkout session');
    error.statusCode = 502;
    throw error;
  }

  const addResponse = await fetch(
    base + '/' + encodeURIComponent(sessionId) + '/cart/items',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        productPath,
        quantity: 1,
      }),
    }
  );
  await parseFastSpringApiResponse(addResponse);

  const refreshResponse = await fetch(
    base + '/' + encodeURIComponent(sessionId),
    {
      method: 'GET',
      headers: {
        'Authorization': headers.Authorization,
        'User-Agent': headers['User-Agent'],
        'Accept': 'application/json',
      },
    }
  );
  const refreshed = await parseFastSpringApiResponse(refreshResponse);
  const checkoutUrl = cleanText(
    refreshed?.checkoutUrls?.webcheckoutUrl ||
      session?.checkoutUrls?.webcheckoutUrl,
    2048
  );

  if (!/^https:\/\/[^\s]+\.onfastspring\.com\//i.test(checkoutUrl)) {
    const error = new Error('FastSpring did not return a valid checkout URL');
    error.statusCode = 502;
    throw error;
  }

  console.log(
    'PAL_FASTSPRING_SESSION created=true live=' + FASTSPRING_CHECKOUT_LIVE +
    ' plan=' + plan +
    ' source=' + source +
    ' session_id=' + sessionId
  );

  return {
    checkout_url: checkoutUrl,
    live: FASTSPRING_CHECKOUT_LIVE,
    session_id: sessionId,
  };
}

const ALLOWED_LEAD_PRODUCTS = new Set([
  'pal-catalog-check',
  'feed-auditor',
  'merchant-api',
  'hubspot-api',
  'eudr',
  'battery-passport',
  'other',
]);

const ALLOWED_LEAD_INTENTS = new Set([
  'paid-access',
  'team-license',
  'batch-validation',
  'monitoring',
  'other',
]);

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function validEmail(value) {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

async function productionMetrics(eventNames = [...ALLOWED_EVENTS]) {
  const { rows } = await pool.query(`
    select
      event_name,
      count(*)::bigint as total,
      count(*) filter (where occurred_at >= now() - interval '24 hours')::bigint as last_24h,
      min(occurred_at) as first_seen,
      max(occurred_at) as last_seen
    from pal_feed_auditor_events
    where is_test = false
    group by event_name
    order by event_name
  `);

  const metrics = Object.fromEntries(
    eventNames.map(name => [name, {
      total: 0,
      last_24h: 0,
      first_seen: null,
      last_seen: null,
    }])
  );

  for (const row of rows) {
    if (!metrics[row.event_name]) continue;
    metrics[row.event_name] = {
      total: Number(row.total),
      last_24h: Number(row.last_24h),
      first_seen: row.first_seen,
      last_seen: row.last_seen,
    };
  }

  return metrics;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'OPTIONS') {
      return sendEmpty(req, res, 204);
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      await pool.query('select 1');
      return sendJson(req, res, 200, { ok: true });
    }

    if (req.method === 'GET' && url.pathname === '/metrics/feed-auditor') {
      return sendJson(req, res, 200, {
        ok: true,
        scope: 'production_only',
        events: await productionMetrics(),
      });
    }

    if (req.method === 'GET' && url.pathname === '/metrics/merchant-migration') {
      const names = [
        'merchant_migration_started',
        'merchant_migration_completed',
        'merchant_migration_report_downloaded',
        'merchant_migration_commercial_cta_clicked',
      ];
      return sendJson(req, res, 200, {
        ok: true,
        scope: 'production_only',
        events: await productionMetrics(names),
      });
    }

    if (req.method === 'GET' && url.pathname === '/metrics/hubspot-migration') {
      const names = [
        'hubspot_migration_started',
        'hubspot_migration_completed',
        'hubspot_migration_report_downloaded',
        'hubspot_migration_commercial_cta_clicked',
      ];
      return sendJson(req, res, 200, {
        ok: true,
        scope: 'production_only',
        events: await productionMetrics(names),
      });
    }

    if (req.method === 'GET' && url.pathname === '/metrics/eudr-preflight') {
      const names = [
        'eudr_preflight_started',
        'eudr_preflight_completed',
        'eudr_preflight_report_downloaded',
        'eudr_preflight_commercial_cta_clicked',
      ];
      return sendJson(req, res, 200, {
        ok: true,
        scope: 'production_only',
        events: await productionMetrics(names),
      });
    }

    if (req.method === 'GET' && url.pathname === '/metrics/battery-passport') {
      const names = [
        'battery_passport_preflight_started',
        'battery_passport_preflight_completed',
        'battery_passport_report_downloaded',
        'battery_passport_commercial_cta_clicked',
      ];
      return sendJson(req, res, 200, {
        ok: true,
        scope: 'production_only',
        events: await productionMetrics(names),
      });
    }

    if (req.method === 'GET' && url.pathname === '/metrics/payments') {
      const { rows: totalsRows } = await pool.query(`
        with completed as (
          select 'paddle'::text as provider,
                 occurred_at,
                 currency_code,
                 amount_minor,
                 coalesce(source, 'unknown') as source
            from pal_paddle_webhook_events
           where event_type = 'transaction.completed'
             and lower(coalesce(status, '')) = 'completed'
             and is_simulation = false
          union all
          select 'fastspring'::text as provider,
                 coalesce(occurred_at, processed_at) as occurred_at,
                 currency_code,
                 amount_minor,
                 coalesce(source, 'unknown') as source
            from pal_fastspring_webhook_events
           where event_type = 'order.completed'
             and live = true
        )
        select count(*)::bigint as completed_transactions,
               min(occurred_at) as first_completed_at,
               max(occurred_at) as last_completed_at
          from completed
      `);

      const { rows: revenueRows } = await pool.query(`
        with completed as (
          select currency_code, amount_minor
            from pal_paddle_webhook_events
           where event_type = 'transaction.completed'
             and lower(coalesce(status, '')) = 'completed'
             and is_simulation = false
          union all
          select currency_code, amount_minor
            from pal_fastspring_webhook_events
           where event_type = 'order.completed'
             and live = true
        )
        select currency_code,
               coalesce(sum(amount_minor), 0)::text as gross_completed_minor
          from completed
         where currency_code is not null
           and amount_minor is not null
         group by currency_code
         order by currency_code
      `);

      const { rows: sourceRows } = await pool.query(`
        with completed as (
          select coalesce(source, 'unknown') as source
            from pal_paddle_webhook_events
           where event_type = 'transaction.completed'
             and lower(coalesce(status, '')) = 'completed'
             and is_simulation = false
          union all
          select coalesce(source, 'unknown') as source
            from pal_fastspring_webhook_events
           where event_type = 'order.completed'
             and live = true
        )
        select source, count(*)::bigint as completed_transactions
          from completed
         group by source
         order by count(*) desc, source
      `);

      const { rows: providerRows } = await pool.query(`
        with completed as (
          select 'paddle'::text as provider
            from pal_paddle_webhook_events
           where event_type = 'transaction.completed'
             and lower(coalesce(status, '')) = 'completed'
             and is_simulation = false
          union all
          select 'fastspring'::text as provider
            from pal_fastspring_webhook_events
           where event_type = 'order.completed'
             and live = true
        )
        select provider, count(*)::bigint as completed_transactions
          from completed
         group by provider
         order by provider
      `);

      const { rows: paddleSubscriptionRows } = await pool.query(`
        with latest as (
          select distinct on (subscription_id)
                 subscription_id,
                 lower(coalesce(status, '')) as status
            from pal_paddle_webhook_events
           where subscription_id is not null
             and event_type like 'subscription.%'
             and is_simulation = false
           order by subscription_id, coalesce(occurred_at, processed_at) desc, processed_at desc
        )
        select count(*) filter (where status in ('active', 'trialing'))::bigint as active_subscriptions,
               count(*) filter (where status = 'canceled')::bigint as canceled_subscriptions
          from latest
      `);

      const { rows: fastSpringSubscriptionRows } = await pool.query(`
        with latest as (
          select distinct on (subscription_id)
                 subscription_id,
                 event_type,
                 lower(coalesce(status, '')) as status
            from pal_fastspring_webhook_events
           where subscription_id is not null
             and event_type like 'subscription.%'
             and live = true
           order by subscription_id, coalesce(occurred_at, processed_at) desc, processed_at desc
        )
        select count(*) filter (
                 where event_type <> 'subscription.deactivated'
                   and status <> 'deactivated'
               )::bigint as active_subscriptions,
               count(*) filter (
                 where event_type = 'subscription.canceled'
                    or status = 'canceled'
               )::bigint as canceled_subscriptions
          from latest
      `);

      const paddleActive = Number(paddleSubscriptionRows[0].active_subscriptions);
      const paddleCanceled = Number(paddleSubscriptionRows[0].canceled_subscriptions);
      const fastSpringActive = Number(fastSpringSubscriptionRows[0].active_subscriptions);
      const fastSpringCanceled = Number(fastSpringSubscriptionRows[0].canceled_subscriptions);

      return sendJson(req, res, 200, {
        ok: true,
        scope: 'genuine_payment_events_only',
        completed_transactions: Number(totalsRows[0].completed_transactions),
        first_completed_at: totalsRows[0].first_completed_at,
        last_completed_at: totalsRows[0].last_completed_at,
        active_subscriptions: paddleActive + fastSpringActive,
        canceled_subscriptions: paddleCanceled + fastSpringCanceled,
        gross_completed_by_currency: Object.fromEntries(
          revenueRows.map(row => [row.currency_code, row.gross_completed_minor])
        ),
        completed_by_source: Object.fromEntries(
          sourceRows.map(row => [row.source, Number(row.completed_transactions)])
        ),
        completed_by_provider: Object.fromEntries(
          providerRows.map(row => [row.provider, Number(row.completed_transactions)])
        ),
        subscriptions_by_provider: {
          paddle: {
            active: paddleActive,
            canceled: paddleCanceled,
          },
          fastspring: {
            active: fastSpringActive,
            canceled: fastSpringCanceled,
          },
        },
        note: 'Gross completed transaction totals are before provider fees, refunds, chargebacks, and adjustments. Paddle simulator events and FastSpring test events are excluded.',
      });
    }

    if (req.method === 'GET' && url.pathname === '/metrics/commercial') {
      const { rows } = await pool.query(`
        select count(*)::bigint as total,
               count(*) filter (where created_at >= now() - interval '24 hours')::bigint as last_24h,
               min(created_at) as first_seen,
               max(created_at) as last_seen
        from pal_commercial_leads
      `);
      return sendJson(req, res, 200, {
        ok: true,
        scope: 'production_only',
        leads: {
          total: Number(rows[0].total),
          last_24h: Number(rows[0].last_24h),
          first_seen: rows[0].first_seen,
          last_seen: rows[0].last_seen,
        },
      });
    }

    if (req.method === 'GET' && url.pathname === '/entitlement') {
      if (req.headers.origin !== SITE_ORIGIN) {
        return sendJson(req, res, 403, { ok: false, error: 'Origin not allowed' });
      }

      const claimId = cleanText(url.searchParams.get('claim'), 128);
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(claimId)) {
        return sendJson(req, res, 400, { ok: false, error: 'Invalid claim' });
      }

      const entitlement = await getPalEntitlement(claimId);
      return sendJson(req, res, 200, { ok: true, ...entitlement });
    }

    if (req.method === 'GET' && url.pathname === '/fastspring/entitlement') {
      if (req.headers.origin !== SITE_ORIGIN) {
        return sendJson(req, res, 403, { ok: false, error: 'Origin not allowed' });
      }

      const claimId = cleanText(url.searchParams.get('claim'), 128);
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(claimId)) {
        return sendJson(req, res, 400, { ok: false, error: 'Invalid claim' });
      }

      const entitlement = await getFastSpringEntitlement(claimId);
      return sendJson(req, res, 200, { ok: true, provider: 'fastspring', ...entitlement });
    }

    if (req.method === 'GET' && url.pathname === '/paddle/entitlement') {
      if (req.headers.origin !== SITE_ORIGIN) {
        return sendJson(req, res, 403, { ok: false, error: 'Origin not allowed' });
      }

      const claimId = cleanText(url.searchParams.get('claim'), 128);
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(claimId)) {
        return sendJson(req, res, 400, { ok: false, error: 'Invalid claim' });
      }

      const entitlement = await getPaddleEntitlement(claimId);
      return sendJson(req, res, 200, { ok: true, ...entitlement });
    }

    if (req.method === 'GET' && url.pathname === '/measurement-probe') {
      const eventName = url.searchParams.get('event') || 'audit_started';
      await insertEvent(eventName, true);
      return sendJson(req, res, 200, {
        ok: true,
        test: true,
        event: eventName,
        note: 'Synthetic measurement probe; excluded from production metrics.',
      });
    }

    if (req.method === 'POST' && url.pathname === '/fastspring/checkout-session') {
      if (req.headers.origin !== SITE_ORIGIN) {
        return sendJson(req, res, 403, { ok: false, error: 'Origin not allowed' });
      }

      const body = await readJsonBody(req, 4096);
      const claimId = cleanText(body.claim_id, 128);
      const plan = cleanText(body.plan, 32).toLowerCase();
      const rawSource = cleanText(body.source, 64);
      const source = /^[a-zA-Z0-9_-]{1,64}$/.test(rawSource) ? rawSource : 'direct';

      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(claimId)) {
        return sendJson(req, res, 400, { ok: false, error: 'Invalid claim' });
      }
      if (!['monthly', 'annual'].includes(plan)) {
        return sendJson(req, res, 400, { ok: false, error: 'Invalid plan' });
      }

      const session = await createFastSpringCheckoutSession({
        claimId,
        plan,
        source,
      });

      return sendJson(req, res, 201, {
        ok: true,
        provider: 'fastspring',
        ...session,
      });
    }

    if (req.method === 'POST' && url.pathname === '/fastspring/webhook') {
      const rawBody = await readRawBody(req);
      verifyFastSpringSignature(rawBody, req.headers['x-fs-signature']);

      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        const error = new Error('Invalid JSON');
        error.statusCode = 400;
        throw error;
      }

      const events = Array.isArray(payload?.events) ? payload.events : [];
      if (events.length === 0 || events.length > 100) {
        const error = new Error('Invalid FastSpring event batch');
        error.statusCode = 400;
        throw error;
      }

      for (const event of events) {
        await recordFastSpringEvent(event);
      }

      return sendJson(req, res, 200, { received: true, events: events.length });
    }

    if (req.method === 'POST' && url.pathname === '/paddle/webhook') {
      const rawBody = await readRawBody(req);
      verifyPaddleSignature(rawBody, req.headers['paddle-signature']);

      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        const error = new Error('Invalid JSON');
        error.statusCode = 400;
        throw error;
      }

      await recordPaddleEvent(event);
      return sendJson(req, res, 200, { received: true });
    }

    if (req.method === 'POST' && url.pathname === '/commercial-interest') {
      if (req.headers.origin !== SITE_ORIGIN) {
        return sendJson(req, res, 403, { ok: false, error: 'Origin not allowed' });
      }

      const body = await readJsonBody(req);

      if (cleanText(body.website, 120)) {
        return sendEmpty(req, res, 204);
      }

      const email = cleanText(body.email, 254).toLowerCase();
      const company = cleanText(body.company, 160);
      const product = cleanText(body.product, 64);
      const intent = cleanText(body.intent, 64);
      const message = cleanText(body.message, 1000);
      const consent = body.consent === true;

      if (!validEmail(email)) {
        return sendJson(req, res, 400, { ok: false, error: 'Enter a valid email address.' });
      }
      if (!ALLOWED_LEAD_PRODUCTS.has(product)) {
        return sendJson(req, res, 400, { ok: false, error: 'Choose a valid product.' });
      }
      if (!ALLOWED_LEAD_INTENTS.has(intent)) {
        return sendJson(req, res, 400, { ok: false, error: 'Choose a valid commercial need.' });
      }
      if (!consent) {
        return sendJson(req, res, 400, { ok: false, error: 'Consent is required.' });
      }

      await pool.query(
        `insert into pal_commercial_leads
          (email, company, product, intent, message, consent)
         values ($1, $2, $3, $4, $5, true)`,
        [email, company || null, product, intent, message || null]
      );

      await insertEvent('commercial_lead_submitted', false);
      return sendJson(req, res, 201, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/event') {
      if (req.headers.origin !== SITE_ORIGIN) {
        return sendJson(req, res, 403, { ok: false, error: 'Origin not allowed' });
      }
      const eventName = await readSmallTextBody(req);
      await insertEvent(eventName, false);
      return sendEmpty(req, res, 204);
    }

    return sendJson(req, res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    const status = Number(error.statusCode || 500);
    return sendJson(req, res, status, {
      ok: false,
      error: status >= 500 ? 'Internal server error' : error.message,
    });
  }
});

initialize()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Feed-auditor event collector listening on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error('Collector initialization failed:', error.message);
    process.exit(1);
  });

async function shutdown(signal) {
  console.log(`${signal} received, shutting down.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
