'use strict';
// CIT Bus Tracker — backend (Node.js, zero dependencies)
// REST API + Server-Sent Events for live bus positions + JSON-file persistence.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const SIM = parseFloat(process.env.SIM_SPEED || '0.5');   // simulated minutes advanced per 3-second tick
const DATA_DIR = path.join(__dirname, 'data'), DB_FILE = path.join(DATA_DIR, 'db.json'), PUB = path.join(__dirname, 'public');
const seed = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'seed.json'), 'utf8'));

// ---------- helpers ----------
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const nowStr = () => new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s/g, ' ').toUpperCase();
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

// ---------- persistence (absences, complaints, notices, logs, feedback, sos) ----------
let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
catch {
  db = {
    absences: seed.absences.map(a => ({ ...a, date: today() })), complaints: seed.complaints, notices: seed.notices,
    logs: seed.logs.map(l => ({ ...l, date: today() })), feedback: [], sos: [], seq: 100
  };
}
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), () => { }), 200); };

// ---------- live bus simulation (in memory) ----------
const buses = JSON.parse(JSON.stringify(seed.buses));
for (const b of Object.values(buses)) {
  b.totalMin = b.etaMin > 0 ? b.etaMin / (1 - b.progress / 100) : 0;
  b.eta = b.status === 'arrived' ? 'Arrived' : b.status === 'delayed' ? `Delayed ${b.delay}min` : b.etaMin + ' min';
}
const stats = () => ({
  onRoad: Object.values(buses).filter(b => b.status !== 'arrived').length,
  aboard: Object.values(buses).reduce((s, b) => s + b.picked, 0),
  absent: db.absences.filter(a => a.date === today()).length
});
const snapshot = () => ({
  buses: Object.fromEntries(Object.entries(buses).map(([id, b]) => [id, { ...b, progress: Math.round(b.progress * 10) / 10 }])),
  stats: stats()
});
const todayAbsences = () => db.absences.filter(a => a.date === today());
const todayLogs = () => db.logs.filter(l => !l.date || l.date === today());

function addNotice(icon, bg, title, body) {
  db.notices.unshift({ icon, bg, title, body, time: nowStr() });
  db.notices.length = Math.min(db.notices.length, 50);
  save(); broadcast('notice', db.notices);
}

