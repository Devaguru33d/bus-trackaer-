// ============================================================
// DATA
// ============================================================
let BUSES = {}, NOTICES = [], absentList = [], busLog = [];   // filled from the API

// ============================================================
// STATE
// ============================================================
let user = { role: 'student', name: 'Priya Sharma', roll: 'CIT2021CS042', bus: '1' };
let loginRole = 'student', isAbsent = false, starRating = 0, selectedCompType = 'Bus Late / Delay';

// ============================================================
// LOGIN
// ============================================================
function setRole(r) {
    loginRole = r;
    document.querySelectorAll('.role-tab').forEach((t, i) => t.classList.toggle('active', i === (r === 'student' ? 0 : 1)));
    document.getElementById('stud-fields').style.display = r === 'student' ? '' : 'none';
    document.getElementById('staff-fields').style.display = r === 'staff' ? '' : 'none';
}
// ============================================================
// INIT
// ============================================================
function setGreeting() {
    const h = new Date().getHours(), g = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    document.getElementById('greeting').textContent = 'Good ' + g + ', ' + user.name.split(' ')[0] + ' 👋';
    const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const nav = document.getElementById('nav-av'); if (nav) nav.textContent = initials;
}
function setDate() {
    const d = new Date(), days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        ms = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const el = document.getElementById('today-date');
    if (el) el.textContent = days[d.getDay()] + ', ' + d.getDate() + ' ' + ms[d.getMonth()] + ' ' + d.getFullYear();
}
function updateClock() {
    const n = new Date(), h = n.getHours(), m = n.getMinutes(), ap = h >= 12 ? 'PM' : 'AM', hh = h % 12 || 12;
    const el = document.getElementById('nav-clock');
    if (el) el.textContent = hh + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
}

// ============================================================
// PAGES
// ============================================================
const PAGES = ['home', 'live', 'absent', 'complaint', 'notices', 'staff', 'profile'];
function showPage(p) {
    PAGES.forEach(pg => {
        const el = document.getElementById('page-' + pg); if (el) el.classList.remove('active');
        const bn = document.getElementById('bn-' + pg); if (bn) bn.classList.remove('active');
    });
    const pel = document.getElementById('page-' + p); if (pel) pel.classList.add('active');
    const bel = document.getElementById('bn-' + p); if (bel) bel.classList.add('active');
    if (p === 'absent') renderAbsentPage();
    if (p === 'staff') { renderLogList(); renderRouteSummary(); }
    if (p === 'live') { renderTrack(); renderLiveAll(); }
    if (p === 'notices') renderNotices();
    if (p === 'complaint') loadComplaints();
    if (p === 'profile') updateProfile();
    window.scrollTo(0, 0);
}

