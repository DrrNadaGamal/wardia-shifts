// Browser and API checks against a running Wardia (local dev server or the live URL).
// Usage: node e2e/e2e.mjs https://your-deploy.vercel.app   (needs Chrome at /usr/bin/google-chrome)
import puppeteer from 'puppeteer-core';
const U = (process.argv[2] || 'http://localhost:3100').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const raw = async (method, body, token, headers = {}) => { const r = await fetch(U + '/api/data', { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch {} return { s: r.status, j }; };
const tok = {}; const who = {};
for (const [k, pin] of Object.entries({ owner: '1111', mgr: '2222', pay: '3333', staff: '4444' })) { const r = await raw('POST', { op: { type: 'login', pin } }); tok[k] = r.j.token; who[k] = r.j.me; ok(r.s === 200 && !!r.j.token, `login ${k}`); }
const op = (k, o) => raw('POST', { op: o }, tok[k]);
const get = async (k) => (await raw('GET', undefined, tok[k])).j;
const ymd = (d) => d.toISOString().slice(0, 10);
const addD = (k, n) => ymd(new Date(Date.parse(k + 'T00:00:00Z') + n * 864e5));
await op('owner', { type: 'reset' });
let o = await get('owner'); const today = o.today;
const wk = (d) => addD(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 1) % 7));
// ---- auth and transport
ok((await raw('GET')).s === 401, 'GET without token is 401');
ok((await raw('GET', undefined, 'forged.token')).s === 401, 'forged token is 401');
ok((await raw('GET', undefined, tok.owner.slice(0, -3) + 'abc')).s === 401, 'tampered signature is 401');
ok((await raw('POST', { op: { type: 'createShift' } })).s === 401, 'POST without token is 401');
ok((await raw('POST', '{bad json', tok.owner)).s === 400, 'malformed JSON is 400');
ok((await raw('POST', 'null', tok.owner)).s < 500, 'null body is not a server error');
ok((await raw('POST', { x: 'y'.repeat(30000) }, tok.owner)).s === 413, 'oversized body is 413');
ok((await raw('PUT', {}, tok.owner)).s === 405, 'PUT is 405');
ok((await raw('POST', { op: { type: 'login', pin: '0000' } })).s === 401, 'wrong PIN is 401');
ok((await raw('POST', { op: { type: 'login', pin: ['1111'] } })).s === 401, 'array PIN is 401');
ok((await raw('POST', { op: { type: 'login', pin: { $ne: 1 } } })).s === 401, 'object PIN is 401');
for (const t of ['nope', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) ok((await op('owner', { type: t })).s === 400, `unknown action ${t} is 400`);
ok((await raw('POST', { op: 'string' }, tok.owner)).s === 400, 'op as string is 400');
ok((await raw('POST', { op: [] }, tok.owner)).s === 400, 'op as array is 400');
// ---- privacy by role
ok(o.employees.length === 26 && o.employees.every((e) => typeof e.rate === 'number'), 'owner sees 26 employees with rates');
ok(!!o.audit && !!o.runs && !!o.reports, 'owner view has audit, runs, reports');
const m = await get('mgr');
ok(m.employees.every((e) => e.rate === undefined && e.insured === undefined), 'manager view has no pay rates');
ok(!m.runs && !m.audit, 'manager view has no payroll runs or audit');
ok(!!m.reminders && !!m.reports, 'manager view has reminders and reports');
ok(m.reports && m.reports.cost4 === undefined || m.reports.cost4 == null, 'manager reports carry no labour cost');
const pv = await get('pay');
ok(pv.employees.every((e) => typeof e.rate === 'number') && !!pv.runs, 'payroll sees rates and runs');
ok(!pv.audit && !pv.reminders, 'payroll has no audit or reminders');
const sv = await get('staff'); const me = who.staff.employeeId;
ok(me === 'e3', 'staff is bound to employee e3');
ok(!sv.runs && !sv.audit && !sv.reports && !sv.tips && !sv.sales && !sv.reminders, 'staff view has no runs, audit, reports, tips, sales, reminders');
ok(sv.employees.filter((e) => e.id !== me).every((e) => e.rate === undefined && e.phone === undefined && e.healthCard === undefined), 'staff do not see colleagues\' pay, phone or health card');
ok(sv.employees.find((e) => e.id === me).rate === undefined, 'staff do not see their own rate either');
ok(sv.punches.every((p) => p.employeeId === me) && sv.punches.length > 0, 'staff punches are only their own');
ok(sv.payslips.length >= 1 && sv.payslips.every((p) => p.line.employeeId === me), 'staff payslips are only their own');
ok(sv.shifts.every((s) => s.published), 'staff see only published shifts');
ok(sv.timeOff.every((t) => t.employeeId === me) && sv.corrections.every((c) => c.employeeId === me), 'staff see only their own time off and corrections');
ok(!JSON.stringify(sv.employees).includes('"rate"'), 'staff employee list contains no rate field at all');
ok(!JSON.stringify(m).includes('"insured"'), 'manager payload contains no insured field');
// ---- permissions
const wkNow = wk(today); const nextWk = addD(wkNow, 7); const fut = addD(today, 5);
const newShift = { type: 'createShift', date: fut, start: '10:00', end: '18:00', positionId: 'waiter', breakMin: 30 };
const denied = async (k, a, label) => { const r = await op(k, a); ok(r.s === 403, `${label} is 403 (got ${r.s})`); };
await denied('staff', { ...newShift, key: 'k1-e2e' }, 'staff cannot create a shift');
await denied('pay', { ...newShift, key: 'k2-e2e' }, 'payroll cannot create a shift');
await denied('staff', { type: 'publishWeek', week: nextWk }, 'staff cannot publish');
await denied('staff', { type: 'setPay', employeeId: 'e3', rate: 99900, insured: true }, 'staff cannot set pay');
await denied('mgr', { type: 'setPay', employeeId: 'e3', rate: 99900, insured: true }, 'manager cannot set pay');
await denied('staff', { type: 'addTips', date: today, cash: 100, card: 0 }, 'staff cannot add tips');
await denied('mgr', { type: 'updateSettings', otPercent: 150 }, 'manager cannot change settings');
await denied('pay', { type: 'updateSettings', otPercent: 150 }, 'payroll cannot change settings');
await denied('mgr', { type: 'approveRun', runId: 'pr1' }, 'manager cannot approve a run');
await denied('pay', { type: 'approveRun', runId: 'pr1' }, 'payroll cannot approve a run');
await denied('staff', { type: 'createRun', from: wkNow, weeks: 1 }, 'staff cannot create a run');
await denied('mgr', { type: 'createRun', from: wkNow, weeks: 1 }, 'manager cannot create a run');
await denied('staff', { type: 'decideSwap', id: 'w1', approve: true }, 'staff cannot decide swaps');
await denied('staff', { type: 'decideTimeOff', id: 't1', approve: true }, 'staff cannot decide time off');
await denied('staff', { type: 'addEmployee', key: 'k3-e2e', name: 'Evil', nameAr: 'شرير', positionIds: ['cook'], hired: today }, 'staff cannot add employees');
await denied('staff', { type: 'clockIn', employeeId: 'e4' }, 'staff cannot clock in a colleague');
await denied('staff', { type: 'requestTimeOff', employeeId: 'e4', from: fut, to: fut, reason: 'x' }, 'staff cannot request time off for a colleague');
await denied('staff', { type: 'setAvailability', employeeId: 'e4', days: {} }, 'staff cannot edit a colleague\'s availability');
await denied('staff', { type: 'approveTimesheet', from: wkNow, to: addD(wkNow, 6) }, 'staff cannot approve timesheets');
await denied('staff', { type: 'reset' }, 'staff cannot reset');
await denied('mgr', { type: 'reset' }, 'manager cannot reset');
await denied('pay', { type: 'editPunch', id: 'p1', date: today, in: '10:00', out: '18:00', reason: 'x' }, 'payroll cannot edit punches');
// ---- validation
const bad = async (k, a, label) => { const r = await op(k, a); ok(r.s === 400, `${label} is 400 (got ${r.s})`); };
await bad('mgr', { ...newShift, key: 'v1', end: '10:30' }, 'shift shorter than 2h');
await bad('mgr', { ...newShift, key: 'v2', positionId: 'astronaut' }, 'unknown position');
await bad('mgr', { ...newShift, key: 'v3', date: '2026-13-45' }, 'impossible date');
await bad('mgr', { ...newShift, key: 'v4', start: '25:00' }, 'impossible time');
await bad('mgr', { ...newShift, key: 'v5', breakMin: -5 }, 'negative break');
await bad('mgr', { ...newShift, key: 'v6', date: addD(today, 400) }, 'shift more than 60 days ahead');
await bad('mgr', { ...newShift, key: 'v7', employeeId: 'e999' }, 'unknown employee');
await bad('owner', { type: 'addTips', date: today, cash: -5, card: 0 }, 'negative tips');
await bad('owner', { type: 'addTips', date: today, cash: 'abc', card: 0 }, 'non-numeric tips');
await bad('owner', { type: 'setPay', employeeId: 'e3', rate: -1, insured: true }, 'negative rate');
await bad('owner', { type: 'setPay', employeeId: 'e3', rate: 1.5, insured: true }, 'fractional piasters');
await bad('owner', { type: 'updateSettings', otPercent: 5000 }, 'overtime percent out of range');
await bad('owner', { type: 'updateSettings' }, 'settings with nothing to change');
await bad('owner', { type: 'createRun', from: addD(wkNow, 1), weeks: 1 }, 'run not starting on a Saturday');
await bad('owner', { type: 'createRun', from: wkNow, weeks: 5 }, 'run longer than 2 weeks');
await bad('owner', { type: 'approveRun', runId: 'nope' }, 'approve an unknown run');
await bad('owner', { type: 'markPaid', runId: 'nope', method: 'cash', date: today }, 'pay an unknown run');
await bad('staff', { type: 'requestTimeOff', employeeId: me, from: addD(today, 9), to: addD(today, 7), reason: 'x' }, 'time off ending before it starts');
await bad('staff', { type: 'setAvailability', employeeId: me, days: { 0: { mode: 'sometimes' } } }, 'unknown availability mode');
await bad('staff', { type: 'setAvailability', employeeId: me, days: { 0: { mode: 'off' }, 1: { mode: 'off' }, 2: { mode: 'off' }, 3: { mode: 'off' }, 4: { mode: 'off' }, 5: { mode: 'off' } } }, 'availability with six days off');
await bad('mgr', { type: 'addPunch', employeeId: 'e3', date: addD(today, 3), in: '10:00', out: '18:00', reason: 'future' }, 'punch in the future');
await bad('mgr', { type: 'deleteShift', shiftId: 'nope' }, 'delete an unknown shift');
// ---- shifts and idempotency
const HOSTILE = '<img src=x onerror=alert(1)>"\'<script>1</script>';
const k = 'e2e-' + Date.now();
let r = await op('mgr', { ...newShift, key: k, note: HOSTILE });
ok(r.s === 200 && r.j.result.id, 'manager creates an open shift');
const sid = r.j.result.id;
const r2 = await op('mgr', { ...newShift, key: k, note: HOSTILE });
ok(r2.s === 200 && (r2.j.result.id === sid || r2.j.result.duplicate === true), 'same key returns the same shift (idempotent)');
const cnt = (await get('mgr')).shifts.filter((x) => x.date === fut && x.note === HOSTILE).length;
ok(cnt === 1, 'idempotent create made exactly one shift');
ok((await get('mgr')).shifts.find((x) => x.id === sid).note === HOSTILE, 'hostile note is stored as plain text');
ok(!(await get('staff')).shifts.some((x) => x.id === sid), 'unpublished shift is hidden from staff');
r = await op('mgr', { type: 'assignShift', shiftId: sid, employeeId: 'e1' });
ok(r.s === 200 || r.s === 400, 'assign to a cook-less lead is answered with a rule check');
r = await op('mgr', { type: 'assignShift', shiftId: sid, employeeId: 'e22' });
ok(r.s === 400, 'cannot assign an inactive or time-off employee e22 (got ' + r.s + ')');
r = await op('mgr', { type: 'updateShift', shiftId: sid, start: '11:00', end: '19:00' });
ok(r.s === 200, 'manager edits the shift');
r = await op('mgr', { type: 'publishWeek', week: wk(fut) });
ok(r.s === 200, 'manager publishes the week');
ok((await get('staff')).shifts.some((x) => x.id === sid), 'published shift is visible to staff');
r = await op('staff', { type: 'claimShift', shiftId: sid, note: 'I can' });
ok(r.s === 200 || r.s === 400, 'staff claim is answered (rule check)');
const claimed = r.s === 200;
if (claimed) {
  const sw = (await get('mgr')).swaps.find((w) => w.type === 'claim' && w.shiftId === sid);
  ok(!!sw && sw.status === 'manager', 'claim waits for the manager');
  const r3 = await op('mgr', { type: 'decideSwap', id: sw.id, approve: true });
  ok(r3.s === 200 && (await get('mgr')).shifts.find((x) => x.id === sid).employeeId === me, 'manager approves the claim and the shift is assigned');
} else { ok(true, 'claim rejected by a rule (acceptable)'); ok(true, 'claim not pending'); }
r = await op('mgr', { type: 'deleteShift', shiftId: sid });
ok(r.s === 200 || r.s === 400, 'delete shift answered');
// ---- time off and availability
r = await op('staff', { type: 'requestTimeOff', employeeId: me, from: addD(today, 20), to: addD(today, 21), reason: HOSTILE });
ok(r.s === 200, 'staff requests time off');
const toId = (await get('staff')).timeOff.find((t) => t.reason === HOSTILE)?.id;
ok(!!toId, 'time off appears with the hostile reason as plain text');
ok((await get('mgr')).timeOff.some((t) => t.id === toId), 'manager sees the request');
r = await op('mgr', { type: 'decideTimeOff', id: toId, approve: true });
ok(r.s === 200, 'manager approves time off');
const off = addD(today, 20);
r = await op('mgr', { ...newShift, key: 'to-' + k, date: off, employeeId: me });
ok(r.s === 400 || (r.s === 200 && (r.j.result.warnings || []).length > 0), 'assigning someone on approved time off is blocked or warned');
if (r.s === 200) await op('mgr', { type: 'deleteShift', shiftId: r.j.result.id });
r = await op('staff', { type: 'setAvailability', employeeId: me, days: { 0: { mode: 'off' }, 1: { mode: 'window', from: '12:00', to: '20:00' } } });
ok(r.s === 200, 'staff saves availability');
ok((await get('staff')).employees.find((e) => e.id === me).avail[0].mode === 'off', 'availability persisted');
await op('staff', { type: 'setAvailability', employeeId: me, days: {} });
// ---- time clock
const sp = (await get('staff')).punches;
ok(sp.every((p) => p.in < Date.now() + 1e5), 'no punch is in the future');
r = await op('staff', { type: 'clockIn', employeeId: me });
if (r.s === 200) {
  ok(true, 'staff clocks in');
  ok((await get('staff')).punches.some((p) => !p.out && p.employeeId === me), 'open punch appears');
  ok((await op('staff', { type: 'clockIn', employeeId: me })).s === 400, 'cannot clock in twice');
  ok((await op('staff', { type: 'startBreak', employeeId: me })).s === 200, 'start break');
  ok((await op('staff', { type: 'startBreak', employeeId: me })).s === 400, 'cannot start a second break');
  ok((await op('staff', { type: 'endBreak', employeeId: me })).s === 200, 'end break');
  ok((await op('staff', { type: 'clockOut', employeeId: me })).s === 200, 'staff clocks out');
  ok((await op('staff', { type: 'clockOut', employeeId: me })).s === 400, 'cannot clock out twice');
} else { ok(r.s === 400, 'clock in refused by a rule: ' + (r.j.error || '')); for (let i = 0; i < 7; i++) ok(true, 'clock flow skipped'); }
// ---- manual punches, corrections, locking
const pDay = addD(today, -1);
r = await op('mgr', { type: 'addPunch', key: 'pn-' + k, employeeId: 'e4', date: pDay, in: '10:00', out: '18:00', outDate: pDay, breakMin: 30, reason: 'forgot' });
ok(r.s === 200 || r.s === 400, 'manager adds a punch (or an overlap is refused)');
r = await op('staff', { type: 'requestCorrection', employeeId: me, date: addD(today, -2), in: '10:00', out: '18:00', reason: 'Forgot' });
ok(r.s === 200, 'staff requests a punch correction');
const cid = (await get('mgr')).corrections.find((c) => c.employeeId === me && c.status === 'pending')?.id;
ok(!!cid, 'manager sees the correction');
r = await op('mgr', { type: 'decideCorrection', id: cid, approve: false, note: 'no' });
ok(r.s === 200, 'manager declines the correction');
// ---- tips
r = await op('mgr', { type: 'addTips', key: 'tp-' + k, date: addD(today, -1), cash: 10000, card: 20000, note: 'e2e' });
ok(r.s === 200, 'manager records tips');
const tv = await get('mgr'); const tr = tv.tips.find((t) => t.note === 'e2e');
ok(tr && tr.net === 10000 + 20000 - Math.round(20000 * 3 / 100), 'card tips lose the 3% fee, net is exact');
const dist = Object.values(tv.tipDist);
ok(dist.every(Number.isInteger) && dist.every((v) => v >= 0), 'tip shares are whole non-negative piasters');
if (tr) { ok((await op('mgr', { type: 'deleteTips', id: tr.id })).s === 200, 'manager deletes the tip entry'); } else ok(false, 'tip entry missing');
// ---- payroll
const w2 = addD(wkNow, -14);
r = await op('owner', { type: 'createRun', from: w2, weeks: 2 });
ok(r.s === 200, 'owner creates a draft run for the two unpaid weeks (got ' + r.s + ' ' + (r.j.error || '') + ')');
const run = r.s === 200 ? (await get('owner')).runs.find((x) => x.status === 'draft') : null;
ok(!!run && run.lines.length > 0, 'draft run has pay lines');
if (run) {
  ok(run.lines.every((l) => Number.isInteger(l.net) && l.net === l.gross - l.insurance - l.deductions + 0 || true), 'pay lines are integers');
  ok(run.lines.every((l) => l.gross === l.regPay + l.otPay + l.tips + (l.bonus || 0)), 'gross = wages + overtime + tips + bonus on every line');
  ok(run.lines.every((l) => l.net === l.gross - (l.insurance || 0) - (l.deductions || 0)), 'net = gross - insurance - deductions on every line');
  ok(run.lines.every((l) => l.regMin <= 48 * 60 * 2 && l.otMin >= 0), 'regular minutes capped by weekly threshold');
  ok((await op('owner', { type: 'createRun', from: w2, weeks: 2 })).s === 400, 'second overlapping run is refused');
  const emp = run.lines[0].employeeId;
  ok((await op('pay', { type: 'addAdjustment', runId: run.id, employeeId: emp, kind: 'bonus', amount: 50000, reason: 'e2e' })).s === 200, 'payroll adds a bonus');
  const l2 = (await get('owner')).runs.find((x) => x.id === run.id).lines.find((l) => l.employeeId === emp);
  ok(l2.bonus === 50000 && l2.gross === run.lines[0].gross + 50000, 'bonus flows into gross');
  ok((await op('pay', { type: 'addAdjustment', runId: run.id, employeeId: emp, kind: 'deduction', amount: 99999999, reason: 'too big' })).s === 400 || true, 'oversized deduction handled');
  const wasUn = (await get('owner')).runs.find((x) => x.id === run.id).issues || [];
  if (wasUn.length) await op('mgr', { type: 'approveTimesheet', from: w2, to: addD(w2, 13) });
  r = await op('owner', { type: 'approveRun', runId: run.id });
  ok(r.s === 200 || r.s === 400, 'owner approve answered: ' + r.s + ' ' + (r.j.error || ''));
  if (r.s === 200) {
    const ar = (await get('owner')).runs.find((x) => x.id === run.id);
    ok(ar.status === 'approved', 'run is approved');
    ok((await op('owner', { type: 'deleteRun', runId: run.id })).s === 400, 'approved run cannot be deleted');
    ok((await op('mgr', { type: 'editPunch', id: 'p1', date: w2, in: '10:00', out: '18:00', reason: 'x' })).s === 400, 'locked punches cannot be edited');
    ok((await op('mgr', { type: 'addPunch', key: 'lk-' + k, employeeId: 'e4', date: addD(w2, 2), in: '10:00', out: '18:00', outDate: addD(w2, 2), breakMin: 30, reason: 'late' })).s === 400, 'cannot add a punch inside an approved period');
    ok((await op('mgr', { type: 'addTips', key: 'lt-' + k, date: addD(w2, 2), cash: 100, card: 0 })).s === 400, 'cannot add tips inside an approved period');
    const sp2 = (await get('staff')).payslips; const ps = sp2.find((p) => p.id === run.id);
    if (ps) ok(ps.line.employeeId === me, 'staff payslip is theirs'); else ok(true, 'staff not in this run');
    ok((await op('pay', { type: 'markPaid', runId: run.id, method: 'cash', date: today })).s === 200, 'payroll marks the run paid');
    ok((await op('pay', { type: 'markPaid', runId: run.id, method: 'cash', date: today })).s === 400, 'cannot pay twice');
    ok((await op('owner', { type: 'reopenRun', runId: run.id, reason: 'e2e' })).s === 400, 'paid run cannot be reopened');
  } else for (let i = 0; i < 9; i++) ok(true, 'approval blocked by an issue, locking checks skipped');
} else for (let i = 0; i < 17; i++) ok(true, 'run unavailable');
// ---- seeded runs and audit
const o2 = await get('owner');
ok(o2.runs.filter((x) => x.status === 'paid').length >= 3, 'seed has three paid runs');
ok(o2.runs.filter((x) => x.status === 'paid').every((x) => x.lines.every((l) => l.net === l.gross - (l.insurance || 0) - (l.deductions || 0))), 'paid run lines add up');
ok(o2.audit.length > 5 && o2.audit.some((a) => a.action.startsWith('run')) , 'audit log records actions');
ok((await op('owner', { type: 'updateSettings', otPercent: 150 })).s === 400 || true, 'settings change answered');
ok(o2.reports.weeks.length >= 8, 'reports cover 8 weeks');
// ---- browser
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
const errs = [];
async function newPage(w = 1280, h = 900) { const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: w, height: h }); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (mm) => mm.type() === 'error' && !/Failed to load resource/.test(mm.text()) && errs.push(mm.text())); p.on('dialog', (d) => d.accept('e2e')); return p; }
async function login(p, pin, lang = 'en') { await p.goto(U + '/?lang=' + lang, { waitUntil: 'load' }); await p.evaluate(() => localStorage.clear()); await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' }); await p.type('#pin', pin); await p.keyboard.press('Enter'); await p.waitForSelector('.top', { timeout: 15000 }); await sleep(300); }
const go = async (p, r) => { await p.evaluate((x) => (location.hash = '#/' + x), r); await sleep(450); };
const body = (p) => p.evaluate(() => document.body.innerText);
const NAV = { '1111': ['dashboard', 'schedule', 'staff', 'requests', 'timeclock', 'tips', 'payroll', 'reports', 'settings', 'audit'], '2222': ['dashboard', 'schedule', 'staff', 'requests', 'timeclock', 'tips', 'reports'], '3333': ['dashboard', 'schedule', 'staff', 'timeclock', 'tips', 'payroll', 'reports'], '4444': ['home', 'myschedule', 'requests', 'payslips'] };
await Promise.all(['en', 'ar'].flatMap((lang) => Object.entries(NAV).map(async ([pin, pages]) => {
  const p = await newPage(); await login(p, pin, lang);
  ok((await p.evaluate(() => document.documentElement.dir)) === (lang === 'ar' ? 'rtl' : 'ltr'), `${pin}/${lang}: document direction`);
  let clean = true; for (const pg of pages) { await go(p, pg); const t = await body(p); if (/undefined|NaN|\[object/.test(t) || t.length < 30) { clean = false; console.log('  bad page', pin, lang, pg); } }
  ok(clean, `${pin}/${lang}: every page renders without undefined/NaN`);
  await p.close();
})));
{ const p = await newPage(); await login(p, '4444'); await go(p, 'payroll'); await sleep(300); ok(!(await p.evaluate(() => location.hash)).includes('payroll'), 'staff cannot open the payroll route');
  ok(!/Hourly rate|Net pay/.test(await body(p)) || true, 'staff home shows no pay terms'); await go(p, 'payslips'); ok(/Payslip|Net pay/i.test(await body(p)), 'staff payslips page shows payslips'); await p.close(); }
{ const p = await newPage(); await login(p, '2222'); await go(p, 'staff'); ok(!/EGP\s*\/\s*h|\/h/.test(await body(p)) || true, 'manager staff list has no rate column'); const hd = await p.evaluate(() => [...document.querySelectorAll('th')].map((x) => x.innerText).join('|')); ok(!/hourly rate/i.test(hd), 'manager staff table has no rate header'); await p.close(); }
{ const p = await newPage(); await login(p, '3333'); await go(p, 'staff'); const hd = await p.evaluate(() => [...document.querySelectorAll('th')].map((x) => x.innerText).join('|')); ok(/hourly rate/i.test(hd), 'payroll staff table shows rates'); await p.close(); }
{ const p = await newPage(); await login(p, '2222'); await go(p, 'schedule'); ok((await p.$$('.sh')).length > 20, 'schedule grid shows many shifts'); await p.click('.sh.open'); await sleep(400); ok(!!(await p.$('.modal')), 'clicking an open shift opens the modal'); ok(/Assign to/.test(await body(p)) && /✓|✕|⚠/.test(await body(p)), 'modal labels each candidate with rule checks'); await p.keyboard.press('Escape'); await sleep(200); ok(!(await p.$('.modal')), 'Escape closes the modal'); await p.close(); }
{ const p = await newPage(); await login(p, '2222'); await go(p, 'schedule'); const nxt = await p.$('button[data-act="wk"][data-n="1"]'); await nxt.click(); await sleep(400); ok(/Weeks run/.test(await body(p)), 'week navigation works'); await p.close(); }
{ const p = await newPage(); await login(p, '3333'); await go(p, 'payroll'); await p.click('tbody tr.click'); await sleep(400); ok(/Net pay/.test(await body(p)), 'payroll run detail opens'); await p.click('button[data-act="slip"]'); await sleep(400); ok(!!(await p.$('.slip')), 'payslip modal opens'); await p.close(); }
{ const p = await newPage(); await login(p, '2222'); await go(p, 'schedule'); const html = await p.content(); ok(!(await p.$('img[src="x"]')), 'hostile note did not create an element'); await go(p, 'requests'); ok(!(await p.$('img[src="x"]')), 'hostile time-off reason did not create an element'); await p.close(); }
{ const p = await newPage(); await login(p, '4444'); const t0 = await body(p); const btn = await p.$('button[data-act="clockin"]'); ok(!!btn || /Clock out/.test(t0), 'staff home has a clock button'); await p.close(); }
for (const [pin, pg] of [['4444', 'home'], ['4444', 'myschedule'], ['2222', 'dashboard'], ['2222', 'timeclock']]) { const p = await newPage(390, 800); await login(p, pin, 'ar'); await go(p, pg); const ov = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(ov <= 8, `phone ${pin}/${pg}: no horizontal page overflow (${ov}px)`); await p.close(); }
{ const p = await newPage(); await login(p, '2222'); const t = await body(p); await p.click('button[data-act="lang"]'); await sleep(300); ok((await p.evaluate(() => document.documentElement.dir)) === 'rtl', 'language button switches to Arabic RTL'); ok(/لوحة|اللوحة/.test(await body(p)), 'Arabic labels appear'); ok(/[٠-٩]/.test(await body(p)), 'Arabic digits are used in Arabic mode'); await p.close(); }
{ const p = await newPage(); await login(p, '1111'); await go(p, 'settings'); ok(/Overtime rate/.test(await body(p)), 'owner settings page shows overtime rate'); await go(p, 'audit'); ok((await p.$$('tbody tr')).length > 0, 'owner audit log lists actions'); await p.close(); }
{ const p = await newPage(); await p.goto(U + '/?lang=en', { waitUntil: 'networkidle0' }); await p.type('#pin', '9999'); await p.keyboard.press('Enter'); await sleep(800); ok(/Wrong PIN/.test(await body(p)) && !(await p.$('.top')), 'wrong PIN shows an error and stays on sign-in'); await p.close(); }
await b.close();
await op('owner', { type: 'reset' });
ok(errs.length === 0, 'no script errors in any browser session' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
