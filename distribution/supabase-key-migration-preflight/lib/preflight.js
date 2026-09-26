import { createHash } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 10_000;
const ALLOWED_METHODS = new Set(['GET', 'HEAD']);
const ALLOWED_KEY_TYPES = new Set(['publishable', 'secret', 'none']);
const ALLOWED_AUTH_STYLES = new Set(['apikey', 'apikey-and-bearer', 'none']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeOrigin(projectUrl) {
  const url = new URL(projectUrl);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
  assert(url.protocol === 'https:' || (local && url.protocol === 'http:'), 'projectUrl must use HTTPS (HTTP is allowed only for localhost tests)');
  assert(!url.username && !url.password, 'projectUrl must not contain credentials');
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function validateConfig(config, env) {
  assert(config && typeof config === 'object', 'config must be an object');
  const base = normalizeOrigin(config.projectUrl);
  const keyEnv = {
    publishable: config.publishableKeyEnv || 'SUPABASE_PUBLISHABLE_KEY',
    secret: config.secretKeyEnv || 'SUPABASE_SECRET_KEY'
  };

  const keys = {
    publishable: env[keyEnv.publishable],
    secret: env[keyEnv.secret]
  };
  assert(keys.publishable, `Missing environment variable: ${keyEnv.publishable}`);
  assert(keys.secret, `Missing environment variable: ${keyEnv.secret}`);
  assert(keys.publishable.startsWith('sb_publishable_'), `${keyEnv.publishable} is not an sb_publishable_ key`);
  assert(keys.secret.startsWith('sb_secret_'), `${keyEnv.secret} is not an sb_secret_ key`);

  assert(Array.isArray(config.probes) && config.probes.length > 0, 'config.probes must be a non-empty array');
  const ids = new Set();
  const probes = config.probes.map((probe, index) => {
    assert(probe && typeof probe === 'object', `probe ${index + 1} must be an object`);
    assert(typeof probe.id === 'string' && /^[a-z0-9][a-z0-9._-]*$/i.test(probe.id), `probe ${index + 1} has an invalid id`);
    assert(!ids.has(probe.id), `duplicate probe id: ${probe.id}`);
    ids.add(probe.id);

    const method = String(probe.method || 'GET').toUpperCase();
    const keyType = probe.keyType || 'none';
    const authStyle = probe.authStyle || (keyType === 'none' ? 'none' : 'apikey');
    assert(ALLOWED_METHODS.has(method), `probe ${probe.id}: only GET and HEAD are allowed`);
    assert(ALLOWED_KEY_TYPES.has(keyType), `probe ${probe.id}: invalid keyType`);
    assert(ALLOWED_AUTH_STYLES.has(authStyle), `probe ${probe.id}: invalid authStyle`);
    assert(keyType !== 'none' || authStyle === 'none', `probe ${probe.id}: authStyle requires a key`);

    const url = new URL(probe.path, base);
    assert(url.origin === base.origin, `probe ${probe.id}: cross-origin URL refused`);
    assert(!url.username && !url.password, `probe ${probe.id}: URL credentials refused`);

    const expectedStatuses = probe.expectedStatuses || [200];
    assert(Array.isArray(expectedStatuses) && expectedStatuses.length > 0, `probe ${probe.id}: expectedStatuses must be non-empty`);
    expectedStatuses.forEach((status) => assert(Number.isInteger(status) && status >= 100 && status <= 599, `probe ${probe.id}: invalid expected status`));

    return { id: probe.id, method, keyType, authStyle, url, expectedStatuses };
  });

  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  assert(Number.isInteger(timeoutMs) && timeoutMs >= 500 && timeoutMs <= 60_000, 'timeoutMs must be between 500 and 60000');
  return { base, keys, keyEnv, probes, timeoutMs };
}

function keyFingerprint(key) {
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

function buildHeaders(probe, keys) {
  const headers = { accept: 'application/json' };
  if (probe.keyType === 'none') return headers;
  const key = keys[probe.keyType];
  if (probe.authStyle === 'apikey' || probe.authStyle === 'apikey-and-bearer') headers.apikey = key;
  if (probe.authStyle === 'apikey-and-bearer') headers.authorization = `Bearer ${key}`;
  return headers;
}

function classifyError(error) {
  if (error?.name === 'AbortError') return 'timeout';
  return 'network_error';
}

export async function runPreflight(config, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  assert(typeof fetchImpl === 'function', 'fetch is unavailable; Node 20+ is required');
  const validated = validateConfig(config, env);
  const startedAt = new Date().toISOString();
  const results = [];

  for (const probe of validated.probes) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), validated.timeoutMs);
    const start = performance.now();
    try {
      const response = await fetchImpl(probe.url, {
        method: probe.method,
        headers: buildHeaders(probe, validated.keys),
        redirect: 'manual',
        signal: controller.signal
      });
      const durationMs = Math.round(performance.now() - start);
      const passed = probe.expectedStatuses.includes(response.status);
      results.push({
        id: probe.id,
        method: probe.method,
        path: `${probe.url.pathname}${probe.url.search}`,
        keyType: probe.keyType,
        authStyle: probe.authStyle,
        expectedStatuses: probe.expectedStatuses,
        status: response.status,
        durationMs,
        passed,
        category: passed ? 'ok' : response.status >= 300 && response.status < 400 ? 'redirect_refused' : 'unexpected_status'
      });
    } catch (error) {
      results.push({
        id: probe.id,
        method: probe.method,
        path: `${probe.url.pathname}${probe.url.search}`,
        keyType: probe.keyType,
        authStyle: probe.authStyle,
        expectedStatuses: probe.expectedStatuses,
        status: null,
        durationMs: Math.round(performance.now() - start),
        passed: false,
        category: classifyError(error)
      });
    } finally {
      clearTimeout(timer);
    }
  }

  const passed = results.filter((result) => result.passed).length;
  return {
    schemaVersion: 1,
    tool: 'supabase-key-migration-preflight',
    startedAt,
    completedAt: new Date().toISOString(),
    targetOrigin: validated.base.origin,
    credentials: {
      publishable: { env: validated.keyEnv.publishable, fingerprint: keyFingerprint(validated.keys.publishable) },
      secret: { env: validated.keyEnv.secret, fingerprint: keyFingerprint(validated.keys.secret) }
    },
    safety: { methods: ['GET', 'HEAD'], redirectsFollowed: false, crossOriginAllowed: false, responseBodiesCaptured: false },
    summary: { total: results.length, passed, failed: results.length - passed },
    results
  };
}

export function formatHumanReport(report) {
  const lines = [
    'Supabase API-key migration preflight',
    `Target: ${report.targetOrigin}`,
    `Result: ${report.summary.passed}/${report.summary.total} passed`,
    ''
  ];
  for (const result of report.results) {
    const status = result.status === null ? result.category : `HTTP ${result.status}`;
    lines.push(`${result.passed ? 'PASS' : 'FAIL'}  ${result.id}  ${status}  ${result.durationMs}ms`);
  }
  lines.push('', 'No response bodies or credential values were stored.');
  return lines.join('\n');
}