// ============================================================
// HOME
// ============================================================
function updateHero(bid) {
    const b = BUSES[bid]; if (!b) return;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('h-busnum', 'Bus ' + bid);
    set('h-route', b.name + ' → CIT Kundrathur');
    set('h-eta', b.eta);
    const bar = document.getElementById('h-bar'); if (bar) bar.style.width = b.progress + '%';
    set('h-pct', Math.round(b.progress) + '% complete');
    set('hs-pickup', b.pickup); set('hs-drop', b.drop);
    set('eve-time', b.drop); set('eve-loc', 'Reach ' + b.name);
    const badgeEl = document.getElementById('h-badge');
    if (badgeEl) {
        if (b.status === 'arrived') badgeEl.innerHTML = '<span class="badge b-green"><span class="dot dot-g"></span>Arrived!</span>';
        else if (b.status === 'delayed') badgeEl.innerHTML = '<span class="badge b-red"><span class="dot dot-r"></span>Delayed</span>';
        else badgeEl.innerHTML = '<span class="badge b-amber"><span class="dot dot-a"></span>On the way</span>';
    }
    const absCnt = absentList.filter(a => a.bus === bid).length;
    set('eve-absent', absCnt + ' absent today');
    set('eve-students', (b.total - absCnt) + ' students on evening bus');
}
function renderAllBuses() {
    const el = document.getElementById('all-buses'); if (!el) return;
    el.innerHTML = Object.entries(BUSES).map(([id, b]) => {
        const mine = id === user.bus;
        const bc = b.status === 'arrived' ? 'b-green' : b.status === 'delayed' ? 'b-red' : 'b-amber';
        const lbl = b.status === 'arrived' ? '✅ Arrived' : b.status === 'delayed' ? '⚠ Delayed' : b.eta;
        return `<div class="bus-row" ${mine ? 'style="background:var(--primary-light);border-radius:10px;padding:10px;margin:0 -2px"' : ''}>
      <div class="bus-num-circle" style="background:${b.bg};color:${b.color};border-color:${b.color}33">${id}</div>
      <div class="bus-info">
<div class="bus-name">${b.name}${mine ? ' <span style="background:var(--primary);color:white;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:800;margin-left:4px">MINE</span>' : ''}</div>
<div class="bus-sub">Driver: ${b.driver} &nbsp;·&nbsp; ${b.picked}/${b.total} students</div>
      </div>
      <div class="bus-right"><span class="badge ${bc}">${lbl}</span><div class="bus-seats">${Math.round(b.progress)}% done</div></div>
    </div>`;
    }).join('');
}
// ============================================================
// LIVE TRACK
// ============================================================
function renderTrack() {
    const id = document.getElementById('trk-sel')?.value || '1';
    const b = BUSES[id];
    const set = (eid, v) => { const e = document.getElementById(eid); if (e) e.textContent = v; };
    set('trk-title', 'Bus ' + id); set('trk-driver', b.driver);
    set('trk-count', b.picked + '/' + b.total);
    set('trk-eta', b.status === 'arrived' ? 'Arrived!' : b.eta);
    const badge = document.getElementById('trk-badge');
    if (badge) {
        if (b.status === 'arrived') { badge.className = 'badge b-green'; badge.textContent = 'Arrived'; }
        else if (b.status === 'delayed') { badge.className = 'badge b-red'; badge.textContent = 'Delayed ⚠'; }
        else { badge.className = 'badge b-amber'; badge.textContent = 'In transit'; }
    }
    const stepsDone = b.progress >= 100 ? b.stops.length : Math.floor(b.progress / 25);
    const tl = document.getElementById('trk-tl'); if (!tl) return;
    tl.innerHTML = b.stops.map((s, i) => {
        const done = i < stepsDone || b.progress >= 100, curr = !done && i === stepsDone && b.progress < 100;
        const dc = done ? 'done' : curr ? 'curr' : 'up';
        const sc = done ? 'done' : (!curr ? 'up' : '');
        const lc = done ? 'done' : '';
        const note = done ? 'Picked up students' : (curr ? '🚌 Bus is here right now' : '');
        return `<div class="tl-row">
      <div class="tl-spine"><div class="tl-dot ${dc}"></div>${i < b.stops.length - 1 ? `<div class="tl-line ${lc}"></div>` : ''}</div>
      <div class="tl-body">
<div class="tl-time">${addMins(b.pickup, i * 10)}</div>
<div class="tl-stop ${sc}">${s}${curr ? ' <span style="background:#ECFDF5;color:#065F46;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:800">NOW</span>' : ''}</div>
${note ? `<div class="tl-note">${note}</div>` : ''}
      </div>
    </div>`;
    }).join('');
}
function addMins(t, m) {
    const [hm, ap] = t.split(' '); const [h, mn] = hm.split(':');
    let total = parseInt(h) % 12 * 60 + parseInt(mn) + (ap === 'PM' ? 720 : 0) + m;
    const hh = Math.floor(total / 60) % 12 || 12, mm = total % 60, a = Math.floor(total / 60) >= 12 ? 'PM' : 'AM';
    return hh + ':' + (mm < 10 ? '0' : '') + mm + ' ' + a;
}
function renderLiveAll() {
    const el = document.getElementById('live-all'); if (!el) return;
    el.innerHTML = Object.entries(BUSES).map(([id, b]) => {
        const bc = b.status === 'arrived' ? 'b-green' : b.status === 'delayed' ? 'b-red' : 'b-amber';
        const lbl = b.status === 'arrived' ? 'Arrived' : b.status === 'delayed' ? 'Delayed' : b.eta;
        return `<div class="bus-row">
      <div class="bus-num-circle" style="background:${b.bg};color:${b.color};border-color:${b.color}33">${id}</div>
      <div class="bus-info"><div class="bus-name">${b.name}</div><div class="bus-sub">${b.picked}/${b.total} · ${b.driver}</div></div>
      <span class="badge ${bc}">${lbl}</span>
    </div>`;
    }).join('');
}

