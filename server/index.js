/* =====================================================================
 *  Wincode DMX Studio — local server and DMX bridge
 *    node server/index.js [--port 7750]
 *  1. serves web/ (the studio is a static site and also runs from GitHub Pages without this server)
 *  2. bridge: a browser cannot send UDP, so universes set to Art-Net or sACN arrive here over WebSocket (/ws) and are
 *     transmitted as real packets.  Frame: [3, proto (0 Art-Net, 1 sACN), universe lo, universe hi, host length, host…, 512 slots]
 *     — the same frame the Wincode simulator's server accepts, so either can be the bridge.
 *  Other transports (USB widgets through the OS, KiNET, …) would be added here the same way.
 * ===================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const ROOT = path.join(__dirname, '..', 'web');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const PORT = +(arg('--port') || process.env.PORT || 7750);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

/* ── packets ── */
const ART_ID = Buffer.from('Art-Net\0', 'latin1'), ACN_ID = Buffer.from([0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0, 0, 0]), CID = crypto.randomBytes(16);
const seq = new Map(), next = k => { const v = ((seq.get(k) || 0) % 255) + 1; seq.set(k, v); return v; };
function artDmx(universe, data) {
  const b = Buffer.alloc(18 + 512); ART_ID.copy(b, 0); b.writeUInt16LE(0x5000, 8); b.writeUInt16BE(14, 10); b[12] = next('a' + universe); b[13] = 0;
  b.writeUInt16LE(universe & 0x7fff, 14); b.writeUInt16BE(512, 16); Buffer.from(data).copy(b, 18); return b;
}
function sacn(universe, data) {
  const b = Buffer.alloc(638); b.writeUInt16BE(0x0010, 0); ACN_ID.copy(b, 4); b.writeUInt16BE(0x7000 | (638 - 16), 16); b.writeUInt32BE(4, 18); CID.copy(b, 22);
  b.writeUInt16BE(0x7000 | (638 - 38), 38); b.writeUInt32BE(2, 40); b.write('Wincode DMX Studio', 44, 'utf8'); b[108] = 100; b[111] = next('s' + universe); b.writeUInt16BE(universe, 113);
  b.writeUInt16BE(0x7000 | (638 - 115), 115); b[117] = 2; b[118] = 0xa1; b.writeUInt16BE(1, 121); b.writeUInt16BE(513, 123); b[125] = 0; Buffer.from(data).copy(b, 126); return b;
}
const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
udp.on('error', e => console.warn('[udp]', e.message));
udp.bind(() => { try { udp.setBroadcast(true); } catch (e) {} });
const stats = { artnet: 0, sacn: 0 };
function transmit(proto, universe, host, data) {
  if (proto === 1) { const u = universe || 1; udp.send(sacn(u, data), 5568, host && host !== 'multicast' ? host : `239.255.${(u >> 8) & 255}.${u & 255}`); stats.sacn++; }
  else { udp.send(artDmx(universe, data), 6454, host || '255.255.255.255'); stats.artnet++; }
}

/* ── http ── */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/status') { res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ app: 'wincode-dmx-studio', bridge: true, sent: stats })); }
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(buf);
  });
});
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', ws => ws.on('message', raw => {
  if (!Buffer.isBuffer(raw) || raw.length < 517 || raw[0] !== 3) return;
  const n = raw[4]; if (raw.length < 5 + n + 512) return;
  transmit(raw[1], raw[2] | (raw[3] << 8), raw.slice(5, 5 + n).toString('utf8'), raw.slice(5 + n, 5 + n + 512));
}));
server.listen(PORT, '127.0.0.1', () => console.log(`Wincode DMX Studio → http://127.0.0.1:${PORT}   (bridge: ws://127.0.0.1:${PORT}/ws → Art-Net 6454 / sACN 5568)`));
