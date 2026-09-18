'use strict';

const http = require('node:http');
const { URL } = require('node:url');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
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
        'eudr_preflight_commercial_cta_clicked'
      ))
  `);
  await pool.query(`
    create index if not exists pal_feed_auditor_events_occurred_at_idx
      on pal_feed_auditor_events (occurred_at desc)
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
