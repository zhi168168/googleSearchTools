import { timingSafeEqual, randomUUID } from 'node:crypto';

export const UPSTREAM = 'https://serpapi.glorycloud.cn/serpapi/v1/search';
const MAX_BYTES = 8192;
class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (res, status, message, requestId) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: message, requestId }));
};
function authorized(header, token) {
  if (!token || typeof header !== 'string') return false;
  const supplied = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${token}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
async function bodyOf(req) {
  if (Number(req.headers['content-length']) > MAX_BYTES) throw new RequestError(413, '请求体不能超过 8 KB');
  if (req.body !== undefined) {
    const serialized = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(serialized) > MAX_BYTES) throw new RequestError(413, '请求体不能超过 8 KB');
    try { return typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch { throw new RequestError(400, '请求体必须是有效 JSON'); }
  }
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BYTES) throw new RequestError(413, '请求体不能超过 8 KB');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestError(400, '请求体必须是有效 JSON'); }
}
export function parameters(input, env) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RequestError(400, '请求体必须是 JSON 对象');
  const allowed = new Set(['q', 'page', 'domain', 'host_language', 'geo_location']);
  if (Object.keys(input).some(k => !allowed.has(k))) throw new RequestError(400, '包含不支持的参数');
  if (typeof input.q !== 'string' || !input.q.trim() || input.q.length > 2000) throw new RequestError(400, 'q 必须是 1–2000 字符的搜索词');
  const page = input.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 100) throw new RequestError(400, 'page 必须是 1–100 的整数');
  const domain = input.domain ?? env.SEARCH_DOMAIN ?? 'com.hk';
  const language = input.host_language ?? env.SEARCH_LANGUAGE ?? 'zh-CN';
  if (typeof domain !== 'string' || !/^[a-z]{2,}(?:\.[a-z]{2,}){0,2}$/.test(domain)) throw new RequestError(400, 'domain 应填写 com.hk 或 com 等后缀');
  if (typeof language !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(language)) throw new RequestError(400, 'host_language 格式不正确');
  const result = { engine: 'google_search', query: input.q, domain, host_language: language, page: String(page), dataFormat: 'json' };
  if (input.geo_location !== undefined) {
    if (typeof input.geo_location !== 'string' || input.geo_location.length > 200 || !input.geo_location.trim()) throw new RequestError(400, 'geo_location 必须是 1–200 字符的文本');
    result.geo_location = input.geo_location;
  }
  return result;
}
function redact(text, secrets) {
  let result = text;
  for (const secret of secrets.filter(Boolean)) {
    for (const variant of new Set([secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)])) result = result.split(variant).join('[REDACTED]');
  }
  return result;
}
export function createSearchHandler({ env = process.env, fetchImpl = fetch, timeoutMs = 55000 } = {}) {
  return async (req, res) => {
    const requestId = randomUUID();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Relay-Request-Id', requestId);
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return fail(res, 405, '请使用 POST', requestId); }
    if (!env.RELAY_API_TOKEN || !env.GLORYCLOUD_API_KEY) return fail(res, 503, '服务端尚未配置搜索密钥和调用令牌', requestId);
    if (!authorized(req.headers.authorization, env.RELAY_API_TOKEN)) return fail(res, 401, '调用令牌无效', requestId);
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return fail(res, 415, 'Content-Type 必须为 application/json', requestId);
    try {
      const params = parameters(await bodyOf(req), env);
      const url = new URL(UPSTREAM);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      url.searchParams.set('api_key', env.GLORYCLOUD_API_KEY);
      const upstream = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      // Keep the response structure and business error codes. Only redact secrets
      // if the provider happens to echo them in a response.
      const text = redact(await upstream.text(), [env.GLORYCLOUD_API_KEY, env.RELAY_API_TOKEN]);
      res.statusCode = upstream.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('X-Upstream-Status', String(upstream.status));
      res.end(text);
    } catch (error) {
      if (error instanceof RequestError) return fail(res, error.status, error.message, requestId);
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return fail(res, 504, '上游请求超时，请稍后手动重试', requestId);
      // Never expose an exception URL because it contains the provider key.
      return fail(res, 502, '无法连接上游搜索接口', requestId);
    }
  };
}
