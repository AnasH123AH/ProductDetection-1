const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5500;
const API_PORT = 8000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const reqUrl = req.url;
  
  // Proxy /api/* to Python Backend
  if (reqUrl.startsWith('/api/')) {
    const proxyReq = http.request({
      host: '127.0.0.1',
      port: API_PORT,
      path: reqUrl,
      method: req.method,
      headers: req.headers
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'Access-Control-Allow-Origin': '*'
      });
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      res.writeHead(503, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ 
        error: 'Detection API service is unavailable. Please ensure python backend/app.py is running on port 8000.',
        code: 'BACKEND_OFFLINE'
      }));
    });

    req.pipe(proxyReq, { end: true });
    return;
  }

  // Static File Server & Friendly URL Aliases
  let cleanUrl = reqUrl.split('?')[0];
  if (cleanUrl === '/') cleanUrl = '/index.html';
  if (cleanUrl === '/admin' || cleanUrl === '/admin/') cleanUrl = '/admin.html';
  if (cleanUrl === '/admin/login' || cleanUrl === '/admin-login') cleanUrl = '/admin-login.html';
  if (cleanUrl === '/app' || cleanUrl === '/dashboard' || cleanUrl === '/app/') cleanUrl = '/app.html';

  const safePath = path.normalize(cleanUrl).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`=======================================================`);
  console.log(` VisionaryAI Web Application running at:`);
  console.log(` http://127.0.0.1:${PORT} (Sign-In & Main Platform)`);
  console.log(` Proxies /api/ requests to Python CV API (Port ${API_PORT})`);
  console.log(`=======================================================`);
});
