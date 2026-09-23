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

const PAL_CHECKOUT_PROVIDER = String(process.env.PAL_CHECKOUT_PROVIDER || 'auto').trim().toLowerCase();

const CREEM_API_KEY = process.env.CREEM_API_KEY || '';
const CREEM_WEBHOOK_SECRET = process.env.CREEM_WEBHOOK_SECRET || '';
const CREEM_PRODUCT_ID_MONTHLY = process.env.CREEM_PRODUCT_ID_MONTHLY || '';
const CREEM_PRODUCT_ID_ANNUAL = process.env.CREEM_PRODUCT_ID_ANNUAL || '';
const CREEM_TEST_API_KEY = process.env.CREEM_TEST_API_KEY || '';
const CREEM_TEST_WEBHOOK_SECRET = process.env.CREEM_TEST_WEBHOOK_SECRET || '';
const CREEM_TEST_PRODUCT_ID_MONTHLY = process.env.CREEM_TEST_PRODUCT_ID_MONTHLY || '';
const CREEM_TEST_PRODUCT_ID_ANNUAL = process.env.CREEM_TEST_PRODUCT_ID_ANNUAL || '';
const CREEM_CHECKOUT_LIVE = String(process.env.CREEM_CHECKOUT_LIVE || 'false').toLowerCase() === 'true';

const PAYPRO_VALIDATION_KEY = process.env.PAYPRO_VALIDATION_KEY || '';
const PAYPRO_PRODUCT_ID_MONTHLY = process.env.PAYPRO_PRODUCT_ID_MONTHLY || '';
const PAYPRO_PRODUCT_ID_ANNUAL = process.env.PAYPRO_PRODUCT_ID_ANNUAL || '';
const PAYPRO_CHECKOUT_LIVE = String(process.env.PAYPRO_CHECKOUT_LIVE || 'false').toLowerCase() === 'true';

const MONTYPAY_CHECKOUT_URL = process.env.MONTYPAY_CHECKOUT_URL || '';
const MONTYPAY_MERCHANT_KEY = process.env.MONTYPAY_MERCHANT_KEY || '';
const MONTYPAY_PASSWORD = process.env.MONTYPAY_PASSWORD || '';
const MONTYPAY_SCHEDULE_ID_MONTHLY = process.env.MONTYPAY_SCHEDULE_ID_MONTHLY || '';
const MONTYPAY_SCHEDULE_ID_ANNUAL = process.env.MONTYPAY_SCHEDULE_ID_ANNUAL || '';
const MONTYPAY_CURRENCY = String(process.env.MONTYPAY_CURRENCY || 'USD').trim().toUpperCase();
const MONTYPAY_HASH_DIGEST = String(process.env.MONTYPAY_HASH_DIGEST || 'md5').trim().toLowerCase();
const MONTYPAY_CHECKOUT_LIVE = String(process.env.MONTYPAY_CHECKOUT_LIVE || 'false').toLowerCase() === 'true';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY || '';
const STRIPE_PRICE_ID_ANNUAL = process.env.STRIPE_PRICE_ID_ANNUAL || '';
const STRIPE_CHECKOUT_LIVE = String(process.env.STRIPE_CHECKOUT_LIVE || 'false').toLowerCase() === 'true';

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
  'checkout_started',
  'checkout_unavailable',
  'checkout_redirected',
  'pal_home_viewed',
  'pal_home_shopify_clicked',
  'pal_shopify_landing_viewed',
  'pal_shopify_landing_clicked',
  'pal_gtin_guide_viewed',
  'pal_gtin_guide_clicked',
  'pal_missing_products_guide_viewed',
  'pal_missing_products_guide_clicked',
  'pal_pricing_viewed',
  'pal_pricing_shopify_clicked',
  'pal_feed_auditor_shopify_clicked',
  'pal_image_readiness_shopify_clicked',
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
        'commercial_lead_submitted',
        'checkout_started',
        'checkout_unavailable',
        'checkout_redirected',
        'pal_home_viewed',
        'pal_home_shopify_clicked',
        'pal_shopify_landing_viewed',
        'pal_shopify_landing_clicked',
        'pal_gtin_guide_viewed',
        'pal_gtin_guide_clicked',
        'pal_missing_products_guide_viewed',
        'pal_missing_products_guide_clicked',
        'pal_pricing_viewed',
        'pal_pricing_shopify_clicked',
        'pal_feed_auditor_shopify_clicked',
        'pal_image_readiness_shopify_clicked'
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

  await pool.query(`
    create table if not exists pal_creem_webhook_events (
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
      access_until timestamptz,
      processed_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    alter table pal_creem_webhook_events
      add column if not exists access_until timestamptz
  `);

  await pool.query(`
    create index if not exists pal_creem_webhook_events_processed_at_idx
      on pal_creem_webhook_events (processed_at desc)
  `);

  await pool.query(`
    create index if not exists pal_creem_webhook_events_claim_id_idx
      on pal_creem_webhook_events (claim_id, occurred_at desc)
      where claim_id is not null
  `);

  await pool.query(`
    create table if not exists pal_paypro_webhook_events (
      event_id text primary key,
      event_type text not null,
      test_mode boolean not null default true,
      occurred_at timestamptz,
      order_id text,
      subscription_id text,
      status text,
      claim_id text,
      plan text,
      source text,
      currency_code text,
      amount_minor bigint,
      access_until timestamptz,
      processed_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    alter table pal_paypro_webhook_events
      add column if not exists access_until timestamptz
  `);

  await pool.query(`
    create index if not exists pal_paypro_webhook_events_processed_at_idx
      on pal_paypro_webhook_events (processed_at desc)
  `);

  await pool.query(`
    create index if not exists pal_paypro_webhook_events_claim_id_idx
      on pal_paypro_webhook_events (claim_id, occurred_at desc)
      where claim_id is not null
  `);

  await pool.query(`
    create table if not exists pal_montypay_checkout_sessions (
      order_number text primary key,
      claim_id text not null,
      plan text not null,
      source text not null,
      live boolean not null default false,
      amount_minor bigint not null,
      currency_code text not null,
      created_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create index if not exists pal_montypay_checkout_sessions_claim_idx
      on pal_montypay_checkout_sessions (claim_id, created_at desc)
  `);

  await pool.query(`
    create table if not exists pal_montypay_webhook_events (
      event_id text primary key,
      payment_id text,
      event_type text not null,
      event_status text,
      order_status text,
      live boolean not null default false,
      order_number text,
      transaction_id text,
      recurring_init_trans_id text,
      recurring_token text,
      schedule_id text,
      auto_renew boolean not null default false,
      claim_id text,
      plan text,
      source text,
      currency_code text,
      amount_minor bigint,
      access_until timestamptz,
      processed_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create index if not exists pal_montypay_webhook_events_claim_idx
      on pal_montypay_webhook_events (claim_id, processed_at desc)
      where claim_id is not null
  `);

  await pool.query(`
    create index if not exists pal_montypay_webhook_events_recurring_idx
      on pal_montypay_webhook_events (recurring_init_trans_id, recurring_token)
      where recurring_init_trans_id is not null or recurring_token is not null
  `);

  await pool.query(`
    create table if not exists pal_stripe_webhook_events (
      event_id text primary key,
      event_type text not null,
      live boolean not null default false,
      occurred_at timestamptz,
      checkout_session_id text,
      customer_id text,
      subscription_id text,
      invoice_id text,
      status text,
      claim_id text,
      plan text,
      source text,
      currency_code text,
      amount_minor bigint,
      access_until timestamptz,
      processed_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    create index if not exists pal_stripe_webhook_events_claim_idx
      on pal_stripe_webhook_events (claim_id, processed_at desc)
      where claim_id is not null
  `);

  await pool.query(`
    create index if not exists pal_stripe_webhook_events_subscription_idx
      on pal_stripe_webhook_events (subscription_id, processed_at desc)
      where subscription_id is not null
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
  const stripe = await getStripeEntitlement(claimId);
  if (stripe.active || stripe.state !== 'pending') {
    return { provider: 'stripe', ...stripe };
  }

  const montypay = await getMontyPayEntitlement(claimId);
  if (montypay.active || montypay.state !== 'pending') {
    return { provider: 'montypay', ...montypay };
  }

  const creem = await getCreemEntitlement(claimId);
  if (creem.active || creem.state !== 'pending') {
    return { provider: 'creem', ...creem };
  }

  const paypro = await getPayProEntitlement(claimId);
  if (paypro.active || paypro.state !== 'pending') {
    return { provider: 'paypro', ...paypro };
  }

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

async function createFastSpringCheckoutSession({ claimId, plan, source, live }) {
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
      live: Boolean(live),
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
    'PAL_FASTSPRING_SESSION created=true live=' + Boolean(live) +
    ' plan=' + plan +
    ' source=' + source +
    ' session_id=' + sessionId
  );

  return {
    checkout_url: checkoutUrl,
    live: Boolean(live),
    session_id: sessionId,
  };
}


function verifyCreemSignature(rawBody, signatureHeader, secret) {
  if (!secret) {
    const error = new Error('Creem webhook secret is not configured');
    error.statusCode = 503;
    throw error;
  }
  if (!signatureHeader || !rawBody) {
    const error = new Error('Missing Creem signature or body');
    error.statusCode = 400;
    throw error;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const received = String(signatureHeader).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(received)) {
    const error = new Error('Invalid Creem signature');
    error.statusCode = 401;
    throw error;
  }
  const receivedBuffer = Buffer.from(received, 'utf8');
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    const error = new Error('Invalid Creem signature');
    error.statusCode = 401;
    throw error;
  }
}

function creemExplicitMode(object) {
  return cleanText(
    object?.mode ||
      object?.order?.mode ||
      object?.product?.mode ||
      object?.subscription?.mode,
    32
  ).toLowerCase();
}

function creemModeIsLive(object) {
  const mode = creemExplicitMode(object);
  if (!mode) return null;
  return mode === 'prod' || mode === 'production' || mode === 'live';
}

function creemAmountMinor(object) {
  const candidates = [
    object?.order?.amount,
    object?.order?.amount_paid,
    object?.transaction?.amount,
    object?.product?.price,
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isSafeInteger(number) && number >= 0) return String(number);
  }
  return null;
}

function isoDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isFutureIso(value) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > Date.now();
}

async function recordCreemEvent(event, forcedLive = null) {
  const eventId = cleanText(event?.id, 128);
  const eventType = cleanText(event?.eventType, 128);
  const object = event && typeof event.object === 'object' && event.object ? event.object : {};
  if (!eventId || !eventType) {
    const error = new Error('Invalid Creem event');
    error.statusCode = 400;
    throw error;
  }

  const detectedLive = creemModeIsLive(object);
  if (typeof forcedLive === 'boolean' && detectedLive !== null && detectedLive !== forcedLive) {
    const error = new Error('Creem environment mismatch');
    error.statusCode = 400;
    throw error;
  }
  const live = typeof forcedLive === 'boolean' ? forcedLive : detectedLive === true;

  const occurredAtNumber = Number(event?.created_at);
  const occurredAt = Number.isFinite(occurredAtNumber) && occurredAtNumber > 0
    ? new Date(occurredAtNumber < 100000000000 ? occurredAtNumber * 1000 : occurredAtNumber).toISOString()
    : null;

  const metadataCandidates = [
    object?.metadata,
    object?.subscription?.metadata,
    object?.order?.metadata,
  ];
  let metadata = {};
  for (const candidate of metadataCandidates) {
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      metadata = candidate;
      break;
    }
  }

  const orderId = cleanText(object?.order?.id || object?.order, 128);
  const subscriptionId = cleanText(
    eventType.startsWith('subscription.')
      ? object?.id || object?.subscription
      : object?.subscription?.id || object?.subscription,
    128
  );

  let claimId = cleanText(metadata.pal_claim_id, 128);
  let plan = cleanText(metadata.pal_plan, 32);
  let source = cleanText(metadata.pal_source, 64);

  // Refund/dispute/subscription lifecycle payloads may omit checkout metadata.
  // Re-link them to the original signed event by subscription/order ID only.
  if ((!claimId || !plan || !source) && (subscriptionId || orderId)) {
    const { rows } = await pool.query(
      `select claim_id, plan, source
         from pal_creem_webhook_events
        where live = $1
          and claim_id is not null
          and (($2::text is not null and subscription_id = $2)
            or ($3::text is not null and order_id = $3))
        order by coalesce(occurred_at, processed_at) desc, processed_at desc
        limit 1`,
      [live, subscriptionId || null, orderId || null]
    );
    if (rows[0]) {
      claimId = claimId || cleanText(rows[0].claim_id, 128);
      plan = plan || cleanText(rows[0].plan, 32);
      source = source || cleanText(rows[0].source, 64);
    }
  }

  const status = cleanText(object?.status || object?.order?.status, 64).toLowerCase();
  const currencyCode = cleanText(
    object?.order?.currency ||
      object?.transaction?.currency ||
      object?.product?.currency,
    3
  ).toUpperCase();
  const amountMinor = creemAmountMinor(object);
  const accessUntil = isoDateOrNull(
    object?.current_period_end_date ||
      object?.subscription?.current_period_end_date
  );

  await pool.query(
    `insert into pal_creem_webhook_events
      (event_id, event_type, live, occurred_at, order_id, subscription_id, status, claim_id, plan, source, currency_code, amount_minor, access_until)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
      accessUntil,
    ]
  );

  console.log(
    `PAL_CREEM_WEBHOOK event_id=${eventId} event_type=${eventType} live=${live} order_id=${orderId || '-'} subscription_id=${subscriptionId || '-'}`
  );
}

