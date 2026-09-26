import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { runPreflight, formatHumanReport } from '../lib/preflight.js';

const publishable = 'sb_publishable_test_public_value';
const secret = 'sb_secret_test_private_value';

async function withServer(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('runs read-only probes and redacts credentials', async () => {
  const seen = [];
  await withServer((request, response) => {
    seen.push({ method: request.method, url: request.url, apikey: request.headers.apikey, authorization: request.headers.authorization });
    response.writeHead(request.url.startsWith('/good') ? 200 : 401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ leaked: secret }));
  }, async (origin) => {
    const report = await runPreflight({
      projectUrl: origin,
      probes: [
        { id: 'public', path: '/good', keyType: 'publishable', authStyle: 'apikey', expectedStatuses: [200] },
        { id: 'admin', path: '/bad', keyType: 'secret', authStyle: 'apikey', expectedStatuses: [200] }
      ]
    }, { env: { SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SECRET_KEY: secret } });

    assert.deepEqual(report.summary, { total: 2, passed: 1, failed: 1 });
    assert.equal(seen[0].method, 'GET');
    assert.equal(seen[0].apikey, publishable);
    assert.equal(seen[1].apikey, secret);
    assert.equal(seen[1].authorization, undefined);
    assert.ok(!JSON.stringify(report).includes(publishable));
    assert.ok(!JSON.stringify(report).includes(secret));
    assert.ok(!formatHumanReport(report).includes(secret));
  });
});

test('refuses mutation methods and cross-origin probes', async () => {
  const base = {
    projectUrl: 'https://project.supabase.co',
    probes: [{ id: 'unsafe', path: '/rest/v1/table', method: 'POST', keyType: 'secret' }]
  };
  const env = { SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SECRET_KEY: secret };
  await assert.rejects(() => runPreflight(base, { env, fetchImpl: async () => assert.fail('fetch should not run') }), /only GET and HEAD/);

  base.probes = [{ id: 'cross-origin', path: 'https://example.com/collect', keyType: 'secret' }];
  await assert.rejects(() => runPreflight(base, { env, fetchImpl: async () => assert.fail('fetch should not run') }), /cross-origin URL refused/);
});

test('refuses malformed key families', async () => {
  const config = { projectUrl: 'https://project.supabase.co', probes: [{ id: 'test', path: '/auth/v1/settings', keyType: 'publishable' }] };
  await assert.rejects(() => runPreflight(config, {
    env: { SUPABASE_PUBLISHABLE_KEY: 'legacy-anon-key', SUPABASE_SECRET_KEY: secret },
    fetchImpl: async () => assert.fail('fetch should not run')
  }), /not an sb_publishable_ key/);
});
