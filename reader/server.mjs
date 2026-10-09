#!/usr/bin/env node
// atelier reader —— 零依赖本地 Markdown 阅读器
// 启动：node reader/server.mjs   （Node >= 20，无需 npm install）
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..'); // 仓库根 = atelier/
const EXCLUDE = new Set(['.git', 'node_modules', 'reader']);

const PORT = Number(process.env.PORT || 8765);

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (EXCLUDE.has(name)) continue;
    const rel = base ? `${base}/${name}` : name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, name), rel)));
    else if (entry.isFile() && name.toLowerCase().endsWith('.md')) out.push(rel);
  }
  return out;
}

// 侧边栏排序：README 置顶，其余按字母序（qa 按日期-主题命名，字母序即时间序）
function sortDocs(list) {
  return list.sort((a, b) => {
    const top = (p) => p.includes('/') ? p.slice(0, p.indexOf('/')) : p;
    const aRoot = top(a) === 'README.md', bRoot = top(b) === 'README.md';
    if (aRoot !== bRoot) return aRoot ? -1 : 1;
    return a.localeCompare(b, 'zh-Hans-CN');
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const send = (code, type, body) => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    };

    if (url.pathname === '/api/docs') {
      const docs = sortDocs(await walk(ROOT));
      return send(200, 'application/json; charset=utf-8', JSON.stringify(docs));
    }

    if (url.pathname === '/api/recent') {
      // 每个文件最近一次被哪个 commit 改过；非 git 环境优雅降级为空数组
      const { execFile } = await import('node:child_process');
      const out = await new Promise((resolve) => {
        execFile('git', ['log', '-n', '40', '--name-only', '--diff-filter=AM',
          '--pretty=format:%x00%ad%x00%s', '--date=short'],
          { cwd: ROOT }, (err, stdout) => resolve(err ? '' : String(stdout)));
      });
      const recent = [];
      // pretty=%x00%ad%x00%s 产出的 piece 序列（去掉开头空块后）：date、subject+files、date、…
      const pieces = out.split('\0').slice(1);
      for (let i = 0; i + 1 < pieces.length; i += 2) {
        const date = pieces[i].trim();
        const [subject, ...files] = pieces[i + 1].split('\n');
        if (!subject || !date) continue;
        for (const f of files.map((s) => s.trim()).filter(Boolean)) {
          if (!f.toLowerCase().endsWith('.md')) continue;
          if (!recent.some((r) => r.file === f)) recent.push({ file: f, subject: subject.trim(), date });
        }
      }
      return send(200, 'application/json; charset=utf-8', JSON.stringify(recent.slice(0, 6)));
    }

    if (url.pathname === '/api/doc') {
      const rel = decodeURIComponent(url.searchParams.get('p') || '');
      const full = path.resolve(ROOT, rel);
      if (!full.startsWith(ROOT + path.sep) || !full.toLowerCase().endsWith('.md')) {
        return send(403, 'application/json', '{"error":"path outside repo or not .md"}');
      }
      try {
        return send(200, 'application/json; charset=utf-8',
          JSON.stringify({ path: rel, content: await readFile(full, 'utf8') }));
      } catch {
        return send(404, 'application/json', '{"error":"not found"}');
      }
    }

    // 静态文件：/ → index.html；/vendor/* → reader/vendor/*
    // Windows 下 path.resolve(dir, '/x') 会跳到盘符根，必须剥掉前导斜杠
    let file = null;
    if (url.pathname === '/') file = path.join(__dirname, 'index.html');
    else if (url.pathname.startsWith('/vendor/')) {
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const full = path.resolve(__dirname, rel);
      if (full.startsWith(__dirname + path.sep)) file = full;
    }
    if (!file) return send(404, 'text/plain', 'not found');
    const ext = path.extname(file).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    return send(200, mime, await readFile(file));
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: String(err && err.message || err) }));
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`端口 ${PORT} 被占用，换 ${PORT + 1} 重试…`);
    server.listen(PORT + 1);
  } else throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  const addr = `http://127.0.0.1:${server.address().port}/`;
  console.log(`atelier reader 已启动：${addr}（Ctrl+C 退出）`);
  // Windows 下顺手打开浏览器；失败不影响使用
  if (process.platform === 'win32') {
    import('node:child_process').then(({ spawn }) => {
      try { spawn('cmd', ['/c', 'start', '', addr], { detached: true, stdio: 'ignore' }).unref(); } catch {}
    });
  }
});
