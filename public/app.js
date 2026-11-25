import * as L from './logic.js';
import { T } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('wd.' + k)) ?? d; } catch { return d; } }, set: (k, v) => localStorage.setItem('wd.' + k, JSON.stringify(v)), del: (k) => localStorage.removeItem('wd.' + k) };
const rid = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
const S = { lang: new URLSearchParams(location.search).get('lang') || LS.get('lang', 'en'), token: LS.get('token', null), me: LS.get('me', null), data: null, modal: null, busy: false, err: '', wk: null, pf: 'all', ef: 'all', tab: 'swaps', sw: false, rid: null };
if (!T[S.lang]) S.lang = 'en';
const get = (o, k) => k.split('.').reduce((a, p) => (a == null ? a : a[p]), o);
const t = (k) => get(T[S.lang], k) ?? get(T.en, k) ?? k;
const ar = () => S.lang === 'ar';
const nf = (n, d = 0) => Number(n).toLocaleString(ar() ? 'ar-EG' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (c) => `${nf(c / 100, c % 100 ? 2 : 0)} ${t('cur')}`;
const pct = (x) => nf(Math.round(x * 1000) / 10, 1) + '%';
const hrs = (m) => nf(m / 60, m % 60 ? 1 : 0) + ' ' + t('hU');
const dt = (k) => (k ? new Date(k + 'T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : '');
const dshort = (k) => new Date(k + 'T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const wday = (k) => new Date(k + 'T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', weekday: 'short' });
const wdayLong = (k) => new Date(k + 'T00:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { timeZone: 'UTC', weekday: 'long' });
const hm = (s) => (ar() ? String(s).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]) : s);
const tm = (ts) => hm(L.hmOf(L.localParts(ts).min));
const dnm = (ts) => L.localParts(ts).date;
const nm = (o) => (o ? (ar() ? o.nameAr || o.name : o.name) : '');
const D = () => S.data;
const me = () => S.data?.me || S.me;
const role = () => me()?.role;
const isStaff = () => role() === 'staff';
const canMgr = () => role() === 'owner' || role() === 'manager';
const canPay = () => role() === 'owner' || role() === 'payroll';
const empOf = (id) => D().employees.find((e) => e.id === id);
const enm = (id) => nm(empOf(id)) || '?';
const posOf = (id) => L.POSITIONS.find((p) => p.id === id);
const pname = (id) => (ar() ? posOf(id)?.nameAr : posOf(id)?.name) || id;
const val = (id) => $('#' + id)?.value ?? '';
const AR_DIG = '٠١٢٣٤٥٦٧٨٩';
const norm = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => AR_DIG.indexOf(d)).replace(/٫/g, '.').replace(/،/g, ',').trim();
const toInt = (s) => { const n = Number(norm(s).replace(/,/g, '')); return Number.isFinite(n) && norm(s) !== '' ? n : NaN; };
const toCents = (s) => { const n = parseFloat(norm(s).replace(/,/g, '')); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN; };
const toast = (m, bad) => { const el = $('#toast'); el.innerHTML = `<div class="${bad ? 'err' : ''}">${esc(m)}</div>`; clearTimeout(toast.h); toast.h = setTimeout(() => (el.innerHTML = ''), bad ? 5500 : 2600); };
const errText = (m) => { const d = T[S.lang].srv; if (d?.[m]) return d[m]; for (const [re, fn] of T[S.lang].srvRe || []) { const x = re.exec(m); if (x) return fn(...x.slice(1)); } return m; };
const thisWeek = () => L.weekStart(D().today);
const curWk = () => S.wk || thisWeek();

// ---------- network ----------
class NetError extends Error {}
async function call(method, body) {
  let r;
  try { r = await fetch('/api/data', { method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); } catch { throw new NetError('offline'); }
  let j = {}; try { j = await r.json(); } catch { if (r.status >= 500) throw new NetError('server'); }
  if (r.status === 401 && S.token) { logout(); throw new Error(j.error || t('again')); }
  if (r.status >= 500) throw new NetError('server');
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}
async function act(op, okMsg) {
  if (S.busy) return null; S.busy = true;
  try { const j = await call('POST', { op }); const { result, ...v } = j; S.data = v; if (okMsg) toast(okMsg); return result || {}; }
  catch (e) { toast(e instanceof NetError ? t(e.message === 'offline' ? 'offline' : 'err.server') : errText(e.message), true); return null; }
  finally { S.busy = false; render(); }
}
async function refresh() { try { S.data = await call('GET'); S.err = ''; } catch (e) { S.err = e instanceof NetError ? t('offline') : errText(e.message); } }
async function login(pin) {
  try { const j = await call('POST', { op: { type: 'login', pin } }); S.token = j.token; S.me = j.me; LS.set('token', j.token); LS.set('me', j.me); S.err = ''; await refresh(); location.hash = '#/' + NAV[j.me.role][0]; render(); }
  catch (e) { S.err = errText(e.message); render(); }
}
function logout() { S.token = null; S.me = null; S.data = null; LS.del('token'); LS.del('me'); S.modal = null; location.hash = ''; render(); }

const NAV = {
  owner: ['dashboard', 'schedule', 'staff', 'requests', 'timeclock', 'tips', 'payroll', 'reports', 'settings', 'audit'],
  manager: ['dashboard', 'schedule', 'staff', 'requests', 'timeclock', 'tips', 'reports'],
  payroll: ['dashboard', 'schedule', 'staff', 'timeclock', 'tips', 'payroll', 'reports'],
  staff: ['home', 'myschedule', 'requests', 'payslips'],
};
const route = () => (location.hash.replace(/^#\/?/, '') || NAV[role()]?.[0] || 'dashboard').split('/')[0];

// ---------- small views ----------
const pill = (cls, txt) => `<span class="pill ${cls}">${esc(txt)}</span>`;
const empty = (m) => `<p class="empty">${esc(m || t('none'))}</p>`;
const kpi = (n, l, cls = '', sub = '') => `<div class="card kpi ${cls}"><div class="n">${n}</div><div class="l">${esc(l)}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
const field = (id, label, inner, hint) => `<div class="f"><label for="${id}">${esc(label)}</label>${inner}${hint ? `<small class="muted">${esc(hint)}</small>` : ''}</div>`;
const LOGO = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#14332f"/><circle cx="24" cy="24" r="12" fill="none" stroke="#f2f6f5" stroke-width="3"/><path d="M24 16v8l6 4" fill="none" stroke="#f4b740" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const meter = (x, cls = '') => `<div class="meter ${cls}"><i style="width:${Math.max(0, Math.min(100, Math.round(x * 100)))}%"></i></div>`;
const downloadCsv = (name, rows) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([L.toCsv(rows)], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
const posTag = (id) => `<span class="pill p-${esc(id)}" style="background:var(--pb);color:var(--ink)">${esc(pname(id))}</span>`;
const timeRange = (sh) => `${hm(sh.start)}–${hm(sh.end)}`;
const swapPill = (w) => pill(w.status === 'approved' ? '' : w.status === 'manager' ? 'ice' : w.status === 'peer' ? 'off' : 'gray', t('sw.' + w.status));
const mkRem = (r) => {
  const e = empOf(r.employeeId); if (!e?.phone && r.type !== 'forgot') return '';
  return '';
};

function shell(inner) {
  const nav = NAV[role()] || []; const r = route(); const m = me();
  return `<header class="top noprint"><a class="brand" href="#/${nav[0]}">${LOGO}<span>${esc(t('appName'))}<small>${esc(nm(D().company) || t('appSub'))}</small></span></a>
  <nav class="nav" aria-label="main">${nav.map((k) => `<a href="#/${k}" class="${r === k ? 'on' : ''}">${esc(t('nav.' + k))}</a>`).join('')}</nav>
  <div class="tools"><span class="pill">${esc(nm(m))} · ${esc(t('role.' + m.role))}</span><button class="btn sm ghost" data-act="lang">${esc(t('other'))}</button><button class="btn sm ghost" data-act="logout">${esc(t('logout'))}</button></div></header>
  <main>${S.err ? `<div class="notice bad" role="alert">${esc(S.err)}</div>` : ''}${inner}<p class="muted small foot noprint">${esc(t('limits'))}${role() === 'owner' ? ` <button class="btn sm" data-act="reset">${esc(t('b.reset'))}</button>` : ''}</p></main>`;
}
function loginView() {
  return `<div class="login"><div class="logo">${LOGO}<div><h1>${esc(t('appName'))}</h1><p class="sub">${esc(t('appSub'))}</p></div></div>
  <div class="card"><h2>${esc(t('signin'))}</h2><p class="muted small">${esc(t('demoNote'))}</p>
  <div class="demo-users">${L.DEMO_USERS.map((u) => `<button class="btn" data-act="pin" data-pin="${u.pin}"><span>${esc(ar() ? u.labelAr : u.label)}</span><span class="pill gray" dir="ltr">${u.pin}</span></button>`).join('')}</div>
  <form id="pinform" class="row"><label for="pin" class="sr">${esc(t('pin'))}</label><input id="pin" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="${esc(t('pin'))}" dir="ltr"><button class="btn pri">${esc(t('signin'))}</button></form>
  ${S.err ? `<div class="notice bad" role="alert">${esc(S.err)}</div>` : ''}<p class="muted small">${esc(t('limits'))}</p>
  <button class="btn sm" data-act="lang">${esc(t('other'))}</button></div></div>`;
}

// ---------- shared pieces ----------
const shiftsOf = (wk) => D().shifts.filter((x) => L.weekStart(x.date) === wk);
const myShifts = () => D().shifts.filter((x) => x.employeeId === me().employeeId);
const openPunches = () => D().punches.filter((p) => !p.out);
const pendingSwap = (id) => D().swaps.find((w) => (w.status === 'peer' || w.status === 'manager') && (w.shiftId === id || w.withShiftId === id));
const shiftLabel = (sh) => `${wday(sh.date)} ${dshort(sh.date)} · ${timeRange(sh)} · ${pname(sh.positionId)}`;
function problemText(code) {
  const st = D().settings; const m = t('why.' + code); return typeof m === 'string' ? m.replace('{h}', code === 'rest' ? st.minRestHours : code === 'daily' ? st.maxDailyHours : st.maxWeekPlanHours) : code;
}
function candStatus(sh, e) { const r = L.checkAssign(D(), sh, e, sh.employeeId === e.id ? sh.id : undefined); return r; }
function shChip(sh, ro) {
  const open = !sh.employeeId; const req = pendingSwap(sh.id);
  return `<${ro ? 'div' : 'button'} class="sh p-${esc(sh.positionId)} ${open ? 'open' : ''} ${sh.published ? '' : 'draft'} ${req ? 'req' : ''} ${ro ? 'ro' : ''}" ${ro ? '' : `data-act="shift" data-id="${esc(sh.id)}"`}><b>${esc(timeRange(sh))}</b>${esc(pname(sh.positionId))}${open ? ` · ${esc(t('open'))}` : ''}</${ro ? 'div' : 'button'}>`;
}
function clockCard(empId, byMgr) {
  const p = openPunches().find((x) => x.employeeId === empId); const now = D().nowTs;
  const sh = D().shifts.filter((x) => x.employeeId === empId && x.published && (x.date === D().today || x.date === L.addDays(D().today, -1))).sort((a, b) => L.shiftStartTs(a) - L.shiftStartTs(b));
  const cur = p ? D().shifts.find((x) => x.id === p.shiftId) : null;
  let body = '';
  if (p) {
    body = `<div class="big-t" dir="ltr">${esc(tm(p.in))}</div><p class="muted">${esc(t('clockedInAt'))} ${esc(tm(p.in))}${cur ? ' · ' + esc(shiftLabel(cur)) : ''}${p.lateMin > D().settings.lateGraceMin ? ' · ' + esc(nf(p.lateMin) + ' ' + t('minLate')) : ''}</p>
    <div>${p.breakStart ? `<button class="btn big" data-act="endbreak">${esc(t('b.endBreak'))}</button>` : `<button class="btn big" data-act="startbreak">${esc(t('b.startBreak'))}</button>`}<button class="btn pri big" data-act="clockout">${esc(t('b.clockOut'))}</button></div>
    ${p.breakStart ? `<p class="notice">${esc(t('onBreak'))} ${esc(tm(p.breakStart))}</p>` : p.breakMin ? `<p class="muted small">${esc(t('breakSoFar'))}: ${esc(nf(p.breakMin))} ${esc(t('minU'))}</p>` : ''}`;
  } else {
    const next = sh.find((x) => L.shiftEndTs(x) > now);
    body = `<div class="big-t" dir="ltr">${esc(tm(now))}</div><p class="muted">${esc(next ? t('nextShift') + ': ' + shiftLabel(next) : t('noShiftToday'))}</p><button class="btn pri big" data-act="clockin">${esc(t('b.clockIn'))}</button><p class="muted small">${esc(t('clockHint').replace('{m}', D().settings.earlyClockMin))}</p>`;
  }
  return `<div class="card clockbox">${body}</div>`;
}
function swapRow(w, mgrView) {
  const sh = D().shifts.find((x) => x.id === w.shiftId); const sh2 = w.withShiftId ? D().shifts.find((x) => x.id === w.withShiftId) : null; if (!sh) return '';
  const desc = w.type === 'swap' ? `${esc(enm(w.empId))} ⇄ ${esc(enm(w.toEmpId))}<div class="small">${esc(shiftLabel(sh))} ⇄ ${esc(sh2 ? shiftLabel(sh2) : '')}</div>`
    : w.type === 'claim' ? `${esc(enm(w.empId))} · ${esc(t('sw.claimLbl'))}<div class="small">${esc(shiftLabel(sh))}</div>`
      : `${esc(enm(w.empId))} → ${esc(w.toEmpId ? enm(w.toEmpId) : t('sw.anyone'))}<div class="small">${esc(shiftLabel(sh))}</div>`;
  const mine = me().employeeId; let acts = '';
  if (w.status === 'manager' && canMgr()) acts = `<button class="btn sm pri" data-act="swapok" data-id="${w.id}">${esc(t('b.approve'))}</button><button class="btn sm danger" data-act="swapno" data-id="${w.id}">${esc(t('b.decline'))}</button>`;
  if (w.status === 'peer' && isStaff() && w.empId !== mine && (!w.toEmpId || w.toEmpId === mine)) acts = `<button class="btn sm pri" data-act="swapyes" data-id="${w.id}">${esc(w.toEmpId ? t('b.accept') : t('b.takeIt'))}</button>${w.toEmpId ? `<button class="btn sm" data-act="swapdecl" data-id="${w.id}">${esc(t('b.no'))}</button>` : ''}`;
  if ((w.status === 'peer' || w.status === 'manager') && isStaff() && w.empId === mine) acts += `<button class="btn sm" data-act="swapcancel" data-id="${w.id}">${esc(t('b.cancel'))}</button>`;
  return `<div class="mrow"><div>${pill('ice', t('sw.' + w.type))} ${desc}${w.note ? `<div class="small muted">“${esc(w.note)}”</div>` : ''}${w.note2 ? `<div class="small muted">${esc(w.note2)}</div>` : ''}</div><div class="row">${swapPill(w)}${acts}</div></div>`;
}
const toRow = (x) => `<div class="mrow"><div><b>${esc(enm(x.employeeId))}</b> · ${esc(dt(x.from))}${x.to !== x.from ? ' – ' + esc(dt(x.to)) : ''}<div class="small muted">${esc(x.reason)}${x.note ? ' · ' + esc(x.note) : ''}</div></div><div class="row">${pill(x.status === 'approved' ? '' : x.status === 'pending' ? 'off' : 'gray', t('st.' + x.status))}${x.status === 'pending' && canMgr() ? `<button class="btn sm pri" data-act="took" data-id="${x.id}">${esc(t('b.approve'))}</button><button class="btn sm danger" data-act="tono" data-id="${x.id}">${esc(t('b.decline'))}</button>` : ''}${isStaff() && (x.status === 'pending' || (x.status === 'approved' && x.from >= D().today)) ? `<button class="btn sm" data-act="tocancel" data-id="${x.id}">${esc(t('b.cancel'))}</button>` : ''}</div></div>`;
const corRow = (c) => `<div class="mrow"><div><b>${esc(enm(c.employeeId))}</b> · ${esc(dt(c.date))} · ${esc(hm(c.in))}–${esc(hm(c.out))}<div class="small muted">${esc(c.reason)}${c.note ? ' · ' + esc(c.note) : ''}</div></div><div class="row">${pill(c.status === 'approved' ? '' : c.status === 'pending' ? 'off' : 'gray', t('st.' + c.status))}${c.status === 'pending' && canMgr() ? `<button class="btn sm pri" data-act="corok" data-id="${c.id}">${esc(t('b.approve'))}</button><button class="btn sm danger" data-act="corno" data-id="${c.id}">${esc(t('b.decline'))}</button>` : ''}</div></div>`;
function slipHtml(run, l) {
  const r = (k, v, cls = '') => `<div class="r ${cls}"><span>${esc(k)}</span><b>${v}</b></div>`;
  return `<div class="slip printable"><h3>${esc(nm(D().company))}</h3><p class="muted small">${esc(t('payslip'))} ${esc(l.slip)} · ${esc(dt(run.from))} – ${esc(dt(run.to))}</p>
  <p><b>${esc(ar() ? l.nameAr : l.name)}</b> · ${esc(pname(l.positionId))}</p>
  ${r(t('p.regHours') + ' (' + hrs(l.regMin) + ')', money(l.regPay))}${r(t('p.otHours') + ' (' + hrs(l.otMin) + ')', money(l.otPay))}${l.bonus ? r(t('p.bonus'), money(l.bonus)) : ''}${r(t('p.tips'), money(l.tips))}${r(t('p.gross'), money(l.gross))}
  ${l.insurance ? r(t('p.insurance'), '− ' + money(l.insurance)) : ''}${l.deductions ? r(t('p.deductions'), '− ' + money(l.deductions)) : ''}${r(t('p.net'), money(l.net), 'tot')}
  <p class="muted small">${esc(t('p.rate'))}: ${esc(money(l.rate))}/${esc(t('hU'))} · ${esc(t('slipNote'))}</p></div>`;
}

// ---------- pages ----------
function waUrl(r) {
  const e = empOf(r.employeeId); if (!e?.phone) return '';
  let msg = '';
  if (r.type === 'shift') { const sh = D().shifts.find((x) => x.id === r.shiftId); if (!sh) return ''; msg = T[S.lang].remindShift(nm(e), `${wdayLong(sh.date)} ${dshort(sh.date)}`, timeRange(sh), pname(sh.positionId)); }
  else if (r.type === 'health') msg = T[S.lang].remindHealth(nm(e), dt(r.due));
  else return '';
  return `https://wa.me/${e.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
}
function remRow(r) {
  const e = empOf(r.employeeId); const wa = canMgr() ? waUrl(r) : '';
  const txt = r.type === 'shift' ? (() => { const sh = D().shifts.find((x) => x.id === r.shiftId); return sh ? `${esc(t('rem.shift'))}: ${esc(shiftLabel(sh))}` : ''; })() : r.type === 'forgot' ? `${esc(t('rem.forgot'))}` : `${esc(t('rem.health'))} · ${esc(dt(r.due))}`;
  return `<div class="mrow"><div><b>${esc(nm(e))}</b><div class="small muted">${txt}</div></div><div class="row">${pill(r.severity === 'overdue' ? 'bad' : 'off', t('sev.' + r.severity))}${wa ? `<a class="btn sm" data-act="remind" data-key="${esc(r.key)}" href="${esc(wa)}" target="_blank" rel="noopener">${r.sent ? esc(t('b.reminded')) : esc(t('b.remind'))}</a>` : ''}</div></div>`;
}
const hbar = (rows, fmtv) => { const max = Math.max(1, ...rows.map((r) => r.v)); return `<div class="hbars">${rows.map((r) => `<div class="hb"><span>${esc(r.l)}</span>${meter(r.v / max)}<b class="num">${esc(fmtv(r.v))}</b></div>`).join('')}</div>`; };
const bars = (rows, key, cls, f) => { const max = Math.max(1, ...rows.map((r) => r[key] || 0)); return `<div class="bars2">${rows.map((r) => `<div class="col2"><div class="pair"><div class="b ${cls || ''}" style="height:${((r[key] || 0) / max) * 100}%" title="${esc(f(r[key] || 0))}"></div></div><small>${esc(dshort(r.week))}</small></div>`).join('')}</div>`; };

const PAGES = {
  dashboard() {
    const d = D(), r = d.reports; const on = openPunches(); const wk = thisWeek();
    const reqs = d.swaps.filter((w) => w.status === 'manager').length + d.timeOff.filter((x) => x.status === 'pending').length + d.corrections.filter((c) => c.status === 'pending').length;
    const unappr = d.punches.filter((p) => p.out && !p.approved && dnm(p.in) < d.today).length;
    const todays = d.shifts.filter((x) => x.date === d.today).sort((a, b) => a.start.localeCompare(b.start));
    const attn = (d.reminders || []).filter((x) => x.type !== 'shift').slice(0, 8);
    const money$ = canPay();
    const last = r.weeks[r.weeks.length - 2];
    return `<div class="bar"><h1>${esc(t('nav.dashboard'))}</h1><span class="sp"></span>${canMgr() ? `<button class="btn pri" data-act="newshift">${esc(t('b.addShift'))}</button>` : ''}</div>
    <div class="grid kpis">
      ${kpi(nf(on.length), t('k.onClock'), 'good', esc(on.slice(0, 3).map((p) => nm(empOf(p.employeeId))).join(', ')))}
      ${kpi(nf(r.openThisWeek), t('k.openShifts'), r.openThisWeek ? 'warn' : 'good', `${nf(r.openNextWeek)} ${esc(t('k.nextWeek'))}`)}
      ${canMgr() ? kpi(nf(reqs), t('k.requests'), reqs ? 'warn' : 'good', `<a href="#/requests">${esc(t('k.review'))}</a>`) : ''}
      ${kpi(nf(unappr), t('k.unapproved'), unappr ? 'warn' : 'good', `<a href="#/timeclock">${esc(t('nav.timeclock'))}</a>`)}
      ${money$ ? kpi(r.laborPct4 == null ? '-' : pct(r.laborPct4), t('k.labor'), 'good', `${esc(money(r.cost4))} ${esc(t('k.last4'))}`) : kpi(hrs(last.hours), t('k.hoursLast'), '', `${esc(hrs(last.ot))} ${esc(t('k.overtime'))}`)}
      ${money$ ? kpi(hrs(last.ot), t('k.otLast'), last.ot ? 'warn' : 'good', money(last.otCost || 0)) : ''}
    </div>
    <div class="grid two" style="margin-top:1rem">
      <div class="card"><h2>${esc(t('todayShifts'))} · ${esc(dt(d.today))}</h2>${todays.length ? todays.map((sh) => `<div class="mrow"><div><b>${esc(timeRange(sh))}</b> ${posTag(sh.positionId)}</div><div>${sh.employeeId ? esc(enm(sh.employeeId)) : pill('off', t('open'))}${d.punches.some((p) => p.shiftId === sh.id) ? ' ' + pill('', t('clockedIn')) : ''}</div></div>`).join('') : empty()}</div>
      <div class="card"><h2>${esc(t('onClockNow'))}</h2>${on.length ? on.map((p) => `<div class="mrow"><div><b>${esc(enm(p.employeeId))}</b><div class="small muted">${esc(t('since'))} ${esc(tm(p.in))}${p.breakStart ? ' · ' + esc(t('onBreak')) : ''}</div></div>${canMgr() ? `<button class="btn sm" data-act="mgrout" data-id="${p.employeeId}">${esc(t('b.clockOut'))}</button>` : ''}</div>`).join('') : empty()}</div>
    </div>
    ${canMgr() ? `<div class="card" style="margin-top:1rem"><h2>${esc(t('attention'))}</h2>${attn.length ? attn.map(remRow).join('') : empty(t('allClear'))}<h3 style="margin-top:1rem">${esc(t('tomorrow'))}</h3>${(d.reminders || []).filter((x) => x.type === 'shift').slice(0, 6).map(remRow).join('') || empty()}</div>` : ''}
    <div class="card" style="margin-top:1rem"><h2>${esc(t('rep.hoursByWeek'))}</h2>${bars(r.weeks, 'hours', '', (v) => hrs(v))}</div>`;
  },
  schedule() {
    const d = D(), wk = curWk(); const days = [0, 1, 2, 3, 4, 5, 6].map((i) => L.addDays(wk, i)); const list = shiftsOf(wk);
    const ro = !canMgr(); const published = !!d.published[wk]; const emps = d.employees.filter((e) => e.active && (S.pf === 'all' || e.positionIds.includes(S.pf))).sort((a, b) => L.POS_IDS.indexOf(a.positionIds[0]) - L.POS_IDS.indexOf(b.positionIds[0]) || a.name.localeCompare(b.name));
    const cell = (empId, date) => { const items = list.filter((x) => x.date === date && (x.employeeId || null) === empId && (S.pf === 'all' || x.positionId === S.pf || empId)).sort((a, b) => a.start.localeCompare(b.start)); const off = empId && d.timeOff.some((x) => x.employeeId === empId && x.status === 'approved' && date >= x.from && date <= x.to); return `<td class="cell ${!ro && !items.length ? 'add' : ''}" ${!ro && !items.length ? `data-act="newshift" data-date="${date}" data-emp="${empId || ''}"` : ''}>${off ? `<div class="small muted">${esc(t('timeOff'))}</div>` : ''}${items.map((x) => shChip(x, ro)).join('')}</td>`; };
    const head = days.map((x) => `<th class="day ${x === d.today ? 'today' : ''}">${esc(wday(x))}<small>${esc(dshort(x))}</small></th>`).join('');
    const openRow = `<tr class="open"><td class="who"><b>${esc(t('openShifts'))}</b><small>${nf(list.filter((x) => !x.employeeId).length)}</small></td>${days.map((x) => cell(null, x)).join('')}</tr>`;
    const rows = emps.map((e) => { const m = L.plannedMin(d.shifts, e.id, wk); const ot = m > d.settings.otAfterHours * 60; return `<tr><td class="who"><b>${esc(nm(e))}</b><small>${esc(pname(e.positionIds[0]))} · <span class="${ot ? 'warn-t' : ''}">${esc(hrs(m))}</span></small></td>${days.map((x) => cell(e.id, x)).join('')}</tr>`; }).join('');
    return `<div class="bar"><h1>${esc(t('nav.schedule'))}</h1>${published ? pill('', t('published')) : pill('off', t('draftWeek'))}<span class="sp"></span>
    <div class="seg"><button data-act="wk" data-n="-1">‹</button><button data-act="wk" data-n="0">${esc(t('thisWeek'))}</button><button data-act="wk" data-n="1">›</button></div>
    ${sel('pf', [['all', t('allPositions')], ...L.POSITIONS.map((p) => [p.id, pname(p.id)])], S.pf)}
    ${!ro ? `<button class="btn" data-act="newshift">${esc(t('b.addShift'))}</button>${list.length ? '' : `<button class="btn" data-act="copyweek">${esc(t('b.copyPrev'))}</button>`}${list.length ? `<button class="btn pri" data-act="publish">${esc(published ? t('b.republish') : t('b.publish'))}</button>` : ''}` : ''}</div>
    <p class="muted">${esc(dt(wk))} – ${esc(dt(days[6]))} · ${esc(t('weekNote'))}</p>
    <div class="tw"><table class="sched"><thead><tr><th class="who">${esc(t('person'))}</th>${head}</tr></thead><tbody>${openRow}${rows}</tbody></table></div>
    <div class="legend">${L.POSITIONS.map((p) => `<span class="p-${p.id}"><i></i>${esc(pname(p.id))}</span>`).join('')}<span>${esc(t('legend'))}</span></div>`;
  },
  staff() {
    const d = D(); const list = d.employees.filter((e) => S.ef === 'all' ? true : S.ef === 'inactive' ? !e.active : e.active);
    return `<div class="bar"><h1>${esc(t('nav.staff'))}</h1><span class="sp"></span>${sel('ef', [['active', t('f.active')], ['inactive', t('f.inactive')], ['all', t('f.all')]], S.ef === 'all' ? 'all' : S.ef)}${canMgr() ? `<button class="btn pri" data-act="newemp">${esc(t('b.addEmp'))}</button>` : ''}</div>
    <div class="tw"><table><thead><tr><th>${esc(t('person'))}</th><th>${esc(t('positions'))}</th>${canMgr() ? `<th>${esc(t('phone'))}</th>` : ''}${canPay() ? `<th class="num">${esc(t('rate'))}</th>` : ''}<th>${esc(t('healthCard'))}</th><th>${esc(t('status'))}</th></tr></thead><tbody>
    ${list.map((e) => { const left = e.healthCard ? L.diffDays(d.today, e.healthCard) : null; return `<tr class="click" data-act="emp" data-id="${e.id}" tabindex="0"><td><b>${esc(nm(e))}</b></td><td>${e.positionIds.map(posTag).join(' ')}</td>${canMgr() ? `<td dir="ltr">${esc(e.phone || '')}</td>` : ''}${canPay() ? `<td class="num">${esc(money(e.rate))}/${esc(t('hU'))}${e.insured ? ' ' + pill('ice', t('insured')) : ''}</td>` : ''}<td>${e.healthCard ? pill(left < 0 ? 'bad' : left <= 30 ? 'off' : 'gray', dt(e.healthCard)) : ''}</td><td>${e.active ? pill('', t('f.active')) : pill('gray', t('f.inactive'))}</td></tr>`; }).join('')}</tbody></table></div>`;
  },
  requests() {
    const d = D();
    if (isStaff()) {
      const mine = me().employeeId; const pool = d.swaps.filter((w) => w.status === 'peer' && w.empId !== mine && (!w.toEmpId || w.toEmpId === mine));
      const open = d.shifts.filter((x) => !x.employeeId && x.published && L.shiftStartTs(x) > d.nowTs && !d.swaps.some((w) => w.type === 'claim' && w.shiftId === x.id && w.toEmpId === mine && w.status === 'manager')).sort((a, b) => L.shiftStartTs(a) - L.shiftStartTs(b)).slice(0, 12);
      const my = d.swaps.filter((w) => w.empId === mine || w.toEmpId === mine).filter((w) => !pool.includes(w));
      return `<div class="bar"><h1>${esc(t('nav.requests'))}</h1><span class="sp"></span><button class="btn" data-act="newto">${esc(t('b.timeOff'))}</button><button class="btn" data-act="newcor">${esc(t('b.correction'))}</button><button class="btn" data-act="avail">${esc(t('b.availability'))}</button></div>
      <div class="grid two"><div class="card"><h2>${esc(t('offered'))}</h2>${pool.length ? pool.map((w) => swapRow(w)).join('') : empty()}</div>
      <div class="card"><h2>${esc(t('openShifts'))}</h2>${open.length ? open.map((x) => `<div class="mrow"><div><b>${esc(shiftLabel(x))}</b></div><button class="btn sm pri" data-act="claim" data-id="${x.id}">${esc(t('b.claim'))}</button></div>`).join('') : empty()}</div></div>
      <div class="card" style="margin-top:1rem"><h2>${esc(t('myRequests'))}</h2>${my.map((w) => swapRow(w)).join('')}${d.timeOff.map(toRow).join('')}${d.corrections.map(corRow).join('')}${!my.length && !d.timeOff.length && !d.corrections.length ? empty() : ''}</div>`;
    }
    const tabs = [['swaps', t('tab.swaps'), d.swaps.filter((w) => w.status === 'manager').length], ['off', t('tab.off'), d.timeOff.filter((x) => x.status === 'pending').length], ['cor', t('tab.cor'), d.corrections.filter((c) => c.status === 'pending').length]];
    const sw = [...d.swaps].sort((a, b) => (a.status === 'manager' ? 0 : 1) - (b.status === 'manager' ? 0 : 1) || b.createdAt - a.createdAt).slice(0, 40);
    const to = [...d.timeOff].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || a.from.localeCompare(b.from));
    const co = [...d.corrections].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.createdAt - a.createdAt);
    return `<div class="bar"><h1>${esc(t('nav.requests'))}</h1></div><div class="tabs">${tabs.map(([k, l, n]) => `<button class="${S.tab === k ? 'on' : ''}" data-act="tab" data-k="${k}">${esc(l)}${n ? ` (${nf(n)})` : ''}</button>`).join('')}</div>
    <div class="card">${S.tab === 'swaps' ? (sw.map((w) => swapRow(w)).join('') || empty()) : S.tab === 'off' ? (to.map(toRow).join('') || empty()) : (co.map(corRow).join('') || empty())}</div>`;
  },
  timeclock() {
    const d = D(), wk = curWk(); const end = L.addDays(wk, 6); const mgr = canMgr();
    const list = d.punches.filter((p) => dnm(p.in) >= wk && dnm(p.in) <= end && (S.ef2 ? p.employeeId === S.ef2 : true)).sort((a, b) => b.in - a.in);
    const un = list.filter((p) => p.out && !p.approved).length; const tot = list.reduce((a, p) => a + (p.paidMin || 0), 0);
    return `<div class="bar"><h1>${esc(t('nav.timeclock'))}</h1><span class="sp"></span><div class="seg"><button data-act="wk" data-n="-1">‹</button><button data-act="wk" data-n="0">${esc(t('thisWeek'))}</button><button data-act="wk" data-n="1">›</button></div>
    ${sel('ef2', [['', t('f.all')], ...d.employees.filter((e) => e.active).map((e) => [e.id, nm(e)])], S.ef2 || '')}${mgr ? `<button class="btn" data-act="newpunch">${esc(t('b.addPunch'))}</button><button class="btn pri" data-act="approvets">${esc(t('b.approveWeek'))}</button>` : ''}</div>
    <p class="muted">${esc(dt(wk))} – ${esc(dt(end))} · ${esc(nf(list.length))} ${esc(t('punches'))} · ${esc(hrs(tot))} · ${esc(nf(un))} ${esc(t('awaitingApproval'))}</p>
    <div class="tw"><table><thead><tr><th>${esc(t('date'))}</th><th>${esc(t('person'))}</th><th>${esc(t('in'))}</th><th>${esc(t('out'))}</th><th class="num">${esc(t('break'))}</th><th class="num">${esc(t('paid'))}</th><th>${esc(t('status'))}</th>${mgr ? '<th></th>' : ''}</tr></thead><tbody>
    ${list.map((p) => { const forgot = !p.out && d.nowTs - p.in > 12 * 3600e3; return `<tr><td>${esc(wday(dnm(p.in)))} ${esc(dshort(dnm(p.in)))}</td><td>${esc(enm(p.employeeId))}</td><td dir="ltr">${esc(tm(p.in))}</td><td dir="ltr">${p.out ? esc(tm(p.out)) : '-'}</td><td class="num">${esc(nf(p.breakMin))}${p.autoBreak ? '*' : ''}</td><td class="num">${p.out ? esc(hrs(p.paidMin)) : ''}</td><td>${!p.out ? pill(forgot ? 'bad' : 'ice', forgot ? t('forgot') : t('open')) : p.approved ? pill('', t('approved')) : pill('off', t('pending'))} ${p.lateMin > d.settings.lateGraceMin ? pill('gray', nf(p.lateMin) + ' ' + t('minLate')) : ''} ${p.source !== 'clock' ? pill('gray', t('src.' + p.source)) : ''}</td>${mgr ? `<td class="row"><button class="btn sm" data-act="editpunch" data-id="${p.id}">${esc(t('b.edit'))}</button></td>` : ''}</tr>`; }).join('')}</tbody></table></div><p class="muted small">* ${esc(t('autoBreakNote'))}</p>`;
  },
  tips() {
    const d = D(); const days = [...new Set(d.tips.map((x) => x.date))].sort().reverse().slice(0, 21); const sd = S.tipDay || days[0];
    const dist = sd ? L.allocateTips({ employees: d.employees, punches: d.punches.map((p) => ({ ...p, void: false })), tips: d.tips, settings: d.settings }, sd, sd) : { byEmp: {}, unallocated: [] };
    return `<div class="bar"><h1>${esc(t('nav.tips'))}</h1><span class="sp"></span><button class="btn pri" data-act="newtips">${esc(t('b.addTips'))}</button></div><p class="muted">${esc(t('tipsNote').replace('{f}', D().settings.cardFeePercent))}</p>
    <div class="grid two"><div class="card"><h2>${esc(t('tipDays'))}</h2><div class="tw"><table><thead><tr><th>${esc(t('date'))}</th><th class="num">${esc(t('cash'))}</th><th class="num">${esc(t('card'))}</th><th class="num">${esc(t('net'))}</th></tr></thead><tbody>
    ${days.map((k) => { const es = d.tips.filter((x) => x.date === k); return `<tr class="click ${k === sd ? 'on' : ''}" data-act="tipday" data-d="${k}" tabindex="0"><td>${esc(wday(k))} ${esc(dshort(k))}${es.length > 1 ? ` (${nf(es.length)})` : ''}</td><td class="num">${esc(money(es.reduce((a, x) => a + x.cash, 0)))}</td><td class="num">${esc(money(es.reduce((a, x) => a + x.card, 0)))}</td><td class="num"><b>${esc(money(es.reduce((a, x) => a + x.net, 0)))}</b></td></tr>`; }).join('')}</tbody></table></div></div>
    <div class="card"><h2>${esc(t('split'))} · ${esc(sd ? dt(sd) : '')}</h2>${dist.unallocated.length ? `<div class="notice bad">${esc(t('noCrew'))}</div>` : ''}${Object.entries(dist.byEmp).sort((a, b) => b[1] - a[1]).map(([id, v]) => `<div class="mrow"><span>${esc(enm(id))} <small class="muted">${esc(pname(empOf(id).positionIds[0]))}</small></span><b>${esc(money(v))}</b></div>`).join('') || (dist.unallocated.length ? '' : empty())}
    ${d.tips.filter((x) => x.date === sd).map((x) => `<div class="mrow small muted"><span>${esc(x.by)}${x.note ? ' · ' + esc(x.note) : ''}</span><button class="btn sm danger" data-act="deltips" data-id="${x.id}">${esc(t('b.delete'))}</button></div>`).join('')}</div></div>`;
  },
  payroll() {
    const d = D(); const id = S.rid; const run = id ? d.runs.find((r) => r.id === id) : null;
    if (run) return runPage(run);
    const tt = (r) => L.totals(r.lines || []);
    return `<div class="bar"><h1>${esc(t('nav.payroll'))}</h1><span class="sp"></span><button class="btn pri" data-act="newrun">${esc(t('b.newRun'))}</button></div>
    <div class="tw"><table><thead><tr><th>${esc(t('run'))}</th><th>${esc(t('period'))}</th><th>${esc(t('status'))}</th><th class="num">${esc(t('people'))}</th><th class="num">${esc(t('p.net'))}</th></tr></thead><tbody>
    ${[...d.runs].reverse().map((r) => `<tr class="click" data-act="run" data-id="${r.id}" tabindex="0"><td><b>${esc(r.no)}</b></td><td>${esc(dt(r.from))} – ${esc(dt(r.to))}</td><td>${pill(r.status === 'paid' ? '' : r.status === 'approved' ? 'ice' : 'off', t('rs.' + r.status))}</td><td class="num">${nf((r.lines || []).length)}</td><td class="num">${r.lines ? esc(money(tt(r).net)) : '-'}</td></tr>`).join('')}</tbody></table></div><p class="muted small">${esc(t('payNote'))}</p>`;
  },
  reports() {
    const d = D(), r = d.reports; const m = canPay();
    return `<div class="bar"><h1>${esc(t('nav.reports'))}</h1><span class="sp"></span><button class="btn" data-act="csv" data-k="weeks">${esc(t('b.csv'))}</button></div>
    <div class="grid kpis">${m ? kpi(r.laborPct4 == null ? '-' : pct(r.laborPct4), t('k.labor'), 'good', esc(t('k.last4'))) : ''}${m ? kpi(money(r.tips4), t('k.tips4'), '', esc(t('k.last4'))) : ''}${kpi(pct(r.latePct), t('k.late'), r.latePct > 0.15 ? 'warn' : 'good', esc(t('k.lateSub')))}${kpi(nf(r.noShows), t('k.noShows'), r.noShows ? 'warn' : 'good', esc(t('k.last4')))}${kpi(pct(r.coverage), t('k.coverage'), r.coverage > 0.95 ? 'good' : 'warn', esc(t('k.thisWeekS')))}</div>
    <div class="grid two" style="margin-top:1rem"><div class="card"><h2>${esc(t('rep.hoursByWeek'))}</h2>${bars(r.weeks, 'hours', '', (v) => hrs(v))}</div>
    <div class="card"><h2>${esc(t('rep.otByWeek'))}</h2>${bars(r.weeks, 'ot', 'alt', (v) => hrs(v))}</div>
    ${m ? `<div class="card"><h2>${esc(t('rep.costByWeek'))}</h2>${bars(r.weeks, 'cost', '', (v) => money(v))}</div><div class="card"><h2>${esc(t('rep.laborPct'))}</h2><div class="tw"><table><thead><tr><th>${esc(t('week'))}</th><th class="num">${esc(t('rep.sales'))}</th><th class="num">${esc(t('rep.cost'))}</th><th class="num">%</th></tr></thead><tbody>${r.weeks.filter((w) => w.sales).slice(-8).map((w) => `<tr><td>${esc(dshort(w.week))}</td><td class="num">${esc(money(w.sales))}</td><td class="num">${esc(money(w.cost))}</td><td class="num">${w.laborPct == null ? '' : esc(pct(w.laborPct))}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="card"><h2>${esc(t('rep.byPosition'))}</h2>${hbar(r.posHours.map((p) => ({ l: pname(p.id), v: p.minutes })), (v) => hrs(v))}</div></div>`;
  },
  settings() {
    const st = D().settings; const f = (k, label, unit) => field('s-' + k, label, `<input id="s-${k}" inputmode="numeric" value="${esc(st[k])}" dir="ltr">`, unit);
    return `<div class="bar"><h1>${esc(t('nav.settings'))}</h1></div><div class="grid two"><div class="card"><div class="notice">${esc(t('settingsNote'))}</div>
    ${f('otAfterHours', t('set.otAfter'), t('hU'))}${f('otPercent', t('set.otPct'), '% (135 = 1.35x)')}${f('insurancePercent', t('set.ins'), '%')}${f('cardFeePercent', t('set.cardFee'), '%')}${f('maxDailyHours', t('set.maxDay'), t('hU'))}${f('maxWeekPlanHours', t('set.maxWeek'), t('hU'))}${f('minRestHours', t('set.rest'), t('hU'))}${f('roundMin', t('set.round'), t('minU'))}
    <div class="acts"><button class="btn pri" data-act="savesettings">${esc(t('b.save'))}</button></div></div>
    <div class="card"><h2>${esc(t('tipWeights'))}</h2>${L.POSITIONS.map((p) => `<div class="mrow"><span>${esc(pname(p.id))}</span><b>${nf(p.tip / 100, 1)}</b></div>`).join('')}<p class="muted small">${esc(t('tipWeightsNote'))}</p></div></div>`;
  },
  audit() {
    return `<div class="bar"><h1>${esc(t('nav.audit'))}</h1></div><div class="tw"><table><thead><tr><th>${esc(t('when'))}</th><th>${esc(t('who'))}</th><th>${esc(t('action'))}</th><th>${esc(t('detail'))}</th></tr></thead><tbody>${D().audit.slice(0, 120).map((a) => `<tr><td>${esc(dt(dnm(a.ts)))} ${esc(tm(a.ts))}</td><td>${esc(a.name)}</td><td><code>${esc(a.action)}</code></td><td>${esc(a.detail)}</td></tr>`).join('')}</tbody></table></div>`;
  },
  // ----- staff portal -----
  home() {
    const d = D(), id = me().employeeId; const mine = myShifts().filter((x) => L.shiftEndTs(x) > d.nowTs).sort((a, b) => L.shiftStartTs(a) - L.shiftStartTs(b)).slice(0, 5);
    const wk = thisWeek(); const planned = L.plannedMin(d.shifts, id, wk);
    const pend = d.swaps.filter((w) => (w.status === 'peer' || w.status === 'manager') && (w.empId === id || w.toEmpId === id)).length + d.timeOff.filter((x) => x.status === 'pending').length;
    const pool = d.swaps.filter((w) => w.status === 'peer' && w.empId !== id && (!w.toEmpId || w.toEmpId === id)).length;
    return `<div class="bar"><h1>${esc(t('hello'))}, ${esc(nm(empOf(id)))}</h1></div>${clockCard(id)}
    <div class="grid kpis" style="margin-top:1rem">${kpi(hrs(planned), t('k.plannedWeek'), '', esc(dshort(wk)))}${kpi(nf(pend), t('k.myPending'), pend ? 'warn' : 'good', `<a href="#/requests">${esc(t('nav.requests'))}</a>`)}${kpi(nf(pool), t('k.offered'), pool ? 'warn' : '', `<a href="#/requests">${esc(t('b.takeIt'))}</a>`)}</div>
    <div class="card" style="margin-top:1rem"><h2>${esc(t('upcoming'))}</h2>${mine.length ? mine.map((sh) => `<div class="shrow p-${sh.positionId}"><div><span class="t">${esc(timeRange(sh))}</span> · ${esc(wdayLong(sh.date))} ${esc(dshort(sh.date))}<div class="small muted">${esc(pname(sh.positionId))}</div></div></div>`).join('') : empty()}</div>`;
  },
  myschedule() {
    const d = D(), id = me().employeeId; const wk = curWk(); const days = [...Array(14)].map((_, i) => L.addDays(wk, i));
    return `<div class="bar"><h1>${esc(t('nav.myschedule'))}</h1><span class="sp"></span><div class="chk"><input type="checkbox" id="swteam" ${S.sw ? 'checked' : ''}><label for="swteam">${esc(t('showTeam'))}</label></div><div class="seg"><button data-act="wk" data-n="-1">‹</button><button data-act="wk" data-n="0">${esc(t('thisWeek'))}</button><button data-act="wk" data-n="1">›</button></div></div>
    ${days.map((k) => { const list = d.shifts.filter((x) => x.date === k && (S.sw || x.employeeId === id || !x.employeeId)).sort((a, b) => a.start.localeCompare(b.start)); if (!list.length) return ''; return `<h3 class="dayhd ${k === d.today ? 'today' : ''}">${esc(wdayLong(k))} · ${esc(dshort(k))}</h3>${list.map((sh) => { const mineSh = sh.employeeId === id; const req = pendingSwap(sh.id); const fut = L.shiftStartTs(sh) > d.nowTs; return `<div class="shrow p-${sh.positionId}"><div><span class="t">${esc(timeRange(sh))}</span> · ${esc(pname(sh.positionId))}<div class="small muted">${mineSh ? esc(t('you')) : sh.employeeId ? esc(enm(sh.employeeId)) : esc(t('open'))}</div></div><div class="row">${req ? swapPill(req) : ''}${mineSh && fut && !req ? `<button class="btn sm" data-act="giveaway" data-id="${sh.id}">${esc(t('b.giveSwap'))}</button>` : ''}${!sh.employeeId && fut ? `<button class="btn sm pri" data-act="claim" data-id="${sh.id}">${esc(t('b.claim'))}</button>` : ''}</div></div>`; }).join('')}`; }).join('') || empty(t('noShifts'))}`;
  },
  payslips() {
    const list = [...D().payslips].reverse();
    return `<div class="bar"><h1>${esc(t('nav.payslips'))}</h1></div><div class="tw"><table><thead><tr><th>${esc(t('payslip'))}</th><th>${esc(t('period'))}</th><th class="num">${esc(t('p.net'))}</th><th>${esc(t('status'))}</th></tr></thead><tbody>${list.map((p) => `<tr class="click" data-act="slip" data-id="${p.id}" tabindex="0"><td><b>${esc(p.line.slip)}</b></td><td>${esc(dt(p.from))} – ${esc(dt(p.to))}</td><td class="num"><b>${esc(money(p.line.net))}</b></td><td>${p.status === 'paid' ? pill('', t('rs.paid') + ' ' + dt(p.paidAt)) : pill('ice', t('rs.approved'))}</td></tr>`).join('')}</tbody></table></div>${list.length ? '' : empty()}`;
  },
};
function runPage(run) {
  const d = D(); const tt = L.totals(run.lines || []); const draft = run.status === 'draft'; const owner = role() === 'owner';
  const issue = (i) => `<div class="notice bad">${esc(t('issue.' + i.type).replace('{n}', i.n ?? '').replace('{d}', i.date ? dt(i.date) : '').replace('{p}', i.employeeId ? enm(i.employeeId) : ''))}</div>`;
  return `<div class="bar"><button class="btn" data-act="runs">‹ ${esc(t('nav.payroll'))}</button><h1>${esc(run.no)} · ${esc(dt(run.from))} – ${esc(dt(run.to))}</h1>${pill(run.status === 'paid' ? '' : run.status === 'approved' ? 'ice' : 'off', t('rs.' + run.status))}<span class="sp"></span>
    <button class="btn" data-act="csv" data-k="run" data-id="${run.id}">${esc(t('b.csv'))}</button>
    ${draft ? `<button class="btn" data-act="addadj" data-id="${run.id}">${esc(t('b.addAdj'))}</button>${owner ? `<button class="btn pri" data-act="approverun" data-id="${run.id}">${esc(t('b.approveRun'))}</button>` : ''}<button class="btn danger" data-act="delrun" data-id="${run.id}">${esc(t('b.delete'))}</button>` : ''}
    ${run.status === 'approved' ? `<button class="btn pri" data-act="markpaid" data-id="${run.id}">${esc(t('b.markPaid'))}</button>${owner ? `<button class="btn danger" data-act="reopenrun" data-id="${run.id}">${esc(t('b.reopen'))}</button>` : ''}` : ''}</div>
  ${(run.issues || []).map(issue).join('')}${draft && !owner ? `<p class="notice">${esc(t('ownerApproves'))}</p>` : ''}
  <div class="grid kpis"><div class="card kpi"><div class="n">${esc(money(tt.gross))}</div><div class="l">${esc(t('p.gross'))}</div></div><div class="card kpi good"><div class="n">${esc(money(tt.net))}</div><div class="l">${esc(t('p.net'))}</div></div><div class="card kpi"><div class="n">${esc(hrs(tt.regMin + tt.otMin))}</div><div class="l">${esc(t('hours'))}</div><div class="s">${esc(hrs(tt.otMin))} ${esc(t('k.overtime'))}</div></div><div class="card kpi"><div class="n">${esc(money(tt.tips))}</div><div class="l">${esc(t('p.tips'))}</div></div></div>
  <div class="tw" style="margin-top:1rem"><table><thead><tr><th>${esc(t('person'))}</th><th class="num">${esc(t('p.regHours'))}</th><th class="num">${esc(t('p.otHours'))}</th><th class="num">${esc(t('p.wages'))}</th><th class="num">${esc(t('p.tips'))}</th><th class="num">${esc(t('p.bonus'))}</th><th class="num">${esc(t('p.insurance'))}</th><th class="num">${esc(t('p.deductions'))}</th><th class="num">${esc(t('p.net'))}</th><th></th></tr></thead><tbody>
  ${(run.lines || []).map((l) => `<tr><td><b>${esc(ar() ? l.nameAr : l.name)}</b><div class="small muted">${esc(pname(l.positionId))} · ${esc(money(l.rate))}/${esc(t('hU'))}</div></td><td class="num">${esc(hrs(l.regMin))}</td><td class="num">${esc(hrs(l.otMin))}</td><td class="num">${esc(money(l.regPay + l.otPay))}</td><td class="num">${esc(money(l.tips))}</td><td class="num">${l.bonus ? esc(money(l.bonus)) : ''}</td><td class="num">${l.insurance ? esc(money(l.insurance)) : ''}</td><td class="num">${l.deductions ? esc(money(l.deductions)) : ''}</td><td class="num"><b>${esc(money(l.net))}</b></td><td>${l.slip ? `<button class="btn sm" data-act="slip" data-run="${run.id}" data-emp="${l.employeeId}">${esc(t('payslip'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
  ${run.adjustments.length ? `<div class="card" style="margin-top:1rem"><h2>${esc(t('adjustments'))}</h2>${run.adjustments.map((a) => `<div class="mrow"><span>${esc(enm(a.employeeId))} · ${pill(a.kind === 'bonus' ? '' : 'off', t('adj.' + a.kind))} ${esc(a.reason)}</span><span class="row"><b>${esc(money(a.amount))}</b>${draft ? `<button class="btn sm danger" data-act="rmadj" data-run="${run.id}" data-id="${a.id}">${esc(t('b.delete'))}</button>` : ''}</span></div>`).join('')}</div>` : ''}
  ${run.paidAt ? `<p class="muted">${esc(t('paidOn'))} ${esc(dt(run.paidAt))} · ${esc(t('pm.' + run.method))} · ${esc(run.paidBy)}</p>` : ''}${run.approvedBy ? `<p class="muted small">${esc(t('approvedBy'))} ${esc(run.approvedBy)}</p>` : ''}`;
}

// ---------- modals ----------
const modal = (title, body, wide) => `<div class="modal-bg" data-act="close"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}" data-act="stop"><div class="bar"><h2>${esc(title)}</h2><span class="sp"></span><button class="btn sm" data-act="close" aria-label="${esc(t('b.close'))}">✕</button></div>${body}</div></div>`;
const simple = (title, body, saveAct, id) => modal(title, `${body}<div class="acts"><button class="btn" data-act="close">${esc(t('b.cancel'))}</button><button class="btn pri" data-act="${saveAct}"${id ? ` data-id="${id}"` : ''}>${esc(t('b.save'))}</button></div>`);
const inp = (id, label, v = '', extra = '') => field(id, label, `<input id="${id}" value="${esc(v)}" ${extra}>`);
const posOpts = () => L.POSITIONS.map((p) => [p.id, pname(p.id)]);
const empOpts = (blank) => [...(blank ? [['', blank]] : []), ...D().employees.filter((e) => e.active).map((e) => [e.id, nm(e)])];
function shiftModal(m) {
  const sh = m.id ? D().shifts.find((x) => x.id === m.id) : null; const v = sh || { date: m.date || thisWeek(), start: '10:00', end: '18:00', positionId: 'waiter', breakMin: 30, note: '', employeeId: m.emp || '' };
  const cur = S.mo?.pos || v.positionId;
  const cands = D().employees.filter((e) => e.active).map((e) => ({ e, r: candStatus({ ...v, positionId: cur, id: sh?.id }, e) })).sort((a, b) => a.r.errors.length - b.r.errors.length || nm(a.e).localeCompare(nm(b.e)));
  const opts = [['', t('open')], ...cands.map(({ e, r }) => [e.id, `${nm(e)}${r.errors.length ? ' ✕ ' + r.errors.map(problemText).join(', ') : r.warnings.length ? ' ⚠ ' + r.warnings.map(problemText).join(', ') : ' ✓'}`])];
  return modal(sh ? t('ttl.shift') : t('ttl.newShift'), `${field('sh-d', t('date'), `<input id="sh-d" type="date" dir="ltr" value="${v.date}">`)}<div class="two">${field('sh-s', t('from'), `<input id="sh-s" type="time" dir="ltr" value="${v.start}">`)}${field('sh-e', t('to'), `<input id="sh-e" type="time" dir="ltr" value="${v.end}">`)}</div>${field('sh-p', t('position'), sel('sh-p', posOpts(), cur))}${field('sh-b', t('breakMin'), `<input id="sh-b" inputmode="numeric" dir="ltr" value="${v.breakMin}">`)}${field('sh-w', t('assignTo'), sel('sh-w', opts, v.employeeId || ''), t('eligHint'))}${inp('sh-n', t('note'), v.note || '', 'maxlength="80"')}
  <div class="acts">${sh ? `<button class="btn danger" data-act="delshift" data-id="${sh.id}">${esc(t('b.delete'))}</button>` : ''}<span class="sp"></span><button class="btn" data-act="close">${esc(t('b.cancel'))}</button><button class="btn pri" data-act="saveshift" data-id="${sh?.id || ''}">${esc(t('b.save'))}</button></div>`);
}
function empModal(m) {
  const e = m.id ? empOf(m.id) : null; const pay = canPay(); const dn = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
  if (!e) return simple(t('ttl.newEmp'), `${inp('em-n', t('name'), '', 'maxlength="40"')}${inp('em-a', t('nameAr'), '', 'maxlength="40"')}${field('em-p', t('position'), sel('em-p', posOpts(), 'waiter'))}${inp('em-ph', t('phone'), '', 'dir="ltr" placeholder="01012345678"')}${field('em-h', t('healthCard'), '<input id="em-h" type="date" dir="ltr">')}`, 'saveemp');
  const av = e.avail || {};
  return modal(nm(e), `<p>${e.positionIds.map(posTag).join(' ')} ${e.active ? pill('', t('f.active')) : pill('gray', t('f.inactive'))}</p>
  ${canMgr() ? `${inp('em-n', t('name'), e.name)}${inp('em-a', t('nameAr'), e.nameAr || '')}${inp('em-ph', t('phone'), e.phone || '', 'dir="ltr"')}${field('em-h', t('healthCard'), `<input id="em-h" type="date" dir="ltr" value="${e.healthCard || ''}">`)}${field('em-p', t('position'), sel('em-p', posOpts(), e.positionIds[0]))}<div class="acts"><button class="btn pri" data-act="saveemp" data-id="${e.id}">${esc(t('b.save'))}</button></div>` : ''}
  ${pay ? `<h3>${esc(t('payTerms'))}</h3><div class="two">${field('em-r', t('rate') + ' / ' + t('hU'), `<input id="em-r" inputmode="decimal" dir="ltr" value="${e.rate / 100}">`)}${field('em-i', t('insured'), sel('em-i', [['1', t('yes')], ['0', t('no')]], e.insured ? '1' : '0'))}</div><div class="acts"><button class="btn pri" data-act="savepay" data-id="${e.id}">${esc(t('b.save'))}</button></div>` : ''}
  <h3>${esc(t('availability'))}</h3>${[0, 1, 2, 3, 4, 5, 6].map((i) => { const a = av[i] || { mode: 'any' }; return `<div class="avrow"><b>${esc(t('d.' + dn[i]))}</b>${sel('av-m' + i, [['any', t('av.any')], ['off', t('av.off')], ['window', t('av.window')]], a.mode)}<input id="av-f${i}" type="time" dir="ltr" value="${a.from || '10:00'}"><input id="av-t${i}" type="time" dir="ltr" value="${a.to || '18:00'}"></div>`; }).join('')}
  <div class="acts">${canMgr() ? `<button class="btn ${e.active ? 'danger' : ''}" data-act="toggleemp" data-id="${e.id}">${esc(e.active ? t('b.deactivate') : t('b.activate'))}</button>` : ''}<span class="sp"></span><button class="btn pri" data-act="saveavail" data-id="${e.id}">${esc(t('b.saveAvail'))}</button></div>`, true);
}
function availModal() { return empModal({ id: me().employeeId }); }
function punchModal(m) {
  const p = m.id ? D().punches.find((x) => x.id === m.id) : null; const d0 = p ? dnm(p.in) : D().today;
  return modal(p ? t('ttl.editPunch') : t('ttl.addPunch'), `${p ? `<p><b>${esc(enm(p.employeeId))}</b></p>` : field('pu-e', t('person'), sel('pu-e', empOpts(), ''))}${field('pu-d', t('date'), `<input id="pu-d" type="date" dir="ltr" value="${d0}">`)}<div class="two">${field('pu-i', t('in'), `<input id="pu-i" type="time" dir="ltr" value="${p ? tmEn(p.in) : '10:00'}">`)}${field('pu-o', t('out'), `<input id="pu-o" type="time" dir="ltr" value="${p?.out ? tmEn(p.out) : '18:00'}">`)}</div>${field('pu-b', t('breakMin'), `<input id="pu-b" inputmode="numeric" dir="ltr" value="${p ? p.breakMin : 30}">`)}${inp('pu-r', t('reason'), '', 'maxlength="100"')}
  <div class="acts">${p ? `<button class="btn danger" data-act="voidpunch" data-id="${p.id}">${esc(t('b.void'))}</button>` : ''}<span class="sp"></span><button class="btn" data-act="close">${esc(t('b.cancel'))}</button><button class="btn pri" data-act="savepunch" data-id="${p?.id || ''}">${esc(t('b.save'))}</button></div>`);
}
const tmEn = (ts) => L.hmOf(L.localParts(ts).min);
function modalHtml() {
  const m = S.modal; if (!m) return '';
  if (m.type === 'shift') return shiftModal(m);
  if (m.type === 'emp') return empModal(m);
  if (m.type === 'avail') return availModal();
  if (m.type === 'punch') return punchModal(m);
  if (m.type === 'slip') return modal(t('payslip'), slipHtml(m.slip, m.slip.line) + `<div class="acts noprint"><button class="btn" data-act="close">${esc(t('b.cancel'))}</button><button class="btn pri" data-act="print">${esc(t('b.print'))}</button></div>`, true);
  if (m.type === 'giveaway') { const sh = D().shifts.find((x) => x.id === m.id); const mine = me().employeeId; const others = D().shifts.filter((x) => x.employeeId && x.employeeId !== mine && x.published && L.shiftStartTs(x) > D().nowTs && x.positionId === sh.positionId).slice(0, 25);
    return simple(t('b.giveSwap'), `<p><b>${esc(shiftLabel(sh))}</b></p>${field('sw-k', t('sw.type'), sel('sw-k', [['give', t('sw.give')], ['swap', t('sw.swap')]], 'give'))}${field('sw-w', t('sw.with'), sel('sw-w', others.map((x) => [x.id, `${enm(x.employeeId)} · ${shiftLabel(x)}`]), ''), t('sw.withHint'))}${field('sw-t', t('sw.to'), sel('sw-t', [['', t('sw.anyone')], ...empOpts().filter(([i]) => i !== mine)], ''))}${inp('sw-n', t('note'), '', 'maxlength="120"')}`, 'saveswap', sh.id); }
  if (m.type === 'newto') return simple(t('b.timeOff'), `<div class="two">${field('to-f', t('from'), `<input id="to-f" type="date" dir="ltr" value="${L.addDays(D().today, 3)}">`)}${field('to-t', t('to'), `<input id="to-t" type="date" dir="ltr" value="${L.addDays(D().today, 3)}">`)}</div>${inp('to-r', t('reason'), '', 'maxlength="100"')}`, 'savetoff');
  if (m.type === 'newcor') return simple(t('b.correction'), `${field('co-d', t('date'), `<input id="co-d" type="date" dir="ltr" value="${L.addDays(D().today, -1)}">`)}<div class="two">${field('co-i', t('in'), '<input id="co-i" type="time" dir="ltr" value="10:00">')}${field('co-o', t('out'), '<input id="co-o" type="time" dir="ltr" value="18:00">')}</div>${inp('co-r', t('reason'), '', 'maxlength="100"')}`, 'savecor');
  if (m.type === 'newtips') return simple(t('b.addTips'), `${field('ti-d', t('date'), `<input id="ti-d" type="date" dir="ltr" value="${D().today}">`)}<div class="two">${field('ti-c', t('cash'), '<input id="ti-c" inputmode="decimal" dir="ltr" value="0">')}${field('ti-k', t('card'), '<input id="ti-k" inputmode="decimal" dir="ltr" value="0">')}</div>${inp('ti-n', t('note'), '', 'maxlength="80"')}`, 'savetips');
  if (m.type === 'newrun') { const w = thisWeek(); return simple(t('b.newRun'), `${field('ru-f', t('period'), sel('ru-f', [-4, -3, -2, -1, 0].map((n) => [L.addDays(w, n * 7), dt(L.addDays(w, n * 7))]), L.addDays(w, -14)), t('runHint'))}${field('ru-w', t('weeks'), sel('ru-w', [['1', '1'], ['2', '2']], '2'))}`, 'saverun'); }
  if (m.type === 'adj') return simple(t('b.addAdj'), `${field('aj-e', t('person'), sel('aj-e', empOpts(), ''))}${field('aj-k', t('kind'), sel('aj-k', [['bonus', t('adj.bonus')], ['deduction', t('adj.deduction')]], 'bonus'))}${field('aj-a', t('amount'), '<input id="aj-a" inputmode="decimal" dir="ltr">')}${inp('aj-r', t('reason'), '', 'maxlength="80"')}`, 'saveadj', m.id);
  if (m.type === 'paid') return simple(t('b.markPaid'), `${field('pd-m', t('method'), sel('pd-m', [['cash', t('pm.cash')], ['bank', t('pm.bank')], ['wallet', t('pm.wallet')]], 'cash'), t('paidHint'))}${field('pd-d', t('date'), `<input id="pd-d" type="date" dir="ltr" value="${D().today}">`)}`, 'savepaid', m.id);
  return '';
}
function render() {
  document.documentElement.lang = S.lang; document.documentElement.dir = T[S.lang].dir; document.title = t('appName') + ' | ' + t('appSub');
  const app = $('#app');
  if (!S.token || !S.data) { app.innerHTML = loginView(); $('#pin')?.focus(); return; }
  const r = route(); const nav = NAV[role()] || []; if (!nav.includes(r)) { location.hash = '#/' + nav[0]; return; }
  app.innerHTML = shell(PAGES[r]()) + modalHtml();
}

// ---------- actions ----------
const open = (m) => { S.modal = m; S.mo = {}; render(); };
const done = (r) => { if (r) { S.modal = null; render(); } return r; };
const me_ = () => me().employeeId;
const warn = (r) => { if (r?.warnings?.length) toast(r.warnings.map(problemText).join(' · ')); };
const H = {
  pin: (d) => login(d.pin), lang: () => { S.lang = S.lang === 'en' ? 'ar' : 'en'; LS.set('lang', S.lang); render(); }, logout, close: () => { S.modal = null; render(); }, stop: () => {}, print: () => window.print(),
  reset: async () => { if (!confirm(t('confirmReset'))) return; if (await act({ type: 'reset' }, t('msgs.saved'))) render(); },
  wk: (d) => { const n = Number(d.n); S.wk = n === 0 ? null : L.addDays(curWk(), n * 7); render(); },
  tab: (d) => { S.tab = d.k; render(); }, tipday: (d) => { S.tipDay = d.d; render(); },
  runs: () => { S.rid = null; render(); }, run: (d) => { S.rid = d.id; render(); },
  newshift: (d) => open({ type: 'shift', date: d.date, emp: d.emp }), shift: (d) => open({ type: 'shift', id: d.id }),
  saveshift: async (d) => { const op = { date: val('sh-d'), start: val('sh-s'), end: val('sh-e'), positionId: val('sh-p'), breakMin: toInt(val('sh-b')), note: val('sh-n') }; const w = val('sh-w'); let r;
    if (d.id) { r = await act({ type: 'updateShift', shiftId: d.id, ...op }); if (r) { const cur = D().shifts.find((x) => x.id === d.id); if ((cur.employeeId || '') !== w) r = await act({ type: 'assignShift', shiftId: d.id, employeeId: w || null }); } }
    else r = await act({ type: 'createShift', key: rid(), ...op, employeeId: w || null }); if (r) { warn(r); done(r); toast(t('msgs.saved')); } },
  delshift: async (d) => { if (confirm(t('confirmDel')) && (await act({ type: 'deleteShift', shiftId: d.id }, t('msgs.saved')))) { S.modal = null; render(); } },
  publish: async () => { const wk = curWk(); const pub = D().published[wk]; await act({ type: pub ? 'publishWeek' : 'publishWeek', week: wk }, t('msgs.published')); },
  copyweek: async () => { await act({ type: 'copyWeek', from: L.addDays(curWk(), -7), to: curWk() }, t('msgs.saved')); },
  emp: (d) => open({ type: 'emp', id: d.id }), newemp: () => open({ type: 'emp' }), avail: () => open({ type: 'avail' }),
  saveemp: async (d) => { const base = { name: val('em-n'), nameAr: val('em-a'), positionIds: [val('em-p')], phone: val('em-ph'), healthCard: val('em-h') || null }; done(d.id ? await act({ type: 'updateEmployee', employeeId: d.id, ...base }, t('msgs.saved')) : await act({ type: 'addEmployee', key: rid(), ...base, hired: D().today }, t('msgs.saved'))); },
  savepay: async (d) => { done(await act({ type: 'setPay', employeeId: d.id, rate: toCents(val('em-r')), insured: val('em-i') === '1' }, t('msgs.saved'))); },
  toggleemp: async (d) => { const e = empOf(d.id); const reason = e.active ? prompt(t('reason'), '') : ''; if (e.active && reason === null) return; done(await act({ type: 'setActive', employeeId: d.id, active: !e.active, reason: reason || '' }, t('msgs.saved'))); },
  saveavail: async (d) => { const days = {}; for (let i = 0; i < 7; i++) { const m = val('av-m' + i); days[i] = m === 'window' ? { mode: 'window', from: val('av-f' + i), to: val('av-t' + i) } : { mode: m }; } done(await act({ type: 'setAvailability', employeeId: d.id, days }, t('msgs.saved'))); },
  giveaway: (d) => open({ type: 'giveaway', id: d.id }),
  saveswap: async (d) => { const k = val('sw-k'); done(await act({ type: 'requestSwap', shiftId: d.id, kind: k, withShiftId: k === 'swap' ? val('sw-w') : undefined, toEmpId: val('sw-t') || undefined, note: val('sw-n') }, t('msgs.sent'))); },
  claim: async (d) => { await act({ type: 'claimShift', shiftId: d.id, note: '' }, t('msgs.sent')); },
  swapyes: (d) => act({ type: 'respondSwap', id: d.id, accept: true }, t('msgs.saved')), swapdecl: (d) => act({ type: 'respondSwap', id: d.id, accept: false }, t('msgs.saved')),
  swapok: (d) => act({ type: 'decideSwap', id: d.id, approve: true }, t('msgs.saved')), swapno: (d) => { const n = prompt(t('reason'), ''); if (n === null) return; return act({ type: 'decideSwap', id: d.id, approve: false, note: n }, t('msgs.saved')); },
  swapcancel: (d) => act({ type: 'cancelSwap', id: d.id }, t('msgs.saved')),
  newto: () => open({ type: 'newto' }), savetoff: async () => { done(await act({ type: 'requestTimeOff', employeeId: me_(), from: val('to-f'), to: val('to-t'), reason: val('to-r') }, t('msgs.sent'))); },
  took: (d) => act({ type: 'decideTimeOff', id: d.id, approve: true }, t('msgs.saved')), tono: (d) => { const n = prompt(t('reason'), ''); if (n === null) return; return act({ type: 'decideTimeOff', id: d.id, approve: false, note: n }, t('msgs.saved')); }, tocancel: (d) => act({ type: 'cancelTimeOff', id: d.id }, t('msgs.saved')),
  newcor: () => open({ type: 'newcor' }), savecor: async () => { done(await act({ type: 'requestCorrection', employeeId: me_(), date: val('co-d'), in: val('co-i'), out: val('co-o'), reason: val('co-r') }, t('msgs.sent'))); },
  corok: (d) => act({ type: 'decideCorrection', id: d.id, approve: true }, t('msgs.saved')), corno: (d) => { const n = prompt(t('reason'), ''); if (n === null) return; return act({ type: 'decideCorrection', id: d.id, approve: false, note: n }, t('msgs.saved')); },
  clockin: () => act({ type: 'clockIn', employeeId: me_() }, t('msgs.clockedIn')), clockout: () => act({ type: 'clockOut', employeeId: me_() }, t('msgs.clockedOut')),
  startbreak: () => act({ type: 'startBreak', employeeId: me_() }), endbreak: () => act({ type: 'endBreak', employeeId: me_() }),
  mgrout: (d) => act({ type: 'clockOut', employeeId: d.id }, t('msgs.clockedOut')),
  newpunch: () => open({ type: 'punch' }), editpunch: (d) => open({ type: 'punch', id: d.id }),
  savepunch: async (d) => { const date = val('pu-d'); const op = { date, in: val('pu-i'), out: val('pu-o'), breakMin: toInt(val('pu-b')), reason: val('pu-r') }; const outDate = op.out <= op.in ? L.addDays(date, 1) : date; done(d.id ? await act({ type: 'editPunch', id: d.id, ...op, outDate }, t('msgs.saved')) : await act({ type: 'addPunch', key: rid(), employeeId: val('pu-e'), ...op, outDate }, t('msgs.saved'))); },
  voidpunch: async (d) => { const r = prompt(t('reason'), ''); if (r === null) return; done(await act({ type: 'voidPunch', id: d.id, reason: r }, t('msgs.saved'))); },
  approvets: async () => { const wk = curWk(); await act({ type: 'approveTimesheet', from: wk, to: L.addDays(wk, 6) }, t('msgs.saved')); },
  newtips: () => open({ type: 'newtips' }), savetips: async () => { done(await act({ type: 'addTips', key: rid(), date: val('ti-d'), cash: toCents(val('ti-c')), card: toCents(val('ti-k')), note: val('ti-n') }, t('msgs.saved'))); S.tipDay = val('ti-d') || S.tipDay; },
  deltips: (d) => act({ type: 'deleteTips', id: d.id }, t('msgs.saved')),
  newrun: () => open({ type: 'newrun' }), saverun: async () => { const r = await act({ type: 'createRun', from: val('ru-f'), weeks: Number(val('ru-w')) }, t('msgs.saved')); if (r) { S.modal = null; S.rid = r.id || null; render(); } },
  delrun: async (d) => { if (confirm(t('confirmDel')) && (await act({ type: 'deleteRun', runId: d.id }, t('msgs.saved')))) { S.rid = null; render(); } },
  addadj: (d) => open({ type: 'adj', id: d.id }), saveadj: async (d) => { done(await act({ type: 'addAdjustment', runId: d.id, employeeId: val('aj-e'), kind: val('aj-k'), amount: toCents(val('aj-a')), reason: val('aj-r') }, t('msgs.saved'))); },
  rmadj: (d) => act({ type: 'removeAdjustment', runId: d.run, id: d.id }, t('msgs.saved')),
  approverun: async (d) => { if (confirm(t('confirmApprove'))) await act({ type: 'approveRun', runId: d.id }, t('msgs.approved')); },
  markpaid: (d) => open({ type: 'paid', id: d.id }), savepaid: async (d) => { done(await act({ type: 'markPaid', runId: d.id, method: val('pd-m'), date: val('pd-d') }, t('msgs.saved'))); },
  reopenrun: async (d) => { const r = prompt(t('reason'), ''); if (r === null) return; await act({ type: 'reopenRun', runId: d.id, reason: r }, t('msgs.saved')); },
  slip: (d) => { const D_ = D(); let slip; if (d.id) { const p = D_.payslips.find((x) => x.id === d.id); slip = p && { ...p, run: p.no }; } else { const run = D_.runs.find((r) => r.id === d.run); const line = run.lines.find((l) => l.employeeId === d.emp); slip = { line, from: run.from, to: run.to, no: run.no, status: run.status, paidAt: run.paidAt }; } if (slip) open({ type: 'slip', slip }); },
  savesettings: async () => { const op = { type: 'updateSettings' }; for (const k of ['otAfterHours', 'otPercent', 'insurancePercent', 'cardFeePercent', 'maxDailyHours', 'maxWeekPlanHours', 'minRestHours', 'roundMin']) op[k] = toInt(val('s-' + k)); await act(op, t('msgs.saved')); },
  remind: (d, el) => { window.open(el.getAttribute('href'), '_blank', 'noopener'); act({ type: 'logReminder', key: d.key }, t('msgs.logged')); },
  csv: (d) => { const v = D(); if (d.k === 'weeks') downloadCsv('weekly-report.csv', [['Week', 'Hours', 'Overtime h', 'Cost EGP', 'Sales EGP'], ...v.reports.weeks.map((w) => [w.week, (w.hours / 60).toFixed(1), (w.ot / 60).toFixed(1), (w.cost || 0) / 100, (w.sales || 0) / 100])]);
    if (d.k === 'run') { const r = v.runs.find((x) => x.id === d.id); downloadCsv(r.no + '.csv', [['Employee', 'Position', 'Regular h', 'Overtime h', 'Wages EGP', 'Tips EGP', 'Bonus EGP', 'Insurance EGP', 'Deductions EGP', 'Net EGP'], ...r.lines.map((l) => [l.name, pname(l.positionId), (l.regMin / 60).toFixed(2), (l.otMin / 60).toFixed(2), (l.regPay + l.otPay) / 100, l.tips / 100, (l.bonus || 0) / 100, (l.insurance || 0) / 100, (l.deductions || 0) / 100, l.net / 100])]); } },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.dataset.act === 'close' && el.classList.contains('modal-bg') && e.target !== el) return;
  if (el.dataset.act === 'stop') return;
  const f = H[el.dataset.act]; if (!f) return;
  if ((el.tagName === 'TR' || el.classList.contains('click') || el.classList.contains('cell')) && e.target.closest('button,a,input,select,textarea') && e.target.closest('[data-act]') !== el) return;
  if (el.tagName !== 'A' || el.dataset.act === 'remind') e.preventDefault();
  f(el.dataset, el, e);
});
document.addEventListener('submit', (e) => { if (e.target.id === 'pinform') { e.preventDefault(); login(val('pin').trim()); } });
document.addEventListener('change', (e) => {
  const id = e.target.id;
  if (id === 'pf') { S.pf = e.target.value; render(); } else if (id === 'ef') { S.ef = e.target.value; render(); } else if (id === 'ef2') { S.ef2 = e.target.value; render(); } else if (id === 'swteam') { S.sw = e.target.checked; render(); }
  else if (id === 'sh-p') { const f = {}; document.querySelectorAll('.modal input[id],.modal select[id]').forEach((x) => (f[x.id] = x.value)); S.mo = { pos: e.target.value }; render(); for (const k in f) { const x = $('#' + k); if (x && k !== 'sh-w') x.value = f[k]; } }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal) { S.modal = null; render(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('click')) { e.preventDefault(); e.target.click(); }
});
window.addEventListener('hashchange', () => { S.modal = null; S.rid = null; render(); });
(async function init() { if (S.token) await refresh(); if (S.err && !S.data) { S.token = null; } render(); })();