async function getCreemEntitlement(claimId) {
  const { rows } = await pool.query(
    `select event_type, status, access_until, occurred_at, processed_at
       from pal_creem_webhook_events
      where claim_id = $1
        and live = true
      order by coalesce(occurred_at, processed_at) desc, processed_at desc
      limit 50`,
    [claimId]
  );
  if (rows.length === 0) return { active: false, state: 'pending' };

  const latest = rows[0];
  if (['refund.created', 'dispute.created', 'subscription.paused'].includes(latest.event_type)) {
    return { active: false, state: latest.event_type.split('.')[1] };
  }

  if (latest.event_type === 'subscription.canceled') {
    if (isFutureIso(latest.access_until)) {
      return { active: true, state: 'canceled_until_period_end' };
    }
    return { active: false, state: 'canceled' };
  }

  // Creem documents subscription.expired as retryable; do not revoke early
  // while the already-paid access period is still open.
  if (latest.event_type === 'subscription.expired') {
    if (isFutureIso(latest.access_until)) {
      return { active: true, state: 'payment_retry' };
    }
    return { active: false, state: 'expired' };
  }

  if (
    ['checkout.completed', 'subscription.active', 'subscription.paid'].includes(latest.event_type) &&
    !['canceled', 'paused', 'unpaid'].includes(String(latest.status || '').toLowerCase())
  ) {
    return { active: true, state: latest.event_type === 'checkout.completed' ? 'paid' : 'active' };
  }

  const paid = rows.find(row =>
    ['checkout.completed', 'subscription.active', 'subscription.paid'].includes(row.event_type)
  );
  if (!paid) return { active: false, state: 'pending' };

  // Unknown synchronization/update events should not erase a prior paid state.
  return { active: true, state: 'active' };
}

function creemConfigured(live = CREEM_CHECKOUT_LIVE) {
  if (live) {
    return Boolean(
      CREEM_API_KEY &&
      CREEM_WEBHOOK_SECRET &&
      CREEM_PRODUCT_ID_MONTHLY &&
      CREEM_PRODUCT_ID_ANNUAL &&
      CREEM_CHECKOUT_LIVE
    );
  }

  return Boolean(
    CREEM_TEST_API_KEY &&
    CREEM_TEST_WEBHOOK_SECRET &&
    CREEM_TEST_PRODUCT_ID_MONTHLY &&
    CREEM_TEST_PRODUCT_ID_ANNUAL
  );
}

