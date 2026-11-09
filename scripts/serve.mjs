import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const portIndex = process.argv.indexOf('--port');
const port = portIndex === -1 ? 4178 : Number(process.argv[portIndex + 1]);
const hostIndex = process.argv.indexOf('--host');
if (hostIndex !== -1 && process.argv[hostIndex + 1] !== '127.0.0.1') {
  throw new Error('仅允许监听本机127.0.0.1。');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('端口无效。');
const types = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const relative = name === '/' ? 'index.html' : name.slice(1);
    if (relative !== 'index.html' && !relative.startsWith('src/') && !relative.startsWith('data/')) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const target = path.resolve(root, relative);
    if (!target.startsWith(root) || !types[path.extname(target)]) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const bytes = await readFile(target);
    res.setHeader('Content-Type', `${types[path.extname(target)]}; charset=utf-8`);
    res.writeHead(200);
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    res.writeHead(error instanceof URIError ? 400 : 404);
    res.end('Resource unavailable');
  }
});
server.on('error', error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`雅思学习区 D2a: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close());
}
