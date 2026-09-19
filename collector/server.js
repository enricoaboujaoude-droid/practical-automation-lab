'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const PADDLE_NOTIFICATION_WEBHOOK_SECRET = process.env.PADDLE_NOTIFICATION_WEBHOOK_SECRET || '';
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
      processed_at timestamptz not null default now()
    )
  `);

  await pool.query(`
    alter table pal_paddle_webhook_events
      add column if not exists is_simulation boolean not null default false,
      add column if not exists claim_id text,
      add column if not exists plan text
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
  const isSimulation = eventId.startsWith('ntfsimevt_');

  await pool.query(
    `insert into pal_paddle_webhook_events
      (event_id, event_type, occurred_at, resource_id, customer_id, transaction_id, subscription_id, status, is_simulation, claim_id, plan)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
  'implementation',
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