async function createCreemCheckoutSession({ claimId, plan, source, live }) {
  const apiKey = live ? CREEM_API_KEY : CREEM_TEST_API_KEY;
  const productId = plan === 'monthly'
    ? (live ? CREEM_PRODUCT_ID_MONTHLY : CREEM_TEST_PRODUCT_ID_MONTHLY)
    : plan === 'annual'
      ? (live ? CREEM_PRODUCT_ID_ANNUAL : CREEM_TEST_PRODUCT_ID_ANNUAL)
      : '';

  if (!apiKey) {
    const error = new Error('Creem API key is not configured for this environment');
    error.statusCode = 503;
    throw error;
  }
  if (!productId) {
    const error = new Error('Creem product is not configured for this environment');
    error.statusCode = 503;
    throw error;
  }
  if (live && !CREEM_CHECKOUT_LIVE) {
    const error = new Error('Creem live checkout is not enabled');
    error.statusCode = 503;
    throw error;
  }

  const apiBase = live ? 'https://api.creem.io' : 'https://test-api.creem.io';
  const response = await fetch(apiBase + '/v1/checkouts', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'PracticalAutomationLab/1.0',
    },
    body: JSON.stringify({
      product_id: productId,
      request_id: claimId,
      success_url: SITE_ORIGIN + '/checkout-success.html',
      metadata: {
        pal_claim_id: claimId,
        pal_plan: plan,
        pal_source: source,
      },
    }),
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) {
    console.error('PAL_CREEM_API_ERROR status=' + response.status + ' body=' + text.slice(0, 1000));
    const error = new Error('Creem checkout service rejected the request');
    error.statusCode = response.status >= 500 ? 502 : 400;
    throw error;
  }

  const checkoutUrl = cleanText(data?.checkout_url, 2048);
  if (!/^https:\/\/[^\s]+\.creem\.io\//i.test(checkoutUrl)) {
    const error = new Error('Creem did not return a valid checkout URL');
    error.statusCode = 502;
    throw error;
  }

  return {
    checkout_url: checkoutUrl,
    live: Boolean(live),
    session_id: cleanText(data?.id, 128) || null,
  };
}

function parsePayProCustomFields(raw) {
  const fields = {};
  const text = cleanText(raw, 4096);
  if (!text) return fields;
  for (const part of text.split(/[,&]/)) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const key = part.slice(0, index).trim().replace(/^x-/i, '');
    const value = part.slice(index + 1).trim();
    if (key) fields[key] = value;
  }
  return fields;
}

function payProTestMode(value) {
  return ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function verifyPayProSignature(params) {
  if (!PAYPRO_VALIDATION_KEY) {
    const error = new Error('PayPro Global validation key is not configured');
    error.statusCode = 503;
    throw error;
  }

  const signature = cleanText(params.get('SIGNATURE'), 256).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(signature)) {
    const error = new Error('Invalid PayPro Global signature');
    error.statusCode = 401;
    throw error;
  }

  const signedValue =
    String(params.get('ORDER_ID') || '') +
    String(params.get('ORDER_STATUS') || '') +
    String(params.get('ORDER_TOTAL_AMOUNT') || '') +
    String(params.get('CUSTOMER_EMAIL') || '') +
    PAYPRO_VALIDATION_KEY +
    String(params.get('TEST_MODE') || '') +
    String(params.get('IPN_TYPE_NAME') || '');

  const expected = crypto.createHash('sha256').update(signedValue, 'utf8').digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signature, 'utf8');
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    const error = new Error('Invalid PayPro Global signature');
    error.statusCode = 401;
    throw error;
  }
}

function decimalAmountToMinor(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return String(Math.round(number * 100));
}

async function recordPayProEvent(rawBody, params) {
  const eventType = cleanText(params.get('IPN_TYPE_NAME'), 128);
  const orderId = cleanText(params.get('ORDER_ID'), 128);
  if (!eventType || !orderId) {
    const error = new Error('Invalid PayPro Global event');
    error.statusCode = 400;
    throw error;
  }

  const subscriptionId = cleanText(params.get('SUBSCRIPTION_ID'), 128);
  const eventFingerprint = [
    eventType,
    orderId,
    subscriptionId,
    cleanText(params.get('ORDER_STATUS'), 64),
    cleanText(params.get('SUBSCRIPTION_STATUS_NAME'), 64),
    cleanText(params.get('SUBSCRIPTION_NEXT_CHARGE_DATE'), 80),
    cleanText(params.get('ORDER_TOTAL_AMOUNT'), 64),
    cleanText(params.get('TEST_MODE'), 8),
  ].join('|');
  const eventId = crypto.createHash('sha256').update(eventFingerprint, 'utf8').digest('hex');

  const testMode = payProTestMode(params.get('TEST_MODE'));
  const customFields = parsePayProCustomFields(params.get('ORDER_CUSTOM_FIELDS'));
  let claimId = cleanText(customFields.pal_claim_id, 128);
  let plan = cleanText(customFields.pal_plan, 32);
  let source = cleanText(customFields.pal_source, 64);

  if ((!claimId || !plan || !source) && subscriptionId) {
    const { rows } = await pool.query(
      `select claim_id, plan, source
         from pal_paypro_webhook_events
        where subscription_id = $1
          and test_mode = $2
          and claim_id is not null
        order by coalesce(occurred_at, processed_at) desc, processed_at desc
        limit 1`,
      [subscriptionId, testMode]
    );
    if (rows[0]) {
      claimId = claimId || cleanText(rows[0].claim_id, 128);
      plan = plan || cleanText(rows[0].plan, 32);
      source = source || cleanText(rows[0].source, 64);
    }
  }

  const subscriptionStatus = cleanText(params.get('SUBSCRIPTION_STATUS_NAME'), 64).toLowerCase();
  const orderStatus = cleanText(params.get('ORDER_STATUS'), 64).toLowerCase();
  const status = subscriptionStatus || orderStatus;
  const currencyCode = cleanText(
    params.get('ORDER_CURRENCY_CODE') || params.get('SUBSCRIPTION_NEXT_CHARGE_CURRENCY_CODE'),
    3
  ).toUpperCase();
  const amountMinor = decimalAmountToMinor(params.get('ORDER_TOTAL_AMOUNT'));
  const accessUntil = isoDateOrNull(params.get('SUBSCRIPTION_NEXT_CHARGE_DATE'));

  let occurredAt = null;
  const placedUtc = cleanText(params.get('ORDER_PLACED_TIME_UTC'), 80);
  if (placedUtc) {
    const date = new Date(placedUtc);
    if (!Number.isNaN(date.getTime())) occurredAt = date.toISOString();
  }

  await pool.query(
    `insert into pal_paypro_webhook_events
      (event_id, event_type, test_mode, occurred_at, order_id, subscription_id, status, claim_id, plan, source, currency_code, amount_minor, access_until)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (event_id) do nothing`,
    [
      eventId,
      eventType,
      testMode,
      occurredAt,
      orderId,
      subscriptionId || null,
      status || null,
      claimId || null,
      plan || null,
      source || null,
      currencyCode || null,
      amountMinor,
      accessUntil,
    ]
  );

  console.log(
    `PAL_PAYPRO_WEBHOOK event_id=${eventId} event_type=${eventType} test=${testMode} order_id=${orderId} subscription_id=${subscriptionId || '-'}`
  );
}

async function getPayProEntitlement(claimId) {
  const { rows } = await pool.query(
    `select event_type, status, access_until, occurred_at, processed_at
       from pal_paypro_webhook_events
      where claim_id = $1
        and test_mode = false
      order by coalesce(occurred_at, processed_at) desc, processed_at desc
      limit 50`,
    [claimId]
  );
  if (rows.length === 0) return { active: false, state: 'pending' };

  const latest = rows[0];

  if (['OrderRefunded', 'OrderChargedBack', 'SubscriptionFinished'].includes(latest.event_type)) {
    return { active: false, state: latest.event_type.toLowerCase() };
  }

  if (['SubscriptionSuspended', 'SubscriptionTerminated'].includes(latest.event_type)) {
    if (isFutureIso(latest.access_until)) {
      return { active: true, state: 'canceled_until_period_end' };
    }
    return { active: false, state: latest.event_type.toLowerCase() };
  }

  if (latest.event_type === 'SubscriptionChargeFailed') {
    if (latest.status === 'active' && isFutureIso(latest.access_until)) {
      return { active: true, state: 'payment_retry' };
    }
    return { active: false, state: 'payment_failed' };
  }

  if (['OrderCharged', 'SubscriptionChargeSucceed', 'OrderChargedBackWon'].includes(latest.event_type)) {
    return { active: true, state: latest.event_type === 'OrderCharged' ? 'paid' : 'active' };
  }

  // SubscriptionRenewed is a lifecycle event, not proof of a successful charge.
  // Keep only already-paid access that has not expired.
  const paid = rows.find(row =>
    ['OrderCharged', 'SubscriptionChargeSucceed', 'OrderChargedBackWon'].includes(row.event_type)
  );
  if (!paid) return { active: false, state: 'pending' };
  if (!paid.access_until || isFutureIso(paid.access_until)) {
    return { active: true, state: 'active' };
  }

  return { active: false, state: 'expired' };
}

