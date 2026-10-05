import { Actor } from 'apify';

const PAL_BASE_URL = 'https://pal-nano-catalog-audit.onrender.com';

const OPERATIONS = {
  'catalog-remediation': {
    path: '/v1/upstream/catalog-remediation',
    eventName: 'catalog-remediation',
    buildBody(input) {
      const records = input.records;
      if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
        throw new Error('catalog-remediation requires records with 1 to 100 product objects');
      }
      return { records };
    },
  },
  'catalog-audit': {
    path: '/v1/upstream/catalog-audit',
    eventName: 'catalog-audit',
    buildBody(input) {
      const records = input.records;
      if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
        throw new Error('catalog-audit requires records with 1 to 100 product objects');
      }
      return { records };
    },
  },
  'gtin-check': {
    path: '/v1/upstream/gtin-check',
    eventName: 'gtin-check',
    buildBody(input) {
      const gtins = input.gtins;
      if (!Array.isArray(gtins) || gtins.length < 1 || gtins.length > 100) {
        throw new Error('gtin-check requires gtins with 1 to 100 values');
      }
      return { gtins };
    },
  },
  'feed-diff': {
    path: '/v1/upstream/feed-diff',
    eventName: 'feed-diff',
    buildBody(input) {
      const before = input.before;
      const after = input.after;
      if (!Array.isArray(before) || !Array.isArray(after)) {
        throw new Error('feed-diff requires before and after arrays');
      }
      if (before.length > 100 || after.length > 100 || before.length + after.length < 1) {
        throw new Error('feed-diff supports up to 100 rows per snapshot and at least one total row');
      }
      return { before, after };
    },
  },
  'x402-validate': {
    path: '/v1/upstream/x402-validate',
    eventName: 'x402-validate',
    buildBody(input) {
      const declaration = input.declaration;
      if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
        throw new Error('x402-validate requires declaration as an object');
      }
      return declaration;
    },
  },
};

async function callPal(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(`${PAL_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'PAL-Apify-Actor/1.0',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      const detail = payload?.detail || payload?.error || text || `HTTP ${response.status}`;
      throw new Error(`PAL upstream rejected the request: ${detail}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

await Actor.init();

try {
  const input = (await Actor.getInput()) ?? {};
  const operation = String(input.operation || 'catalog-remediation');
  const config = OPERATIONS[operation];

  if (!config) {
    throw new Error(
      `Unsupported operation "${operation}". Choose one of: ${Object.keys(OPERATIONS).join(', ')}`,
    );
  }

  const body = config.buildBody(input);
  const result = await callPal(config.path, body);

  // Charge only after PAL has successfully produced the requested result.
  // The event price is configured in Apify Console's pay-per-event pricing.
  const charge = await Actor.charge({ eventName: config.eventName });
  const chargedCount = Number(charge?.chargedCount ?? 0);

  if (chargedCount < 1) {
    throw new Error(
      'The run budget does not allow this paid event. Increase the maximum run charge and try again.',
    );
  }

  const output = {
    ok: true,
    operation,
    provider: 'Practical Automation Lab',
    billing: {
      platform: 'Apify',
      model: 'pay-per-event',
      event: config.eventName,
    },
    result,
    generated_at: new Date().toISOString(),
  };

  await Actor.setValue('OUTPUT', output);
  await Actor.pushData(output);
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
