import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchHandler, UPSTREAM } from '../lib/search.mjs';
const env = { GLORYCLOUD_API_KEY: 'provider-secret', RELAY_API_TOKEN: 'relay-secret' };
const query = 'inurl:blog + "leave a reply" + tool';
async function call({ body = { q: query }, method = 'POST', authorization = 'Bearer relay-secret', fetchImpl, configured = env, timeoutMs } = {}) {
  const req = { method, headers: { authorization, 'content-type': 'application/json' }, body };
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(text) { this.text = text; } };
  await createSearchHandler({ env: configured, fetchImpl, timeoutMs })(req, res); return res;
}
test('unauthorized requests never reach the provider', async () => {
  const response = await call({ authorization: 'Bearer wrong', fetchImpl() { assert.fail('provider called'); } });
  assert.equal(response.statusCode, 401);
});
test('unconfigured server fails closed', async () => {
  assert.equal((await call({ configured: {} })).statusCode, 503);
});
test('preserves exact query, page, provider error and HTTP status', async () => {
  const text = '{"code":41004,"msg":"来源IP不允许访问","data":null}';
  const response = await call({ body: { q: query, page: 3 }, fetchImpl: async (url, options) => {
    assert.equal(url.origin + url.pathname, UPSTREAM);
    assert.equal(url.searchParams.get('query'), query);
    assert.equal(url.searchParams.get('page'), '3');
    assert.equal(url.searchParams.get('engine'), 'google_search');
    assert.equal(url.searchParams.get('api_key'), env.GLORYCLOUD_API_KEY);
    assert.equal(options.redirect, 'error');
    return new Response(text, { status: 403 });
  } });
  assert.equal(response.statusCode, 403); assert.equal(response.text, text);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});
test('invalid input and arbitrary upstream overrides are rejected', async () => {
  for (const body of [{ q: '' }, { q: query, page: 0 }, { q: query, page: 1.5 }, { q: query, url: 'https://example.com' }, { q: query, domain: 'https://google.com' }, '{bad json']) {
    assert.equal((await call({ body, fetchImpl() { assert.fail('provider called'); } })).statusCode, 400);
  }
});
test('oversized parsed bodies are rejected before provider calls', async () => {
  assert.equal((await call({ body: { q: 'x'.repeat(9000) } })).statusCode, 413);
});
test('method and content type restrictions', async () => {
  assert.equal((await call({ method: 'GET' })).statusCode, 405);
});
test('secrets echoed by provider are redacted', async () => {
  const response = await call({ fetchImpl: async () => new Response(JSON.stringify({ api_key: env.GLORYCLOUD_API_KEY, token: env.RELAY_API_TOKEN, organic: [{ title: 'Result' }] })) });
  assert.ok(!response.text.includes(env.GLORYCLOUD_API_KEY)); assert.ok(!response.text.includes(env.RELAY_API_TOKEN));
  assert.equal(JSON.parse(response.text).organic[0].title, 'Result');
});
test('transport failures never expose credential-bearing URLs', async () => {
  const response = await call({ fetchImpl: async () => { throw Error(`failure: ${UPSTREAM}?api_key=${env.GLORYCLOUD_API_KEY}`); } });
  assert.equal(response.statusCode, 502); assert.ok(!response.text.includes(env.GLORYCLOUD_API_KEY));
});
test('timeouts have a distinct response', async () => {
  const response = await call({ fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } });
  assert.equal(response.statusCode, 504);
});
