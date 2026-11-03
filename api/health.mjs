export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('Allow', 'GET'); return res.end(JSON.stringify({ error: 'Method not allowed' })); }
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, configured: Boolean(process.env.GLORYCLOUD_API_KEY && process.env.RELAY_API_TOKEN), service: 'googlesearch-tools' }));
}
