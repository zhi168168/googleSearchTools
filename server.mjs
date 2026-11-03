import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import search from './api/search.mjs';
import health from './api/health.mjs';
const assets = new Map([['/', ['public/index.html', 'text/html; charset=utf-8']], ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']], ['/style.css', ['public/style.css', 'text/css; charset=utf-8']]]);
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/search') return search(req, res);
  if (pathname === '/api/health') return health(req, res);
  const asset = assets.get(pathname);
  if (!asset || !['GET', 'HEAD'].includes(req.method)) { res.statusCode = 404; return res.end('Not found'); }
  try { const content = await readFile(new URL(asset[0], import.meta.url)); res.setHeader('Content-Type', asset[1]); res.end(req.method === 'HEAD' ? undefined : content); }
  catch { res.statusCode = 500; res.end('Unable to load page'); }
});
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => console.log(`Search relay: http://127.0.0.1:${server.address().port}`));
