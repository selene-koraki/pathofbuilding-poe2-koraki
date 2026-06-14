// Static file serving for the built SPA, with SPA-style index.html fallback.
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from './config.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (urlPath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  let rel = urlPath === '/' ? '/index.html' : urlPath;
  rel = rel.replace(/\.\.+/g, ''); // no traversal
  let file = path.join(config.appDist, rel);

  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    // SPA fallback to index.html for client-side routes.
    file = path.join(config.appDist, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('App not built yet. Run `npm run build` in web/app (or use `web/run.sh dev`).');
      return;
    }
  }

  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}