// ---------- SSE ----------
const clients = new Set();
const send = (res, ev, data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
const broadcast = (ev, data, staffOnly) => clients.forEach(c => { if (!staffOnly || c.user.role === 'staff') send(c.res, ev, data); });

let tick = 0;
setInterval(() => {
  for (const [id, b] of Object.entries(buses)) {
    if (b.status === 'arrived') continue;
    b.progress = Math.min(100, b.progress + (b.status === 'delayed' ? 0.5 : 1) * SIM / b.totalMin * 100);
    if (b.progress >= 100) {
      b.progress = 100; b.status = 'arrived'; b.eta = 'Arrived';
      addNotice('✅', '#D1FAE5', `Bus ${id} — ${b.name} arrived at CIT`, `Bus ${id} reached CIT Main Gate. Driver: ${b.driver}.`);
    } else {
      b.eta = b.status === 'delayed' ? `Delayed ${b.delay}min` : Math.max(1, Math.round(b.totalMin * (1 - b.progress / 100))) + ' min';
    }
  }
  broadcast('buses', snapshot());
  if (++tick % 8 === 0) clients.forEach(c => c.res.write(': ping\n\n'));
}, 3000);

// ---------- routes ----------
const sessions = new Map(), routes = [];
const route = (m, p, auth, h) => routes.push({ m, auth, h, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') });

route('POST', '/api/login', false, ({ body }) => {
  const role = body.role === 'staff' ? 'staff' : 'student', name = str(body.name, 60);
  let u;
  if (role === 'student') {
    const roll = str(body.roll, 20).toUpperCase(), bus = String(body.bus);
    if (!name || !roll) fail(400, 'Name and roll number are required');
    if (!buses[bus]) fail(400, 'Please choose a valid bus');
    u = { role, name, roll, bus };
  } else {
    const staffId = str(body.staffId, 20).toUpperCase();
    if (!name || !staffId) fail(400, 'Staff name and Staff ID are required');
    u = { role, name, staffId, staffRole: str(body.staffRole, 30) || 'Transport Office', bus: '1' };
  }
  const token = crypto.randomBytes(16).toString('hex');
  sessions.set(token, u);
  return { token, user: u };
});
route('GET', '/api/me', true, ({ user }) => ({ user }));
route('POST', '/api/logout', true, ({ token }) => { sessions.delete(token); return { ok: true }; });
route('GET', '/api/health', false, () => ({ ok: true, time: nowStr() }));
route('GET', '/api/buses', true, () => snapshot());

route('GET', '/api/absences', true, () => todayAbsences());
route('POST', '/api/absences', 'student', ({ body, user }) => {
  const bus = String(body.bus || user.bus);
  if (!buses[bus]) fail(400, 'Invalid bus');
  const trip = ['Full day', 'Morning only', 'Evening only'].includes(body.trip) ? body.trip : 'Full day';
  const a = { name: str(body.name, 60) || user.name, roll: user.roll, bus, trip, reason: str(body.reason, 120), date: today() };
  db.absences = db.absences.filter(x => !(x.roll === a.roll && x.date === a.date));
  db.absences.push(a); save();
  broadcast('absences', todayAbsences()); broadcast('buses', snapshot());
  return a;
});
route('DELETE', '/api/absences/:roll', 'student', ({ params, user }) => {
  if (decodeURIComponent(params.roll).toUpperCase() !== user.roll) fail(403, 'You can only cancel your own absence');
  db.absences = db.absences.filter(x => !(x.roll === user.roll && x.date === today())); save();
  broadcast('absences', todayAbsences()); broadcast('buses', snapshot());
  return { ok: true };
});

route('GET', '/api/complaints', true, ({ user }) => (user.role === 'staff' ? db.complaints : db.complaints.filter(c => c.roll === user.roll)).slice().reverse());
route('POST', '/api/complaints', true, ({ body, user }) => {
  const description = str(body.description, 500);
  if (description.length < 5) fail(400, 'Please describe the issue');
  const c = {
    id: ++db.seq, roll: user.roll || user.staffId, name: user.name, type: str(body.type, 40) || 'Other Issue',
    bus: str(body.bus, 40), description, when: str(body.when, 60), status: 'Pending', created: nowStr()
  };
  db.complaints.push(c); save(); return c;
});

route('GET', '/api/notices', true, () => db.notices);

route('GET', '/api/logs', 'staff', () => todayLogs());
route('POST', '/api/logs', 'staff', ({ body, user }) => {
  const bus = String(body.bus), action = String(body.action);
  if (!buses[bus]) fail(400, 'Select a valid bus');
  if (!['entry', 'exit', 'delay', 'breakdown', 'cancel'].includes(action)) fail(400, 'Invalid action');
  const hc = body.headcount === '' || body.headcount == null ? '' : String(Math.max(0, parseInt(body.headcount, 10) || 0));
  const l = { bus, action, time: str(body.time, 12) || nowStr(), hc, notes: str(body.notes, 120), by: user.name, date: today() };
  db.logs.unshift(l);
  const b = buses[bus];
  if (action === 'entry') { b.progress = 100; b.status = 'arrived'; b.eta = 'Arrived'; addNotice('✅', '#D1FAE5', `Bus ${bus} — ${b.name} entered CIT gate`, `Logged by ${user.name} at ${l.time}.`); }
  if (action === 'delay') { b.status = 'delayed'; b.delay = 20; b.eta = 'Delayed 20min'; addNotice('⚠️', '#FEF3C7', `Bus ${bus} — ${b.name} delayed`, l.notes || 'Delayed due to traffic. Driver informed.'); }
  if (action === 'breakdown') addNotice('🔧', '#FFEDD5', `Bus ${bus} — ${b.name} breakdown`, l.notes || 'Breakdown reported. Alternate arrangements in progress.');
  if (action === 'cancel') addNotice('❌', '#FEE2E2', `Bus ${bus} — ${b.name} trip cancelled`, l.notes || 'Trip cancelled. Please contact the transport office.');
  save(); broadcast('logs', todayLogs(), true); broadcast('buses', snapshot());
  return l;
});

route('POST', '/api/feedback', true, ({ body, user }) => {
  const rating = parseInt(body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) fail(400, 'Rating must be 1–5');
  db.feedback.push({ roll: user.roll, bus: user.bus, rating, comment: str(body.comment, 300), time: nowStr(), date: today() }); save();
  return { ok: true };
});
route('POST', '/api/sos', true, ({ body, user }) => {
  const s = { type: str(body.type, 60) || 'Emergency', name: user.name, roll: user.roll || user.staffId, bus: user.bus, time: nowStr(), date: today() };
  db.sos.push(s); save(); broadcast('sos', s, true);
  console.log('🆘 SOS:', s);
  return { ok: true };
});

route('GET', '/api/stream', true, ({ req, res, user }) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const c = { res, user }; clients.add(c);
  req.on('close', () => clients.delete(c));
  send(res, 'buses', snapshot());
});

// ---------- HTTP plumbing ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
const readBody = req => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > 1e5) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); } });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
});
function serveStatic(res, pathname) {
  let p;
  try { p = path.normalize(path.join(PUB, pathname === '/' ? 'index.html' : decodeURIComponent(pathname))); } catch { p = ''; }
  if (!p.startsWith(PUB)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'), pathname = url.pathname;
  if (!pathname.startsWith('/api/')) return serveStatic(res, pathname);
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '') || url.searchParams.get('token') || '';
    const user = sessions.get(token) || null;
    const r = routes.find(r => r.m === req.method && r.re.test(pathname));
    if (!r) fail(404, 'Not found');
    if (r.auth && !user) fail(401, 'Please log in');
    if (r.auth === 'staff' && user.role !== 'staff') fail(403, 'Staff only');
    if (r.auth === 'student' && user.role !== 'student') fail(403, 'Students only');
    const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {};
    const out = await r.h({ req, res, params: pathname.match(r.re).groups || {}, body, user, token });
    if (out !== undefined) json(res, 200, out);
  } catch (e) {
    if (!e.status) console.error(e);
    json(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
}).listen(PORT, () => console.log(`🚌 CIT Bus Tracker running → http://localhost:${PORT}`));
