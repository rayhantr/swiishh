/**
 * Zero-dependency static dev server — `yarn start` works offline.
 * Serves the repo root on http://localhost:3000 (PORT env to change).
 * Run directly with `node tools/serve.ts` (Node ≥ 22.18 strips the types).
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (path === '' || path === '.') path = 'index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) throw new Error('traversal');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    // Serve the on-brand 404 page (parity with GitHub Pages), plain text if absent.
    try {
      const body = await readFile(join(ROOT, '404.html'));
      res.writeHead(404, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': MIME['.txt'] });
      res.end('not found');
    }
  }
});

// If the port is taken (another dev server, a previous run), walk up to the
// next free one instead of crashing with EADDRINUSE.
let port = PORT;
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE' && port < PORT + 20) {
    console.log(`port ${port} is in use, trying ${port + 1}…`);
    server.listen(++port);
  } else {
    throw err;
  }
});

server.listen(port, () => {
  console.log(`SWIISHH dev server → http://localhost:${port}`);
});
