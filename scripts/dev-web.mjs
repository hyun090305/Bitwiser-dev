import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDevShell } from './dev-shell.cjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon' };
export function createDevServer() {
  return createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (name === '/service-worker.js' || name === '/service-worker-demo.js') { res.writeHead(404).end(); return; }
      const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
      // Serve only game resources, never .git, Electron code or local profiles.
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (!file.startsWith(root + path.sep) || !mime[path.extname(file)] || relative.split('/').some(p => p.startsWith('.'))
        || !/^(src\/|assets\/|[^/]+$)/.test(relative)) { res.writeHead(403).end(); return; }
      let body = await fs.readFile(file);
      if (relative === 'index.html') body = renderDevShell(body.toString('utf8'));
      res.writeHead(200, { 'Content-Type': `${mime[path.extname(file)]}; charset=utf-8`, 'Cache-Control': 'no-store' }).end(body);
    } catch { res.writeHead(404).end('Not found'); }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // A dedicated origin keeps all settings, hints and progress separate too.
  const port = Number(process.env.DEV_PORT || 8731);
  createDevServer().listen(port, '127.0.0.1', () => console.log(`Bitwiser DEV: http://127.0.0.1:${port} (use this port only for DEV)`));
}