function payProConfigured() {
  return Boolean(
    PAYPRO_VALIDATION_KEY &&
    PAYPRO_PRODUCT_ID_MONTHLY &&
    PAYPRO_PRODUCT_ID_ANNUAL &&
    PAYPRO_CHECKOUT_LIVE
  );
}

function fastSpringConfigured() {
  return Boolean(
    FASTSPRING_WEBHOOK_SECRET &&
    FASTSPRING_API_USERNAME &&
    FASTSPRING_API_PASSWORD &&
    FASTSPRING_CHECKOUT_PATH &&
    FASTSPRING_CHECKOUT_LIVE
  );
}

async function createPayProCheckoutSession({ claimId, plan, source, live }) {
  const productId = plan === 'monthly'
    ? PAYPRO_PRODUCT_ID_MONTHLY
    : plan === 'annual'
      ? PAYPRO_PRODUCT_ID_ANNUAL
      : '';
  if (!productId || !live || !PAYPRO_CHECKOUT_LIVE) {
    const error = new Error('PayPro Global checkout is not configured for live orders');
    error.statusCode = 503;
    throw error;
  }

  const checkout = new URL('https://store.payproglobal.com/checkout');
  checkout.searchParams.set('products[1][ID]', productId);
  checkout.searchParams.set('x-pal_claim_id', claimId);
  checkout.searchParams.set('x-pal_plan', plan);
  checkout.searchParams.set('x-pal_source', source);

  return {
    checkout_url: checkout.toString(),
    live: true,
    session_id: null,
  };
}



function stripeConfigured(requireLive = true) {
  const keyTypeOk = STRIPE_CHECKOUT_LIVE
    ? STRIPE_SECRET_KEY.startsWith('sk_live_')
    : STRIPE_SECRET_KEY.startsWith('sk_test_');
  const base = Boolean(
    keyTypeOk &&
    STRIPE_WEBHOOK_SECRET.startsWith('whsec_') &&
    STRIPE_PRICE_ID_MONTHLY.startsWith('price_') &&
    STRIPE_PRICE_ID_ANNUAL.startsWith('price_')
  );
  if (!base) return false;
  return requireLive ? STRIPE_CHECKOUT_LIVE : true;
}

function stripePlanPrice(plan) {
  if (plan === 'monthly') return STRIPE_PRICE_ID_MONTHLY;
  if (plan === 'annual') return STRIPE_PRICE_ID_ANNUAL;
  return '';
}

async function stripeApi(pathname, body) {
  if (!STRIPE_SECRET_KEY) {
    const error = new Error('Stripe API key is not configured');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch('https://api.stripe.com' + pathname, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PracticalAutomationLab/1.0',
    },
    body: body instanceof URLSearchParams ? body.toString() : String(body || ''),
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}

  if (!response.ok) {
    console.error(
      'PAL_STRIPE_API_ERROR status=' + response.status +
      ' type=' + cleanText(data?.error?.type, 80) +
      ' code=' + cleanText(data?.error?.code, 80)
    );
    const error = new Error('Stripe checkout service rejected the request');
    error.statusCode = response.status >= 500 ? 502 : 400;
    throw error;
  }

  return data;
}

async function createStripeCheckoutSession({ claimId, plan, source, live }) {
  if (!stripeConfigured(false)) {
    const error = new Error('Stripe checkout is not fully configured');
    error.statusCode = 503;
    throw error;
  }
  if (Boolean(live) !== STRIPE_CHECKOUT_LIVE) {
    const error = new Error('Stripe environment does not match requested checkout mode');
    error.statusCode = 503;
    throw error;
  }

  const priceId = stripePlanPrice(plan);
  if (!priceId) {
    const error = new Error('Invalid plan');
    error.statusCode = 400;
    throw error;
  }

  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('success_url', SITE_ORIGIN + '/checkout-success.html?session_id={CHECKOUT_SESSION_ID}');
  params.set('cancel_url', SITE_ORIGIN + '/pricing.html?checkout=cancelled');
  params.set('client_reference_id', claimId);
  params.set('line_items[0][price]', priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('metadata[pal_claim_id]', claimId);
  params.set('metadata[pal_plan]', plan);
  params.set('metadata[pal_source]', source);
  params.set('subscription_data[metadata][pal_claim_id]', claimId);
  params.set('subscription_data[metadata][pal_plan]', plan);
  params.set('subscription_data[metadata][pal_source]', source);
  params.set('allow_promotion_codes', 'false');

  const session = await stripeApi('/v1/checkout/sessions', params);
  const checkoutUrl = cleanText(session?.url, 2048);
  const sessionId = cleanText(session?.id, 255);
  if (!checkoutUrl || !sessionId || !checkoutUrl.startsWith('https://')) {
    const error = new Error('Stripe did not return a valid hosted checkout session');
    error.statusCode = 502;
    throw error;
  }

  console.log(
    'PAL_STRIPE_SESSION created=true live=' + Boolean(live) +
    ' plan=' + plan +
    ' source=' + source +
    ' session_id=' + sessionId
  );

  return {
    checkout_url: checkoutUrl,
    live: Boolean(live),
    session_id: sessionId,
  };
}

function verifyStripeSignature(rawBody, header) {
  if (!STRIPE_WEBHOOK_SECRET) {
    const error = new Error('Stripe webhook secret is not configured');
    error.statusCode = 503;
    throw error;
  }
  if (!header || !rawBody) {
    const error = new Error('Missing Stripe signature or body');
    error.statusCode = 400;
    throw error;
  }

  let timestamp = '';
  const signatures = [];
  for (const item of String(header).split(',')) {
    const index = item.indexOf('=');
    if (index < 1) continue;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (key === 't') timestamp = value;
    if (key === 'v1' && value) signatures.push(value);
  }

  const seconds = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!/^\d+$/.test(timestamp) || !Number.isSafeInteger(seconds) || Math.abs(now - seconds) > 300) {
    const error = new Error('Expired or invalid Stripe webhook timestamp');
    error.statusCode = 408;
    throw error;
  }
  if (signatures.length === 0) {
    const error = new Error('Missing Stripe v1 signature');
    error.statusCode = 400;
    throw error;
  }

  const expected = crypto
    .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(timestamp + '.' + rawBody, 'utf8')
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const valid = signatures.some(candidate => {
    const candidateBuffer = Buffer.from(candidate, 'utf8');
    return candidateBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
  });
  if (!valid) {
    const error = new Error('Invalid Stripe webhook signature');
    error.statusCode = 401;
    throw error;
  }
}