// ============================================================
// ABSENT
// ============================================================
// ============================================================
// COMPLAINT
// ============================================================
function selectComp(el, type) {
    document.querySelectorAll('.comp-type').forEach(c => c.classList.remove('sel'));
    el.classList.add('sel'); selectedCompType = type;
}
// ============================================================
// STAFF LOG
// ============================================================
function nowStr() { const n = new Date(), h = n.getHours(), m = n.getMinutes(); return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' AM' : ' PM'); }
function renderRouteSummary() {
    const el = document.getElementById('route-summary'); if (!el) return;
    el.innerHTML = Object.entries(BUSES).map(([id, b]) => {
        const col = b.status === 'arrived' ? 'var(--green)' : b.status === 'delayed' ? 'var(--red)' : 'var(--primary)';
        return `<div style="padding:8px 0;border-bottom:1px solid var(--bg2)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
<div style="font-weight:800;font-size:13px;color:var(--text1)">Bus ${id} — ${b.name}</div>
<span style="font-size:11px;font-weight:700;color:${col}">${b.status === 'arrived' ? '✅ Arrived' : b.status === 'delayed' ? '⚠ Delayed' : b.eta + ' away'}</span>
      </div>
      <div style="height:4px;background:var(--bg2);border-radius:3px;overflow:hidden">
<div style="width:${b.progress}%;height:100%;background:${col};border-radius:3px;transition:width 1s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text4);margin-top:3px;font-weight:600">
<span>${b.picked}/${b.total} students</span><span>${Math.round(b.progress)}%</span>
      </div>
    </div>`;
    }).join('');
}

// ============================================================
// NOTICES
// ============================================================
// ============================================================
// PROFILE
// ============================================================
function updateProfile() {
    const b = BUSES[user.bus];
    const initials = user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('prof-av', initials); set('nav-av', initials);
    set('prof-name', user.name); set('pf-roll', user.roll);
    set('prof-role', 'Day Scholar · Bus ' + user.bus + (b ? ' · ' + b.name : ''));
    set('pf-bus', 'Bus ' + user.bus + (b ? ' — ' + b.name : ''));
    set('pf-stop', b ? b.stops[0] : '—');
    set('pf-pickup', b ? b.pickup : '—');
    set('pf-drop', b ? b.drop : '—');
    set('pf-driver', b ? b.driver : '—');
    set('pf-absent', absentList.filter(a => a.roll === user.roll).length + ' days');
}
function rateStar(n) { starRating = n; document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('on', i < n)); }
// ============================================================
// MODAL / SOS
// ============================================================
function openModal(id) { document.getElementById('modal-' + id).classList.add('open'); }
function closeModal(id) { document.getElementById('modal-' + id).classList.remove('open'); }
// ============================================================
// TOAST
// ============================================================
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3200);
}
    

// ============================================================
// API LAYER — talks to server.js
// ============================================================
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let token = sessionStorage.getItem('cit_token') || '', es = null, intervalsOn = false;

