// Local server: same API handler as production, but state lives in memory. Used for screenshots, tests and offline dev.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import handler, { store } from './api/data.js';
import { seed } from './public/logic.js';
let mem = seed();
store.load = async () => JSON.parse(JSON.stringify(mem));
store.save = async (s) => { mem = JSON.parse(JSON.stringify(s)); };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const port = Number(process.env.PORT || 3100);
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/api/data') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      req.body = body; const r = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { res.writeHead(this.statusCode, { ...this.headers, 'content-type': 'application/json' }); res.end(JSON.stringify(o)); } };
      await handler(req, r);
    });
    return;
  }
  let f = path.join('public', u.pathname === '/' ? 'index.html' : u.pathname);
  if (!f.startsWith('public')) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end('Not found'); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(d); });
}).listen(port, () => console.log('Wardia dev server on http://localhost:' + port));