function stripeUnixToIso(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const date = new Date(number * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stripeInvoiceAccessUntil(invoice) {
  const lines = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
  const ends = lines
    .map(line => Number(line?.period?.end))
    .filter(value => Number.isFinite(value) && value > 0);
  if (ends.length === 0) return null;
  return stripeUnixToIso(Math.max(...ends));
}

async function stripeClaimContext(subscriptionId, customerId) {
  if (!subscriptionId && !customerId) return null;
  const { rows } = await pool.query(
    `select claim_id, plan, source
       from pal_stripe_webhook_events
      where claim_id is not null
        and (
          ($1 <> '' and subscription_id = $1)
          or ($2 <> '' and customer_id = $2)
        )
      order by processed_at desc
      limit 1`,
    [subscriptionId || '', customerId || '']
  );
  return rows[0] || null;
}

async function recordStripeEvent(event) {
  const eventId = cleanText(event?.id, 255);
  const eventType = cleanText(event?.type, 128);
  const object = event?.data?.object && typeof event.data.object === 'object'
    ? event.data.object
    : {};
  if (!eventId || !eventType) {
    const error = new Error('Invalid Stripe event');
    error.statusCode = 400;
    throw error;
  }

  const live = event?.livemode === true;
  const occurredAt = stripeUnixToIso(event?.created);
  const metadata = object?.metadata && typeof object.metadata === 'object' ? object.metadata : {};

  let checkoutSessionId = eventType.startsWith('checkout.session.') ? cleanText(object?.id, 255) : '';
  let subscriptionId = cleanText(
    eventType.startsWith('customer.subscription.') ? object?.id : object?.subscription,
    255
  );
  if (!subscriptionId && typeof object?.parent?.subscription_details?.subscription === 'string') {
    subscriptionId = cleanText(object.parent.subscription_details.subscription, 255);
  }
  const customerId = cleanText(object?.customer, 255);
  const invoiceId = cleanText(eventType.startsWith('invoice.') ? object?.id : object?.invoice, 255);

  let claimId = cleanText(metadata.pal_claim_id, 128);
  let plan = cleanText(metadata.pal_plan, 32);
  let source = cleanText(metadata.pal_source, 64);
  if (!claimId && eventType.startsWith('checkout.session.')) {
    claimId = cleanText(object?.client_reference_id, 128);
  }

  if (!claimId && (subscriptionId || customerId)) {
    const context = await stripeClaimContext(subscriptionId, customerId);
    if (context) {
      claimId = cleanText(context.claim_id, 128);
      plan = cleanText(context.plan, 32);
      source = cleanText(context.source, 64);
    }
  }

  let status = cleanText(object?.status || object?.payment_status, 64).toLowerCase();
  if (eventType === 'invoice.paid') status = 'paid';
  if (eventType === 'invoice.payment_failed') status = 'payment_failed';
  if (eventType === 'customer.subscription.deleted') status = 'canceled';

  const currencyCode = cleanText(object?.currency, 3).toUpperCase();
  const amountValue =
    eventType.startsWith('invoice.') ? object?.amount_paid :
    eventType.startsWith('checkout.session.') ? object?.amount_total :
    null;
  const amountMinor = Number.isSafeInteger(Number(amountValue)) && Number(amountValue) >= 0
    ? String(Number(amountValue))
    : null;

  const accessUntil = eventType === 'invoice.paid'
    ? stripeInvoiceAccessUntil(object)
    : null;

  await pool.query(
    `insert into pal_stripe_webhook_events
      (event_id, event_type, live, occurred_at, checkout_session_id, customer_id,
       subscription_id, invoice_id, status, claim_id, plan, source, currency_code,
       amount_minor, access_until)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     on conflict (event_id) do nothing`,
    [
      eventId,
      eventType,
      live,
      occurredAt,
      checkoutSessionId || null,
      customerId || null,
      subscriptionId || null,
      invoiceId || null,
      status || null,
      claimId || null,
      plan || null,
      source || null,
      currencyCode || null,
      amountMinor,
      accessUntil,
    ]
  );

  console.log(
    'PAL_STRIPE_WEBHOOK event_id=' + eventId +
    ' event_type=' + eventType +
    ' live=' + live +
    ' subscription_id=' + (subscriptionId || '-') +
    ' invoice_id=' + (invoiceId || '-')
  );
}

async function getStripeEntitlement(claimId) {
  const { rows } = await pool.query(
    `select event_type, status, access_until, occurred_at, processed_at
       from pal_stripe_webhook_events
      where claim_id = $1
        and live = true
      order by coalesce(occurred_at, processed_at) desc, processed_at desc
      limit 100`,
    [claimId]
  );

  if (rows.length === 0) return { active: false, state: 'pending' };

  const deleted = rows.find(row => row.event_type === 'customer.subscription.deleted');
  const latestPaid = rows.find(row => row.event_type === 'invoice.paid' && row.access_until);
  if (!latestPaid) {
    if (deleted) return { active: false, state: 'canceled' };
    return { active: false, state: 'pending' };
  }

  const paidTime = new Date(latestPaid.occurred_at || latestPaid.processed_at).getTime();
  const deletedTime = deleted
    ? new Date(deleted.occurred_at || deleted.processed_at).getTime()
    : 0;
  if (deletedTime > paidTime) return { active: false, state: 'canceled' };

  const accessUntil = new Date(latestPaid.access_until);
  if (Number.isNaN(accessUntil.getTime()) || accessUntil <= new Date()) {
    return { active: false, state: 'expired' };
  }

  const failedAfterPaid = rows.find(row => {
    if (row.event_type !== 'invoice.payment_failed') return false;
    const t = new Date(row.occurred_at || row.processed_at).getTime();
    return t > paidTime;
  });

  return {
    active: true,
    state: failedAfterPaid ? 'grace_period' : 'active',
    access_until: latestPaid.access_until,
  };
}

function montyPayInnerDigest(value) {
  if (!['md5', 'sha256'].includes(MONTYPAY_HASH_DIGEST)) {
    const error = new Error('Unsupported MontyPay hash digest');
    error.statusCode = 503;
    throw error;
  }
  return crypto.createHash(MONTYPAY_HASH_DIGEST).update(value, 'utf8').digest('hex');
}

function montyPayRequestHash(orderNumber, amount, currency, description) {
  const raw = (
    orderNumber +
    amount +
    currency +
    description +
    MONTYPAY_PASSWORD
  ).toUpperCase();
  const inner = montyPayInnerDigest(raw);
  return crypto.createHash('sha1').update(inner, 'utf8').digest('hex');
}

function asciiUpper(value) {
  return String(value || '').replace(/[a-z]/g, char => char.toUpperCase());
}

function montyPayCallbackHash(params) {
  const raw = asciiUpper(
    String(params.get('id') || '') +
    String(params.get('order_number') || '') +
    String(params.get('order_amount') || '') +
    String(params.get('order_currency') || '') +
    String(params.get('order_description') || '') +
    MONTYPAY_PASSWORD
  );
  const inner = montyPayInnerDigest(raw);
  return crypto.createHash('sha1').update(inner, 'utf8').digest('hex');
}

function verifyMontyPayCallback(params) {
  if (!MONTYPAY_PASSWORD) {
    const error = new Error('MontyPay password is not configured');
    error.statusCode = 503;
    throw error;
  }

  const received = cleanText(params.get('hash'), 128).toLowerCase();
  const expected = montyPayCallbackHash(params).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(received)) {
    const error = new Error('Invalid MontyPay callback hash');
    error.statusCode = 401;
    throw error;
  }

  const receivedBuffer = Buffer.from(received, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    const error = new Error('Invalid MontyPay callback hash');
    error.statusCode = 401;
    throw error;
  }
}

function montyPayPlanConfig(plan) {
  if (plan === 'monthly') {
    return {
      amount: '19.00',
      amountMinor: '1900',
      description: 'PAL Pro Monthly',
      scheduleId: MONTYPAY_SCHEDULE_ID_MONTHLY,
    };
  }
  if (plan === 'annual') {
    return {
      amount: '199.00',
      amountMinor: '19900',
      description: 'PAL Pro Annual',
      scheduleId: MONTYPAY_SCHEDULE_ID_ANNUAL,
    };
  }
  return null;
}

function montyPayConfigured(requireLive = true) {
  const baseConfigured = Boolean(
    MONTYPAY_CHECKOUT_URL &&
    MONTYPAY_MERCHANT_KEY &&
    MONTYPAY_PASSWORD &&
    /^[A-Z]{3}$/.test(MONTYPAY_CURRENCY) &&
    ['md5', 'sha256'].includes(MONTYPAY_HASH_DIGEST) &&
    MONTYPAY_SCHEDULE_ID_MONTHLY &&
    MONTYPAY_SCHEDULE_ID_ANNUAL
  );
  if (!baseConfigured) return false;
  return requireLive ? MONTYPAY_CHECKOUT_LIVE : true;
}

function montyPayAccessUntil(plan, from = new Date()) {
  const value = new Date(from);
  if (plan === 'monthly') value.setUTCMonth(value.getUTCMonth() + 1);
  else if (plan === 'annual') value.setUTCFullYear(value.getUTCFullYear() + 1);
  else return null;
  return value.toISOString();
}

async function createMontyPayCheckoutSession({ claimId, plan, source, live }) {
  if (!montyPayConfigured(false)) {
    const error = new Error('MontyPay checkout is not fully configured');
    error.statusCode = 503;
    throw error;
  }
  if (Boolean(live) !== MONTYPAY_CHECKOUT_LIVE) {
    const error = new Error('MontyPay environment does not match requested checkout mode');
    error.statusCode = 503;
    throw error;
  }

  let base;
  try {
    base = new URL(MONTYPAY_CHECKOUT_URL);
  } catch {
    const error = new Error('MontyPay checkout URL is invalid');
    error.statusCode = 503;
    throw error;
  }
  if (base.protocol !== 'https:') {
    const error = new Error('MontyPay checkout URL must use HTTPS');
    error.statusCode = 503;
    throw error;
  }

  const config = montyPayPlanConfig(plan);
  if (!config || !config.scheduleId) {
    const error = new Error('MontyPay recurring schedule is not configured for this plan');
    error.statusCode = 503;
    throw error;
  }

  const orderNumber =
    'pal-' +
    Date.now().toString(36) +
    '-' +
    crypto.randomBytes(10).toString('hex');

  const requestHash = montyPayRequestHash(
    orderNumber,
    config.amount,
    MONTYPAY_CURRENCY,
    config.description
  );

  await pool.query(
    `insert into pal_montypay_checkout_sessions
      (order_number, claim_id, plan, source, live, amount_minor, currency_code)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      orderNumber,
      claimId,
      plan,
      source,
      Boolean(live),
      config.amountMinor,
      MONTYPAY_CURRENCY,
    ]
  );

  const endpoint = new URL('/api/v1/session', base).toString();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'PracticalAutomationLab/1.0',
    },
    body: JSON.stringify({
      merchant_key: MONTYPAY_MERCHANT_KEY,
      operation: 'purchase',
      order: {
        number: orderNumber,
        amount: config.amount,
        currency: MONTYPAY_CURRENCY,
        description: config.description,
      },
      success_url: SITE_ORIGIN + '/checkout-success.html',
      cancel_url: SITE_ORIGIN + '/pricing.html?checkout=cancelled',
      expiry_url: SITE_ORIGIN + '/pricing.html?checkout=expired',
      error_url: SITE_ORIGIN + '/pricing.html?checkout=error',
      recurring_init: true,
      recurring_consent_required: true,
      schedule_id: config.scheduleId,
      payment_schedule_amount: config.amount,
      hash: requestHash,
    }),
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }

  if (!response.ok) {
    console.error(
      'PAL_MONTYPAY_API_ERROR status=' + response.status +
      ' body=' + text.slice(0, 1000)
    );
    const error = new Error('MontyPay checkout service rejected the request');
    error.statusCode = response.status >= 500 ? 502 : 400;
    throw error;
  }

  const checkoutUrl = cleanText(data?.redirect_url, 2048);
  if (!checkoutUrl) {
    const error = new Error('MontyPay did not return a checkout URL');
    error.statusCode = 502;
    throw error;
  }

  let parsedCheckoutUrl;
  try { parsedCheckoutUrl = new URL(checkoutUrl); } catch {}
  if (!parsedCheckoutUrl || parsedCheckoutUrl.protocol !== 'https:') {
    const error = new Error('MontyPay returned an invalid checkout URL');
    error.statusCode = 502;
    throw error;
  }

  console.log(
    'PAL_MONTYPAY_SESSION created=true live=' + Boolean(live) +
    ' plan=' + plan +
    ' source=' + source +
    ' order_number=' + orderNumber
  );

  return {
    checkout_url: checkoutUrl,
    live: Boolean(live),
    session_id: orderNumber,
  };
}

async function montyPaySessionForCallback(params) {
  const orderNumber = cleanText(params.get('order_number'), 255);
  if (orderNumber) {
    const direct = await pool.query(
      `select order_number, claim_id, plan, source, live, amount_minor, currency_code
         from pal_montypay_checkout_sessions
        where order_number = $1
        limit 1`,
      [orderNumber]
    );
    if (direct.rows[0]) return direct.rows[0];
  }

  const recurringInitTransId = cleanText(params.get('recurring_init_trans_id'), 128);
  const recurringToken = cleanText(params.get('recurring_token'), 256);
  if (!recurringInitTransId && !recurringToken) return null;

  const linked = await pool.query(
    `select e.claim_id,
            e.plan,
            e.source,
            e.live,
            e.amount_minor,
            e.currency_code,
            e.order_number
       from pal_montypay_webhook_events e
      where e.claim_id is not null
        and (
          ($1 <> '' and e.recurring_init_trans_id = $1)
          or ($2 <> '' and e.recurring_token = $2)
        )
      order by e.processed_at desc
      limit 1`,
    [recurringInitTransId, recurringToken]
  );
  return linked.rows[0] || null;
}

async function recordMontyPayCallback(rawBody, params) {
  verifyMontyPayCallback(params);

  const paymentId = cleanText(params.get('id'), 128);
  const eventType = cleanText(params.get('type'), 64).toLowerCase();
  const eventStatus = cleanText(params.get('status'), 32).toLowerCase();
  const orderStatus = cleanText(params.get('order_status'), 32).toLowerCase();
  if (!paymentId || !eventType || !eventStatus || !orderStatus) {
    const error = new Error('Invalid MontyPay callback');
    error.statusCode = 400;
    throw error;
  }

  const session = await montyPaySessionForCallback(params);
  if (!session) {
    const error = new Error('Unknown MontyPay order');
    error.statusCode = 400;
    throw error;
  }

  const callbackCurrency = cleanText(params.get('order_currency'), 6).toUpperCase();
  const callbackAmountMinor = decimalAmountToMinor(params.get('order_amount'));
  if (
    ['sale', 'recurring'].includes(eventType) &&
    (
      callbackCurrency !== String(session.currency_code || '').toUpperCase() ||
      callbackAmountMinor !== String(session.amount_minor || '')
    )
  ) {
    const error = new Error('MontyPay callback amount or currency mismatch');
    error.statusCode = 400;
    throw error;
  }

  const recurringInitTransId = cleanText(params.get('recurring_init_trans_id'), 128);
  const recurringToken = cleanText(params.get('recurring_token'), 256);
  const scheduleId = cleanText(params.get('schedule_id'), 128);
  const transactionId = cleanText(params.get('trans_id'), 128);
  const isFinalPaid =
    ['sale', 'recurring'].includes(eventType) &&
    eventStatus === 'success' &&
    orderStatus === 'settled';

  const autoRenew =
    eventType === 'recurring' ||
    Boolean(recurringToken) ||
    Boolean(scheduleId && recurringInitTransId);

  const accessUntil = isFinalPaid
    ? montyPayAccessUntil(session.plan)
    : null;

  const eventId = crypto
    .createHash('sha256')
    .update(rawBody, 'utf8')
    .digest('hex');

  await pool.query(
    `insert into pal_montypay_webhook_events
      (event_id, payment_id, event_type, event_status, order_status, live,
       order_number, transaction_id, recurring_init_trans_id, recurring_token,
       schedule_id, auto_renew, claim_id, plan, source, currency_code,
       amount_minor, access_until)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     on conflict (event_id) do nothing`,
    [
      eventId,
      paymentId,
      eventType,
      eventStatus,
      orderStatus,
      Boolean(session.live),
      cleanText(params.get('order_number'), 255) || session.order_number || null,
      transactionId || null,
      recurringInitTransId || null,
      recurringToken || null,
      scheduleId || null,
      autoRenew,
      session.claim_id,
      session.plan,
      session.source,
      callbackCurrency || session.currency_code,
      callbackAmountMinor || session.amount_minor,
      accessUntil,
    ]
  );

  console.log(
    'PAL_MONTYPAY_WEBHOOK event_id=' + eventId +
    ' type=' + eventType +
    ' status=' + eventStatus +
    ' order_status=' + orderStatus +
    ' live=' + Boolean(session.live) +
    ' order_number=' + (cleanText(params.get('order_number'), 255) || '-')
  );
}

async function getMontyPayEntitlement(claimId) {
  const { rows } = await pool.query(
    `select event_type, event_status, order_status, auto_renew, access_until, processed_at
       from pal_montypay_webhook_events
      where claim_id = $1
        and live = true
      order by processed_at desc
      limit 100`,
    [claimId]
  );

  if (rows.length === 0) return { active: false, state: 'pending' };

  const latestTerminal = rows.find(row =>
    ['refund', 'void', 'chargeback'].includes(row.event_type) &&
    ['refund', 'void', 'chargeback'].includes(row.order_status)
  );
  const latestPaid = rows.find(row =>
    ['sale', 'recurring'].includes(row.event_type) &&
    row.event_status === 'success' &&
    row.order_status === 'settled' &&
    row.access_until
  );

  if (latestTerminal && (!latestPaid || latestTerminal.processed_at > latestPaid.processed_at)) {
    return { active: false, state: latestTerminal.order_status };
  }
  if (!latestPaid) return { active: false, state: 'pending' };

  const accessUntil = new Date(latestPaid.access_until);
  if (Number.isNaN(accessUntil.getTime()) || accessUntil <= new Date()) {
    return { active: false, state: 'expired' };
  }

  return {
    active: true,
    state: latestPaid.auto_renew ? 'active' : 'paid_term',
    access_until: latestPaid.access_until,
  };
}

function resolvedCheckoutProvider() {
  const requested = PAL_CHECKOUT_PROVIDER;
  if (requested && requested !== 'auto') {
    if (requested === 'stripe' && stripeConfigured(true)) return 'stripe';
    if (requested === 'montypay' && montyPayConfigured(true)) return 'montypay';
    if (requested === 'creem' && creemConfigured(true)) return 'creem';
    if (requested === 'paypro' && payProConfigured()) return 'paypro';
    if (requested === 'fastspring' && fastSpringConfigured()) return 'fastspring';
    return null;
  }
  if (stripeConfigured(true)) return 'stripe';
  if (montyPayConfigured(true)) return 'montypay';
  if (creemConfigured(true)) return 'creem';
  if (payProConfigured()) return 'paypro';
  if (fastSpringConfigured()) return 'fastspring';
  return null;
}

async function createPalCheckoutSession({ claimId, plan, source }) {
  const provider = resolvedCheckoutProvider();
  if (!provider) {
    const error = new Error('Live PAL Pro checkout is awaiting payment-provider activation');
    error.statusCode = 503;
    throw error;
  }

  if (provider === 'stripe') {
    return { provider, ...(await createStripeCheckoutSession({ claimId, plan, source, live: true })) };
  }
  if (provider === 'montypay') {
    return { provider, ...(await createMontyPayCheckoutSession({ claimId, plan, source, live: true })) };
  }
  if (provider === 'creem') {
    return { provider, ...(await createCreemCheckoutSession({ claimId, plan, source, live: true })) };
  }
  if (provider === 'paypro') {
    return { provider, ...(await createPayProCheckoutSession({ claimId, plan, source, live: true })) };
  }

  if (!FASTSPRING_CHECKOUT_LIVE) {
    const error = new Error('FastSpring checkout is not live');
    error.statusCode = 503;
    throw error;
  }
  return {
    provider: 'fastspring',
    ...(await createFastSpringCheckoutSession({ claimId, plan, source, live: true })),
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
      const completedCte = `
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

          union all
          select 'creem'::text as provider,
                 coalesce(occurred_at, processed_at) as occurred_at,
                 currency_code,
                 amount_minor,
                 coalesce(source, 'unknown') as source
            from pal_creem_webhook_events
           where event_type = 'subscription.paid'
             and live = true

          union all
          select 'paypro'::text as provider,
                 coalesce(occurred_at, processed_at) as occurred_at,
                 currency_code,
                 amount_minor,
                 coalesce(source, 'unknown') as source
            from pal_paypro_webhook_events
           where event_type in ('OrderCharged', 'SubscriptionChargeSucceed')
             and test_mode = false

          union all
          select 'stripe'::text as provider,
                 coalesce(occurred_at, processed_at) as occurred_at,
                 currency_code,
                 amount_minor,
                 coalesce(source, 'unknown') as source
            from pal_stripe_webhook_events
           where event_type = 'invoice.paid'
             and live = true

          union all
          select 'montypay'::text as provider,
                 processed_at as occurred_at,
                 currency_code,
                 amount_minor,
                 coalesce(source, 'unknown') as source
            from pal_montypay_webhook_events
           where event_type in ('sale', 'recurring')
             and event_status = 'success'
             and order_status = 'settled'
             and live = true
        )
      `;

      const { rows: totalsRows } = await pool.query(
        completedCte + `
        select count(*)::bigint as completed_transactions,
               min(occurred_at) as first_completed_at,
               max(occurred_at) as last_completed_at
          from completed
        `
      );

      const { rows: revenueRows } = await pool.query(
        completedCte + `
        select currency_code,
               coalesce(sum(amount_minor), 0)::text as gross_completed_minor
          from completed
         where currency_code is not null
           and amount_minor is not null
         group by currency_code
         order by currency_code
        `
      );

      const { rows: sourceRows } = await pool.query(
        completedCte + `
        select source, count(*)::bigint as completed_transactions
          from completed
         group by source
         order by count(*) desc, source
        `
      );

      const { rows: providerRows } = await pool.query(
        completedCte + `
        select provider, count(*)::bigint as completed_transactions
          from completed
         group by provider
         order by provider
        `
      );

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
                 where event_type in ('subscription.activated', 'subscription.charge.completed')
                   and status not in ('canceled', 'deactivated')
               )::bigint as active_subscriptions,
               count(*) filter (
                 where event_type in ('subscription.canceled', 'subscription.deactivated')
                    or status in ('canceled', 'deactivated')
               )::bigint as canceled_subscriptions
          from latest
      `);

      const { rows: creemSubscriptionRows } = await pool.query(`
        with latest as (
          select distinct on (subscription_id)
                 subscription_id,
                 event_type,
                 lower(coalesce(status, '')) as status
            from pal_creem_webhook_events
           where subscription_id is not null
             and event_type like 'subscription.%'
             and live = true
           order by subscription_id, coalesce(occurred_at, processed_at) desc, processed_at desc
        )
        select count(*) filter (
                 where event_type in ('subscription.active', 'subscription.paid')
                   and status not in ('canceled', 'expired', 'paused')
               )::bigint as active_subscriptions,
               count(*) filter (
                 where event_type in ('subscription.canceled', 'subscription.expired', 'subscription.paused')
                    or status in ('canceled', 'expired', 'paused')
               )::bigint as canceled_subscriptions
          from latest
      `);

      const { rows: payProSubscriptionRows } = await pool.query(`
        with latest as (
          select distinct on (subscription_id)
                 subscription_id,
                 event_type
            from pal_paypro_webhook_events
           where subscription_id is not null
             and test_mode = false
           order by subscription_id, coalesce(occurred_at, processed_at) desc, processed_at desc
        )
        select count(*) filter (
                 where event_type in ('OrderCharged', 'SubscriptionChargeSucceed', 'SubscriptionRenewed', 'OrderChargedBackWon')
               )::bigint as active_subscriptions,
               count(*) filter (
                 where event_type in ('SubscriptionSuspended', 'SubscriptionTerminated', 'SubscriptionFinished')
               )::bigint as canceled_subscriptions
          from latest
      `);

      const { rows: stripeSubscriptionRows } = await pool.query(`
        with by_claim as (
          select claim_id,
                 max(access_until) filter (where event_type = 'invoice.paid') as access_until,
                 max(coalesce(occurred_at, processed_at)) filter (where event_type = 'customer.subscription.deleted') as canceled_at,
                 max(coalesce(occurred_at, processed_at)) filter (where event_type = 'invoice.paid') as paid_at
            from pal_stripe_webhook_events
           where claim_id is not null
             and live = true
           group by claim_id
        )
        select count(*) filter (
                 where access_until > now()
                   and (canceled_at is null or paid_at > canceled_at)
               )::bigint as active_subscriptions,
               count(*) filter (
                 where canceled_at is not null
                   and (paid_at is null or canceled_at > paid_at)
               )::bigint as canceled_subscriptions
          from by_claim
      `);

      const { rows: montyPaySubscriptionRows } = await pool.query(`
        with by_claim as (
          select claim_id,
                 bool_or(auto_renew) as auto_renew,
                 max(access_until) as access_until
            from pal_montypay_webhook_events
           where claim_id is not null
             and live = true
           group by claim_id
        )
        select count(*) filter (
                 where auto_renew = true
                   and access_until > now()
               )::bigint as active_subscriptions,
               0::bigint as canceled_subscriptions
          from by_claim
      `);

      const paddleActive = Number(paddleSubscriptionRows[0].active_subscriptions);
      const paddleCanceled = Number(paddleSubscriptionRows[0].canceled_subscriptions);
      const fastSpringActive = Number(fastSpringSubscriptionRows[0].active_subscriptions);
      const fastSpringCanceled = Number(fastSpringSubscriptionRows[0].canceled_subscriptions);
      const creemActive = Number(creemSubscriptionRows[0].active_subscriptions);
      const creemCanceled = Number(creemSubscriptionRows[0].canceled_subscriptions);
      const payproActive = Number(payProSubscriptionRows[0].active_subscriptions);
      const payproCanceled = Number(payProSubscriptionRows[0].canceled_subscriptions);
      const montypayActive = Number(montyPaySubscriptionRows[0].active_subscriptions);
      const montypayCanceled = Number(montyPaySubscriptionRows[0].canceled_subscriptions);
      const stripeActive = Number(stripeSubscriptionRows[0].active_subscriptions);
      const stripeCanceled = Number(stripeSubscriptionRows[0].canceled_subscriptions);

      return sendJson(req, res, 200, {
        ok: true,
        scope: 'genuine_payment_events_only',
        completed_transactions: Number(totalsRows[0].completed_transactions),
        first_completed_at: totalsRows[0].first_completed_at,
        last_completed_at: totalsRows[0].last_completed_at,
        active_subscriptions: paddleActive + fastSpringActive + creemActive + payproActive + montypayActive + stripeActive,
        canceled_subscriptions: paddleCanceled + fastSpringCanceled + creemCanceled + payproCanceled + montypayCanceled + stripeCanceled,
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
          paddle: { active: paddleActive, canceled: paddleCanceled },
          fastspring: { active: fastSpringActive, canceled: fastSpringCanceled },
          creem: { active: creemActive, canceled: creemCanceled },
          paypro: { active: payproActive, canceled: payproCanceled },
          montypay: { active: montypayActive, canceled: montypayCanceled },
          stripe: { active: stripeActive, canceled: stripeCanceled },
        },
        note: 'Gross completed transaction totals are before provider fees, refunds, chargebacks, and adjustments. Paddle simulator events and all provider test-mode events are excluded. MontyPay schedule cancellations do not emit a callback, so subscription cancellation state requires provider reconciliation; paid access still expires at the last paid-through date.',
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

    if (req.method === 'GET' && url.pathname === '/checkout-readiness') {
      const provider = resolvedCheckoutProvider();
      return sendJson(req, res, 200, {
        ok: true,
        ready: Boolean(provider),
        provider,
        candidates: {
          fastspring: fastSpringConfigured(),
          stripe: stripeConfigured(true),
          stripe_test: stripeConfigured(false) && !STRIPE_CHECKOUT_LIVE,
          creem: creemConfigured(true),
          paypro: payProConfigured(),
          montypay: montyPayConfigured(true),
          montypay_test: montyPayConfigured(false) && !MONTYPAY_CHECKOUT_LIVE,
          creem_test: creemConfigured(false),
        },
        payment_path_verified: false,
        note: provider
          ? 'A live provider is configured; verify a real buyer checkout opening before setting payment_path_verified=true.'
          : 'No live payment provider is configured yet.',
      });
    }

    if (req.method === 'POST' && url.pathname === '/checkout-session') {
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

      const session = await createPalCheckoutSession({ claimId, plan, source });
      return sendJson(req, res, 201, { ok: true, ...session });
    }

    if (req.method === 'POST' && url.pathname === '/stripe/test-checkout-session') {
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
      if (STRIPE_CHECKOUT_LIVE || !stripeConfigured(false)) {
        return sendJson(req, res, 503, { ok: false, error: 'Stripe sandbox is not configured' });
      }

      const session = await createStripeCheckoutSession({ claimId, plan, source, live: false });
      return sendJson(req, res, 201, { ok: true, provider: 'stripe', test: true, ...session });
    }

    if (req.method === 'POST' && url.pathname === '/stripe/webhook') {
      const rawBody = await readRawBody(req);
      verifyStripeSignature(rawBody, req.headers['stripe-signature']);
      let event;
      try { event = JSON.parse(rawBody); }
      catch {
        const error = new Error('Invalid JSON');
        error.statusCode = 400;
        throw error;
      }
      await recordStripeEvent(event);
      return sendJson(req, res, 200, { received: true });
    }

    if (req.method === 'POST' && url.pathname === '/montypay/test-checkout-session') {
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
      if (MONTYPAY_CHECKOUT_LIVE || !montyPayConfigured(false)) {
        return sendJson(req, res, 503, {
          ok: false,
          error: 'MontyPay sandbox is not configured',
        });
      }

      const session = await createMontyPayCheckoutSession({
        claimId,
        plan,
        source,
        live: false,
      });
      return sendJson(req, res, 201, {
        ok: true,
        provider: 'montypay',
        test: true,
        ...session,
      });
    }

    if (req.method === 'POST' && url.pathname === '/montypay/webhook') {
      const rawBody = await readRawBody(req);
      const params = new URLSearchParams(rawBody);
      await recordMontyPayCallback(rawBody, params);
      return sendJson(req, res, 200, { received: true });
    }

    if (req.method === 'POST' && url.pathname === '/creem/test-checkout-session') {
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
      if (!creemConfigured(false)) {
        return sendJson(req, res, 503, { ok: false, error: 'Creem test environment is not configured' });
      }

      const session = await createCreemCheckoutSession({ claimId, plan, source, live: false });
      return sendJson(req, res, 201, { ok: true, provider: 'creem', ...session });
    }

    if (req.method === 'POST' && url.pathname === '/creem/test-webhook') {
      const rawBody = await readRawBody(req);
      verifyCreemSignature(rawBody, req.headers['creem-signature'], CREEM_TEST_WEBHOOK_SECRET);

      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        const error = new Error('Invalid JSON');
        error.statusCode = 400;
        throw error;
      }

      await recordCreemEvent(event, false);
      return sendJson(req, res, 200, { received: true, test: true });
    }

    if (req.method === 'POST' && url.pathname === '/creem/webhook') {
      const rawBody = await readRawBody(req);
      verifyCreemSignature(rawBody, req.headers['creem-signature'], CREEM_WEBHOOK_SECRET);

      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        const error = new Error('Invalid JSON');
        error.statusCode = 400;
        throw error;
      }

      await recordCreemEvent(event, true);
      return sendJson(req, res, 200, { received: true });
    }

    if (req.method === 'POST' && url.pathname === '/paypro/webhook') {
      const rawBody = await readRawBody(req);
      const params = new URLSearchParams(rawBody);
      verifyPayProSignature(params);
      await recordPayProEvent(rawBody, params);
      return sendJson(req, res, 200, { received: true });
    }

    if (req.method === 'POST' && url.pathname === '/fastspring/test-checkout-session') {
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
        live: false,
      });

      return sendJson(req, res, 201, {
        ok: true,
        provider: 'fastspring',
        ...session,
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

      if (!FASTSPRING_CHECKOUT_LIVE) {
        return sendJson(req, res, 503, {
          ok: false,
          error: 'Live FastSpring checkout is awaiting activation',
        });
      }

      const session = await createFastSpringCheckoutSession({
        claimId,
        plan,
        source,
        live: true,
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