async function api(path, opts = {}) {
    const res = await fetch('/api' + path, {
        method: opts.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) { token = ''; sessionStorage.removeItem('cit_token'); showLogin(); }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// ---------- login / logout ----------
async function doLogin() {
    const err = $('login-err'); err.style.display = 'none';
    try {
        const body = loginRole === 'student'
            ? { role: 'student', name: $('inp-name').value, roll: $('inp-roll').value, bus: $('inp-bus').value }
            : { role: 'staff', name: $('inp-staffname').value, staffId: $('inp-staffid').value, staffRole: $('inp-staffrole').value };
        const r = await api('/login', { method: 'POST', body });
        token = r.token; sessionStorage.setItem('cit_token', token); user = r.user;
        await enterApp();
    } catch (e) { err.textContent = e.message; err.style.display = 'block'; }
}
async function enterApp() {
    $('login-screen').style.display = 'none'; $('app-screen').style.display = 'block';
    await initApp(); showPage(user.role === 'staff' ? 'staff' : 'home');
}
function showLogin() {
    if (es) { es.close(); es = null; }
    $('app-screen').style.display = 'none'; $('login-screen').style.display = 'flex';
}
async function doLogout() {
    try { await api('/logout', { method: 'POST' }); } catch { }
    token = ''; sessionStorage.removeItem('cit_token'); showLogin();
}

// ---------- init + live stream ----------
async function initApp() {
    const [b, a, n] = await Promise.all([api('/buses'), api('/absences'), api('/notices')]);
    BUSES = b.buses; absentList = a; NOTICES = n;
    busLog = user.role === 'staff' ? await api('/logs') : [];
    isAbsent = absentList.some(x => x.roll === user.roll);
    $('bn-staff').style.display = user.role === 'staff' ? '' : 'none';
    $('abs-bus').value = user.bus; $('abs-name').value = user.name; $('abs-roll').value = user.roll || user.staffId || ''; $('abs-roll').readOnly = true;
    $('trk-sel').value = user.bus; $('comp-bus').selectedIndex = Number(user.bus) - 1;
    updateClock(); setGreeting(); setDate();
    if (!intervalsOn) { intervalsOn = true; setInterval(updateClock, 30000); }
    updateHero(user.bus); renderAllBuses(); renderAbsentPage(); renderLogList(); renderRouteSummary();
    renderTrack(); renderLiveAll(); renderNotices(); updateProfile(); loadComplaints(); applyBuses(b); connectStream();
}
function connectStream() {
    if (es) es.close();
    es = new EventSource('/api/stream?token=' + encodeURIComponent(token));
    es.addEventListener('buses', e => applyBuses(JSON.parse(e.data)));
    es.addEventListener('absences', e => { absentList = JSON.parse(e.data); isAbsent = absentList.some(x => x.roll === user.roll); renderAbsentPage(); });
    es.addEventListener('notice', e => { NOTICES = JSON.parse(e.data); renderNotices(); showToast('🔔 ' + NOTICES[0].title); });
    es.addEventListener('logs', e => { if (user.role === 'staff') { busLog = JSON.parse(e.data); renderLogList(); } });
    es.addEventListener('sos', e => { const s = JSON.parse(e.data); showToast('🆘 SOS: ' + s.type + ' — ' + s.name); });
}
function applyBuses({ buses, stats }) {
    BUSES = buses;
    updateHero(user.bus); renderAllBuses();
    const active = document.querySelector('.page.active')?.id;
    if (active === 'page-live') { renderTrack(); renderLiveAll(); }
    if (active === 'page-staff') renderRouteSummary();
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('m-road', stats.onRoad); set('m-aboard', stats.aboard); set('m-absent', stats.absent + ' marked absent');
}

// ---------- absence ----------
function renderAbsentPage() {
    const staff = user.role === 'staff';
    $('already-absent').style.display = isAbsent && !staff ? 'block' : 'none';
    $('abs-form').style.display = isAbsent || staff ? 'none' : 'block';
    renderAbsentList();
}
function renderAbsentList() {
    const list = user.role === 'staff' ? absentList : absentList.filter(a => a.bus === user.bus);
    $('abs-list').innerHTML = list.length === 0 ? '<div class="empty">No absences for your bus today 🎉</div>' :
        list.map(a => `<div class="abs-row">
      <div><div class="abs-name">${esc(a.name)}</div><div class="abs-roll">${esc(a.roll)} · ${esc(a.trip)}${user.role === 'staff' ? ' · Bus ' + esc(a.bus) : ''}</div></div>
      <span class="badge b-red">${a.trip === 'Full day' ? 'Full day' : 'Partial'}</span></div>`).join('');
    $('abs-badge').textContent = list.length + ' absent';
    $('abs-banner').style.display = isAbsent ? 'flex' : 'none';
    $('abs-pip').style.display = isAbsent ? 'block' : 'none';
    updateHero(user.bus);
}
async function submitAbsent() {
    const name = $('abs-name').value.trim();
    if (!name) { showToast('⚠ Fill in your name'); return; }
    try {
        await api('/absences', { method: 'POST', body: { name, bus: $('abs-bus').value, trip: $('abs-trip').value, reason: $('abs-reason').value } });
        absentList = await api('/absences'); isAbsent = true; renderAbsentPage();
        showToast('✅ Absent marked — Driver notified!');
    } catch (e) { showToast('⚠ ' + e.message); }
}
async function cancelAbsent() {
    try {
        await api('/absences/' + encodeURIComponent(user.roll), { method: 'DELETE' });
        absentList = await api('/absences'); isAbsent = false; renderAbsentPage();
        showToast('👍 Absence cancelled — See you today!');
    } catch (e) { showToast('⚠ ' + e.message); }
}

// ---------- complaints ----------
const COMP_ICO = { 'Bus Late / Delay': '⏰', 'Rash Driving': '🚨', 'Bus Overcrowded': '👥', 'AC / Fan Not Working': '🌬️', 'Driver Behaviour': '🚌', 'Other Issue': '📝' };
async function loadComplaints() { try { renderComplaints(await api('/complaints')); } catch { } }
function renderComplaints(list) {
    $('comp-list').innerHTML = list.length ? list.map(c => {
        const done = c.status === 'Resolved';
        return `<div class="log-entry"><div class="log-ico" style="background:${done ? '#ECFDF5' : '#FEF3C7'}">${done ? '✅' : (COMP_ICO[c.type] || '📋')}</div>
      <div class="log-info"><div class="log-bus-n">${esc(c.type)} — ${esc(c.bus.split(' — ')[0])}</div><div class="log-act">${esc(c.description.slice(0, 80))}</div></div>
      <span class="badge ${done ? 'b-green' : 'b-amber'}">${esc(c.status)}</span></div>`;
    }).join('') : '<div class="empty">No complaints yet</div>';
}
async function submitComplaint() {
    const description = $('comp-desc').value.trim();
    if (description.length < 5) { showToast('⚠ Please describe the issue'); return; }
    try {
        await api('/complaints', { method: 'POST', body: { type: selectedCompType, bus: $('comp-bus').value, description, when: $('comp-date').value } });
        $('comp-desc').value = ''; $('comp-date').value = ''; await loadComplaints();
        showToast('📣 Complaint submitted! We respond within 24 hrs');
    } catch (e) { showToast('⚠ ' + e.message); }
}

// ---------- staff log ----------
async function submitLog() {
    const bus = $('log-bus').value;
    if (!bus) { showToast('⚠ Select a bus first'); return; }
    try {
        await api('/logs', { method: 'POST', body: { bus, action: $('log-action').value, time: $('log-time').value, headcount: $('log-hc').value, notes: $('log-notes').value } });
        ['log-bus', 'log-time', 'log-hc', 'log-notes'].forEach(i => $(i).value = '');
        busLog = await api('/logs'); renderLogList(); showToast('✅ Bus ' + bus + ' logged');
    } catch (e) { showToast('⚠ ' + e.message); }
}
function renderLogList() {
    const icMap = { entry: ['#ECFDF5', '✅'], exit: ['#FFFBEB', '🚪'], delay: ['#FEF3C7', '⏰'], breakdown: ['#FEE2E2', '🔧'], cancel: ['#FEE2E2', '❌'] };
    const lblMap = { entry: 'Entered college gate', exit: 'Left college gate', delay: 'Delayed', breakdown: 'Breakdown reported', cancel: 'Trip cancelled' };
    $('log-list').innerHTML = busLog.map(l => {
        const ic = icMap[l.action] || icMap.entry;
        return `<div class="log-entry"><div class="log-ico" style="background:${ic[0]}">${ic[1]}</div>
      <div class="log-info"><div class="log-bus-n">Bus ${esc(l.bus)} — ${esc(BUSES[l.bus]?.name)}</div>
      <div class="log-act">${lblMap[l.action] || esc(l.action)}${l.hc ? ' · ' + esc(l.hc) + ' students' : ''}${l.notes ? ' · ' + esc(l.notes) : ''}</div></div>
      <div class="log-t">${esc(l.time)}</div></div>`;
    }).join('') || '<div class="empty">No entries yet — start logging!</div>';
    $('stat-in').textContent = busLog.filter(l => l.action === 'entry').length;
    $('stat-out').textContent = busLog.filter(l => l.action === 'exit').length;
    $('log-badge').textContent = busLog.length + ' entries';
}

// ---------- notices / feedback / SOS ----------
function renderNotices() {
    $('notices-list').innerHTML = NOTICES.map(n => `<div class="log-entry">
    <div class="log-ico" style="background:${esc(n.bg)}">${esc(n.icon)}</div>
    <div class="log-info"><div class="log-bus-n">${esc(n.title)}</div><div class="log-act">${esc(n.body)}</div>
    <div style="font-size:10px;color:var(--text4);margin-top:3px;font-weight:600">${esc(n.time)}</div></div></div>`).join('');
}
async function submitFeedback() {
    if (!starRating) { showToast('⭐ Please select a star rating'); return; }
    try {
        await api('/feedback', { method: 'POST', body: { rating: starRating, comment: $('feedback').value } });
        showToast('🙏 Thank you for your feedback!');
        starRating = 0; document.querySelectorAll('.star').forEach(s => s.classList.remove('on')); $('feedback').value = '';
    } catch (e) { showToast('⚠ ' + e.message); }
}
async function confirmSOS() {
    closeModal('sos');
    try { await api('/sos', { method: 'POST', body: { type: $('sos-type').value } }); showToast('🆘 Transport office alerted immediately!'); }
    catch (e) { showToast('⚠ ' + e.message); }
}

// ---------- restore session on page load ----------
(async () => {
    if (!token) return;
    try { user = (await api('/me')).user; await enterApp(); } catch { }
})();
