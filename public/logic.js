// Wardia business rules. Pure functions shared by the browser and the API. Money is integer piasters (100 = 1 EGP). Time is minutes. Cairo calendar days are 'YYYY-MM-DD'.
export const TZ = 'Africa/Cairo';
export const ROLES = { owner: 'owner', manager: 'manager', payroll: 'payroll', staff: 'staff' };
export const DEMO_USERS = [
  { pin: '1111', label: 'Owner (Mr. Hany)', labelAr: 'المالك (أ. هاني)' },
  { pin: '2222', label: 'Restaurant manager (Dina)', labelAr: 'مديرة المطعم (دينا)' },
  { pin: '3333', label: 'Payroll accountant (Samir)', labelAr: 'محاسب المرتبات (سمير)' },
  { pin: '4444', label: 'Staff portal (Youssef, waiter)', labelAr: 'بوابة الموظف (يوسف، ويتر)' },
];
export const POSITIONS = [
  { id: 'lead', name: 'Shift lead', nameAr: 'مسؤول وردية', tip: 50 },
  { id: 'waiter', name: 'Waiter', nameAr: 'ويتر', tip: 100 },
  { id: 'cook', name: 'Cook', nameAr: 'طباخ', tip: 40 },
  { id: 'cashier', name: 'Cashier', nameAr: 'كاشير', tip: 50 },
  { id: 'host', name: 'Host', nameAr: 'استقبال', tip: 60 },
  { id: 'barista', name: 'Barista', nameAr: 'باريستا', tip: 70 },
  { id: 'dish', name: 'Dishwasher', nameAr: 'غسيل أطباق', tip: 30 },
];
export const POS_IDS = POSITIONS.map((p) => p.id);
export const DEFAULTS = { otAfterHours: 48, otPercent: 135, maxDailyHours: 12, maxWeekPlanHours: 60, minRestHours: 9, insurancePercent: 11, cardFeePercent: 3, earlyClockMin: 15, roundMin: 5, autoBreakAfterHours: 6, autoBreakMin: 30, backdateDays: 60, healthDays: 30, lateGraceMin: 5 };

export class UserError extends Error {}
export class PermError extends Error {}

// ---------- dates and times ----------
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const tzParts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
export const dayKey = (ts) => fmt.format(ts);
const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (k, n) => toKey(parse(k) + n * 864e5);
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const monthOf = (k) => k.slice(0, 7);
export const isKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && toKey(parse(k)) === k;
const dayNo = (k) => Math.round(parse(k) / 864e5);
// Weeks run Saturday to Friday, as in most Egyptian restaurants.
export const weekStart = (k) => addDays(k, -((new Date(parse(k)).getUTCDay() + 1) % 7));
export const isWeekStart = (k) => isKey(k) && weekStart(k) === k;
export const dow = (k) => new Date(parse(k)).getUTCDay(); // 0 = Sunday
export const toMin = (t) => { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(t)); if (!m) throw new UserError('Time must look like 14:30'); return Number(m[1]) * 60 + Number(m[2]); };
export const hmOf = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function localParts(ts) { const p = Object.fromEntries(tzParts.formatToParts(ts).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) }; }
export function localTs(date, mins) {
  let g = parse(date) + mins * 60000;
  for (let i = 0; i < 3; i++) { const lp = localParts(g); g -= (dayNo(lp.date) * 1440 + lp.min - (dayNo(date) * 1440 + mins)) * 60000; }
  return g;
}
export const absStart = (date, start) => dayNo(date) * 1440 + toMin(start);
export const absEnd = (date, start, end) => { const a = absStart(date, start); let e = dayNo(date) * 1440 + toMin(end); if (e <= a) e += 1440; return e; };
export const shiftMin = (sh) => absEnd(sh.date, sh.start, sh.end) - absStart(sh.date, sh.start);
export const shiftPaidMin = (sh) => shiftMin(sh) - (sh.breakMin || 0);
export const shiftStartTs = (sh) => localTs(sh.date, toMin(sh.start));
export const shiftEndTs = (sh) => shiftStartTs(sh) + shiftMin(sh) * 60000;
export const tsAt = (date, hm) => localTs(date, toMin(hm));
export const roundTo = (n, step) => (step > 1 ? Math.round(n / step) * step : Math.round(n));

// ---------- validation ----------
const str = (v, min, max, label) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw new UserError(`${label} must be ${min === max ? min : `${min} to ${max}`} characters`);
  return s;
};
const optStr = (v, max, label) => (v === undefined || v === null || v === '' ? '' : str(v, 0, max, label));
const intIn = (v, min, max, label) => { if (!Number.isInteger(v) || v < min || v > max) throw new UserError(`${label} must be a whole number from ${min} to ${max}`); return v; };
const oneOf = (v, list, msg) => { if (!list.includes(v)) throw new UserError(msg); return v; };
const dateIn = (v, label = 'Date') => { if (!isKey(v)) throw new UserError(`${label} must be a valid date`); return v; };
const need = (user, roles) => { if (!roles.includes(user.role)) throw new PermError('You do not have permission to do this'); };
const MGR = ['owner', 'manager'];
const settings = (s) => ({ ...DEFAULTS, ...(s.settings || {}) });
const nextId = (s, p) => `${p}${++s.counters[p]}`;
const audit = (s, user, now, action, detail) => { s.audit.unshift({ ts: now, userId: user.id, name: user.name, action, detail: String(detail).slice(0, 200) }); if (s.audit.length > 300) s.audit.length = 300; };
const once = (s, op, fn) => {
  if (op.key !== undefined && (typeof op.key !== 'string' || op.key.length < 4 || op.key.length > 40)) throw new UserError('Bad request');
  if (op.key && s.keys.includes(op.key)) return { duplicate: true };
  const r = fn(); if (op.key) { s.keys.push(op.key); if (s.keys.length > 300) s.keys.shift(); } return r;
};
const getE = (s, id) => { const e = s.employees.find((x) => x.id === id); if (!e) throw new UserError('Employee not found'); return e; };
const getSh = (s, id) => { const x = s.shifts.find((y) => y.id === id); if (!x) throw new UserError('Shift not found'); return x; };
const getRun = (s, id) => { const x = s.runs.find((y) => y.id === id); if (!x) throw new UserError('Payroll run not found'); return x; };
const posName = (id) => POSITIONS.find((p) => p.id === id)?.name || id;
const egp = (c) => (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
const hrs = (m) => (m / 60).toFixed(m % 60 ? 1 : 0);
// A staff member can act for themselves only. A manager or owner can act for anyone.
const selfOr = (user, empId) => { if (user.role === 'staff') { if (!user.employeeId || user.employeeId !== empId) throw new PermError('You do not have permission to do this'); } else need(user, MGR); };
const lockedDate = (s, date) => s.runs.some((r) => r.status !== 'draft' && date >= r.from && date <= r.to);

// ---------- scheduling rules ----------
export const plannedMin = (shifts, empId, wk, ignore) => shifts.filter((x) => x.employeeId === empId && weekStart(x.date) === wk && x.id !== ignore).reduce((a, x) => a + shiftPaidMin(x), 0);
export const onTimeOff = (timeOff, empId, date) => (timeOff || []).some((t) => t.employeeId === empId && t.status === 'approved' && date >= t.from && date <= t.to);
export function availOk(emp, sh) {
  const a = emp.avail?.[dow(sh.date)] || { mode: 'any' };
  if (a.mode === 'off') return false;
  if (a.mode === 'window') {
    const ws = absStart(sh.date, a.from), we = absEnd(sh.date, a.from, a.to);
    return absStart(sh.date, sh.start) >= ws && absEnd(sh.date, sh.start, sh.end) <= we;
  }
  return true;
}
// Checks whether this employee can work this shift. Returns { errors, warnings }. Works on the server state or on a view.
export function checkAssign(data, sh, emp, ignoreId) {
  const st = { ...DEFAULTS, ...(data.settings || {}) }; const errors = [], warnings = [];
  if (!emp.active) errors.push('inactive');
  if (!emp.positionIds.includes(sh.positionId)) errors.push('position');
  if (onTimeOff(data.timeOff, emp.id, sh.date)) errors.push('timeoff');
  if (!availOk(emp, sh)) errors.push('availability');
  const a = absStart(sh.date, sh.start), e = absEnd(sh.date, sh.start, sh.end);
  const mine = data.shifts.filter((x) => x.employeeId === emp.id && x.id !== sh.id && x.id !== ignoreId && Math.abs(dayNo(x.date) - dayNo(sh.date)) <= 2);
  let dayMin = shiftMin(sh);
  for (const x of mine) {
    const xa = absStart(x.date, x.start), xe = absEnd(x.date, x.start, x.end);
    if (xa < e && a < xe) { errors.push('overlap'); continue; }
    const gap = xe <= a ? a - xe : xa - e;
    if (gap < st.minRestHours * 60) errors.push('rest');
    if (x.date === sh.date) dayMin += shiftMin(x);
  }
  if (dayMin > st.maxDailyHours * 60) errors.push('daily');
  const wk = weekStart(sh.date);
  const plannedAdj = plannedMin(data.shifts.filter((x) => x.id !== ignoreId), emp.id, wk, sh.id) + shiftPaidMin(sh);
  if (plannedAdj > st.maxWeekPlanHours * 60) errors.push('week');
  else if (plannedAdj > st.otAfterHours * 60) warnings.push('overtime');
  return { errors: [...new Set(errors)], warnings };
}
const ASSIGN_MSG = {
  inactive: 'This person is no longer active', position: 'This person does not work this position', timeoff: 'This person is on approved time off',
  availability: 'Outside this person\'s availability', overlap: 'Overlaps another shift of this person', rest: (st) => `Less than ${st.minRestHours} hours of rest between shifts`,
  daily: (st) => `More than ${st.maxDailyHours} hours in one day`, week: (st) => `More than ${st.maxWeekPlanHours} planned hours this week`,
};
const failAssign = (s, sh, emp, ignoreId) => {
  const st = settings(s); const r = checkAssign(s, sh, emp, ignoreId);
  if (r.errors.length) { const m = ASSIGN_MSG[r.errors[0]]; throw new UserError(`${emp.name}: ${typeof m === 'function' ? m(st) : m}`); }
  return r.warnings;
};
const shiftErrors = (sh, today) => {
  if (sh.date < today) throw new UserError('Past shifts cannot be changed');
};
const futureShift = (sh, now) => shiftStartTs(sh) > now;
const parseShift = (op, now) => {
  const date = dateIn(op.date), start = op.start, end = op.end; toMin(start); toMin(end);
  const sh = { date, start, end, positionId: oneOf(op.positionId, POS_IDS, 'Pick a position'), breakMin: op.breakMin === undefined ? 30 : intIn(op.breakMin, 0, 120, 'Break'), note: optStr(op.note, 80, 'Note') };
  const m = shiftMin(sh); if (m < 120 || m > 16 * 60) throw new UserError('A shift must be between 2 and 16 hours');
  if (sh.breakMin >= m) throw new UserError('Break is longer than the shift');
  if (diffDays(dayKey(now), date) > 60) throw new UserError('Shifts can be planned up to 60 days ahead');
  return sh;
};

// ---------- time clock ----------
export function punchPaid(p, sh, st) {
  if (!p.out) return null;
  let raw = (p.out - p.in) / 60000;
  if (sh && p.source === 'clock') { const ss = shiftStartTs(sh); if (p.in < ss) raw -= (ss - p.in) / 60000; }
  let brk = p.breakMin || 0;
  p.autoBreak = false;
  if (!brk && p.source === 'clock' && raw >= st.autoBreakAfterHours * 60) { brk = st.autoBreakMin; p.autoBreak = true; }
  return Math.max(0, roundTo(raw - brk, st.roundMin));
}
const finalize = (s, p) => { const sh = p.shiftId ? s.shifts.find((x) => x.id === p.shiftId) : null; p.paidMin = punchPaid(p, sh, settings(s)); };
const punchDate = (p) => dayKey(p.in);
const openPunch = (s, empId) => s.punches.find((p) => p.employeeId === empId && !p.out && !p.void);
const livePunches = (s) => s.punches.filter((p) => !p.void);
function findShiftFor(s, empId, now) {
  const st = settings(s); const today = dayKey(now); let best = null;
  for (const sh of s.shifts) {
    if (sh.employeeId !== empId || !sh.published || (sh.date !== today && sh.date !== addDays(today, -1))) continue;
    const a = shiftStartTs(sh), e = shiftEndTs(sh);
    if (now < a - st.earlyClockMin * 60000 || now > e) continue;
    if (s.punches.some((p) => !p.void && p.shiftId === sh.id)) continue;
    if (!best || Math.abs(now - a) < Math.abs(now - shiftStartTs(best))) best = sh;
  }
  return best;
}
function overlapsPunch(s, empId, a, b, ignoreId) {
  return livePunches(s).some((p) => p.employeeId === empId && p.id !== ignoreId && p.in < b && a < (p.out ?? Infinity));
}
function checkPunchTimes(s, empId, inTs, outTs, now, ignoreId) {
  const st = settings(s);
  if (!Number.isFinite(inTs) || !Number.isFinite(outTs)) throw new UserError('Enter a valid time');
  if (outTs <= inTs) throw new UserError('Clock out must be after clock in');
  if (outTs - inTs > 16 * 3600e3) throw new UserError('A single punch cannot be longer than 16 hours');
  if (outTs > now + 5 * 60000) throw new UserError('Times cannot be in the future');
  if (diffDays(dayKey(inTs), dayKey(now)) > st.backdateDays) throw new UserError(`Punches can be added up to ${st.backdateDays} days back`);
  if (lockedDate(s, dayKey(inTs))) throw new UserError('This date is in an approved payroll run');
  if (overlapsPunch(s, empId, inTs, outTs, ignoreId)) throw new UserError('Overlaps another punch of this person');
}
const punchTime = (op, dKey, tKey, label) => {
  const d = dateIn(op[dKey], label + ' date'), t = op[tKey]; toMin(t); return tsAt(d, t);
};

// ---------- pay ----------
export function tipNet(t, st) { return t.cash + t.card - Math.round((t.card * st.cardFeePercent) / 100); }
function splitByWeight(total, entries) {
  const W = entries.reduce((a, e) => a + e.w, 0); if (!W) return null;
  const out = entries.map((e) => { const raw = (total * e.w) / W; return { id: e.id, v: Math.floor(raw), r: raw - Math.floor(raw) }; });
  let left = total - out.reduce((a, e) => a + e.v, 0);
  [...out].sort((a, b) => b.r - a.r || a.id.localeCompare(b.id)).forEach((e) => { if (left > 0) { e.v++; left--; } });
  return Object.fromEntries(out.map((e) => [e.id, e.v]));
}
export function allocateTips(s, from, to) {
  const st = settings(s); const byEmp = {}; const unallocated = []; const days = {};
  for (const t of s.tips) if (t.date >= from && t.date <= to) (days[t.date] ||= []).push(t);
  for (const [date, list] of Object.entries(days)) {
    const total = list.reduce((a, t) => a + tipNet(t, st), 0);
    const mins = {};
    for (const p of livePunches(s)) if (p.out && punchDate(p) === date) mins[p.employeeId] = (mins[p.employeeId] || 0) + (p.paidMin || 0);
    const entries = Object.entries(mins).map(([id, m]) => { const e = s.employees.find((x) => x.id === id); const pos = POSITIONS.find((x) => x.id === e?.positionIds[0]); return { id, w: m * (pos ? pos.tip : 0) }; });
    const sp = splitByWeight(total, entries);
    if (!sp) unallocated.push({ date, amount: total }); else for (const [id, v] of Object.entries(sp)) byEmp[id] = (byEmp[id] || 0) + v;
  }
  return { byEmp, unallocated };
}
export function periodLines(s, from, to, adjustments = []) {
  const st = settings(s); const wk = {};
  for (const p of livePunches(s)) { if (!p.out) continue; const d = punchDate(p); if (d < from || d > to) continue; const w = ((wk[p.employeeId] ||= {})[weekStart(d)] = ((wk[p.employeeId] || {})[weekStart(d)] || 0) + (p.paidMin || 0)); void w; }
  const tips = allocateTips(s, from, to);
  const ids = new Set([...Object.keys(wk), ...Object.keys(tips.byEmp), ...adjustments.map((a) => a.employeeId)]);
  const lines = [];
  for (const e of s.employees) {
    if (!ids.has(e.id)) continue;
    let reg = 0, ot = 0;
    for (const m of Object.values(wk[e.id] || {})) { const o = Math.max(0, m - st.otAfterHours * 60); ot += o; reg += m - o; }
    const regPay = Math.round((reg * e.rate) / 60), otPay = Math.round((ot * e.rate * st.otPercent) / 100 / 60);
    const adj = adjustments.filter((a) => a.employeeId === e.id);
    const bonus = adj.filter((a) => a.kind === 'bonus').reduce((a, x) => a + x.amount, 0), ded = adj.filter((a) => a.kind === 'deduction').reduce((a, x) => a + x.amount, 0);
    const tip = tips.byEmp[e.id] || 0, wages = regPay + otPay + bonus;
    const insurance = e.insured ? Math.round((wages * st.insurancePercent) / 100) : 0;
    lines.push({ employeeId: e.id, name: e.name, nameAr: e.nameAr, positionId: e.positionIds[0], rate: e.rate, regMin: reg, otMin: ot, regPay, otPay, tips: tip, bonus, deductions: ded, insured: !!e.insured, insurance, gross: wages + tip, net: wages + tip - insurance - ded });
  }
  return { lines, unallocated: tips.unallocated };
}
export function runIssues(s, run) {
  const out = [];
  const inRange = (d) => d >= run.from && d <= run.to;
  const open = livePunches(s).filter((p) => !p.out && inRange(punchDate(p))).length;
  const unapproved = livePunches(s).filter((p) => p.out && !p.approved && inRange(punchDate(p))).length;
  if (open) out.push({ type: 'open', n: open });
  if (unapproved) out.push({ type: 'unapproved', n: unapproved });
  const { lines, unallocated } = periodLines(s, run.from, run.to, run.adjustments);
  for (const u of unallocated) out.push({ type: 'tips', date: u.date });
  for (const l of lines) if (l.net < 0) out.push({ type: 'negative', employeeId: l.employeeId });
  return out;
}
export const runView = (s, run) => {
  if (run.lines) return { ...run, issues: [], unallocated: [] };
  const { lines, unallocated } = periodLines(s, run.from, run.to, run.adjustments);
  return { ...run, lines, unallocated, issues: runIssues(s, run) };
};
export const totals = (lines) => lines.reduce((a, l) => ({ regMin: a.regMin + l.regMin, otMin: a.otMin + l.otMin, regPay: a.regPay + l.regPay, otPay: a.otPay + l.otPay, tips: a.tips + l.tips, bonus: a.bonus + l.bonus, deductions: a.deductions + l.deductions, insurance: a.insurance + l.insurance, gross: a.gross + l.gross, net: a.net + l.net }), { regMin: 0, otMin: 0, regPay: 0, otPay: 0, tips: 0, bonus: 0, deductions: 0, insurance: 0, gross: 0, net: 0 });

// ---------- housekeeping ----------
export function normalize(s, now) {
  for (const w of s.swaps) {
    if (w.status !== 'peer' && w.status !== 'manager') continue;
    const sh = s.shifts.find((x) => x.id === w.shiftId); const sh2 = w.withShiftId ? s.shifts.find((x) => x.id === w.withShiftId) : null;
    if (!sh || shiftStartTs(sh) <= now || (w.withShiftId && (!sh2 || shiftStartTs(sh2) <= now))) { w.status = 'expired'; w.decidedAt = now; }
  }
  if (s.timeOff.length > 400) s.timeOff = s.timeOff.filter((t) => t.to >= addDays(dayKey(now), -120));
}
const openSwapFor = (s, shiftId) => s.swaps.find((w) => (w.status === 'peer' || w.status === 'manager') && (w.shiftId === shiftId || w.withShiftId === shiftId));
const swapShifts = (s, w) => ({ sh: getSh(s, w.shiftId), sh2: w.withShiftId ? getSh(s, w.withShiftId) : null });
const applySwap = (s, w, now) => {
  const { sh, sh2 } = swapShifts(s, w);
  if (shiftStartTs(sh) <= now || (sh2 && shiftStartTs(sh2) <= now)) throw new UserError('That shift has already started');
  const to = getE(s, w.toEmpId);
  if (w.type === 'swap') {
    const from = getE(s, w.empId);
    if (sh.employeeId !== from.id || sh2.employeeId !== to.id) throw new UserError('The shifts changed since the request');
    const w1 = failAssign(s, sh, to, sh2.id), w2 = failAssign(s, sh2, from, sh.id);
    sh.employeeId = to.id; sh2.employeeId = from.id; return [...w1, ...w2];
  }
  if (w.type === 'give' && sh.employeeId !== w.empId) throw new UserError('The shift changed since the request');
  if (w.type === 'claim' && sh.employeeId) throw new UserError('That shift is no longer open');
  const warn = failAssign(s, sh, to); sh.employeeId = to.id; return warn;
};

// ---------- operations ----------
const OPS = {
  // staff directory
  addEmployee(s, op, { user, now }) {
    need(user, MGR);
    const name = str(op.name, 2, 60, 'Name'), nameAr = str(op.nameAr || op.name, 2, 60, 'Arabic name');
    const ids = Array.isArray(op.positionIds) ? [...new Set(op.positionIds)] : [];
    if (!ids.length || ids.length > 3 || ids.some((p) => !POS_IDS.includes(p))) throw new UserError('Pick 1 to 3 positions');
    const phone = op.phone ? str(String(op.phone).replace(/[\s-]/g, ''), 8, 16, 'Phone') : '';
    if (phone && !/^\+?\d{8,15}$/.test(phone)) throw new UserError('Phone must be digits only');
    const hired = op.hired ? dateIn(op.hired, 'Hire date') : dayKey(now);
    if (s.employees.some((e) => e.name.toLowerCase() === name.toLowerCase() && e.active)) throw new UserError('An active employee with this name already exists');
    const e = { id: nextId(s, 'e'), name, nameAr, positionIds: ids, rate: DEFAULT_RATE[ids[0]], phone, hired, active: true, insured: false, healthCard: op.healthCard ? dateIn(op.healthCard, 'Health card expiry') : null, avail: {} };
    s.employees.push(e); audit(s, user, now, 'employee.add', name); return { id: e.id };
  },
  updateEmployee(s, op, { user, now }) {
    need(user, MGR); const e = getE(s, op.employeeId);
    if (op.name !== undefined) e.name = str(op.name, 2, 60, 'Name');
    if (op.nameAr !== undefined) e.nameAr = str(op.nameAr, 2, 60, 'Arabic name');
    if (op.positionIds !== undefined) { const ids = [...new Set(op.positionIds)]; if (!ids.length || ids.length > 3 || ids.some((p) => !POS_IDS.includes(p))) throw new UserError('Pick 1 to 3 positions'); e.positionIds = ids; }
    if (op.phone !== undefined) { const p = String(op.phone).replace(/[\s-]/g, ''); if (p && !/^\+?\d{8,15}$/.test(p)) throw new UserError('Phone must be digits only'); e.phone = p; }
    if (op.healthCard !== undefined) e.healthCard = op.healthCard ? dateIn(op.healthCard, 'Health card expiry') : null;
    audit(s, user, now, 'employee.update', e.name); return {};
  },
  setPay(s, op, { user, now }) {
    need(user, ['owner', 'payroll']); const e = getE(s, op.employeeId);
    const rate = intIn(op.rate, 1500, 50000, 'Hourly rate (piasters)');
    if (typeof op.insured !== 'boolean') throw new UserError('Bad request');
    if (s.runs.some((r) => r.status === 'draft')) throw new UserError('Finish or delete the draft payroll run first');
    e.rate = rate; e.insured = op.insured; audit(s, user, now, 'employee.pay', `${e.name}: ${egp(rate)} EGP/h`); return {};
  },
  setActive(s, op, { user, now }) {
    need(user, MGR); const e = getE(s, op.employeeId); const reason = str(op.reason, 3, 120, 'Reason');
    if (typeof op.active !== 'boolean') throw new UserError('Bad request');
    if (!op.active) {
      if (openPunch(s, e.id)) throw new UserError('Clock this person out first');
      let n = 0; for (const sh of s.shifts) if (sh.employeeId === e.id && sh.date >= dayKey(now)) { sh.employeeId = null; n++; }
      for (const w of s.swaps) if ((w.status === 'peer' || w.status === 'manager') && (w.empId === e.id || w.toEmpId === e.id)) w.status = 'cancelled';
      e.active = false; audit(s, user, now, 'employee.off', `${e.name}: ${reason}`); return { opened: n };
    }
    e.active = true; audit(s, user, now, 'employee.on', `${e.name}: ${reason}`); return {};
  },
  // availability and time off
  setAvailability(s, op, { user, now }) {
    selfOr(user, op.employeeId); const e = getE(s, op.employeeId); const out = {};
    if (!op.days || typeof op.days !== 'object') throw new UserError('Bad request');
    for (let d = 0; d < 7; d++) {
      const a = op.days[d] || { mode: 'any' }; oneOf(a.mode, ['any', 'off', 'window'], 'Bad availability');
      if (a.mode === 'window') { toMin(a.from); toMin(a.to); if (a.from === a.to) throw new UserError('Availability window must have a start and end'); out[d] = { mode: 'window', from: a.from, to: a.to }; } else if (a.mode === 'off') out[d] = { mode: 'off' };
    }
    if (Object.values(out).filter((a) => a.mode === 'off').length > 5) throw new UserError('At least two days must be available');
    e.avail = out; audit(s, user, now, 'availability', e.name); return {};
  },
  requestTimeOff(s, op, { user, now }) {
    selfOr(user, op.employeeId); const e = getE(s, op.employeeId); const from = dateIn(op.from, 'From'), to = dateIn(op.to, 'To'); const today = dayKey(now);
    if (to < from) throw new UserError('End date is before the start date');
    if (from < today) throw new UserError('Time off must start today or later');
    if (diffDays(from, to) > 30) throw new UserError('Time off is limited to 31 days per request');
    if (diffDays(today, from) > 365) throw new UserError('Too far ahead');
    if (s.timeOff.some((t) => t.employeeId === e.id && (t.status === 'pending' || t.status === 'approved') && t.from <= to && from <= t.to)) throw new UserError('Overlaps another time off request');
    const reason = str(op.reason, 3, 120, 'Reason');
    return once(s, op, () => { const t = { id: nextId(s, 't'), employeeId: e.id, from, to, reason, status: 'pending', createdAt: now }; s.timeOff.push(t); audit(s, user, now, 'timeoff.request', `${e.name} ${from} to ${to}`); return { id: t.id }; });
  },
  decideTimeOff(s, op, { user, now }) {
    need(user, MGR); const t = s.timeOff.find((x) => x.id === op.id); if (!t) throw new UserError('Request not found');
    if (t.status !== 'pending') throw new UserError('This request was already decided');
    if (typeof op.approve !== 'boolean') throw new UserError('Bad request');
    const note = optStr(op.note, 120, 'Note'); if (!op.approve && !note) throw new UserError('Add a reason for declining');
    let opened = 0;
    if (op.approve) for (const sh of s.shifts) if (sh.employeeId === t.employeeId && sh.date >= t.from && sh.date <= t.to && sh.date >= dayKey(now)) { sh.employeeId = null; opened++; }
    t.status = op.approve ? 'approved' : 'declined'; t.note = note; t.decidedBy = user.name; t.decidedAt = now;
    audit(s, user, now, 'timeoff.' + t.status, `${getE(s, t.employeeId).name} ${t.from} to ${t.to}`); return { opened };
  },
  cancelTimeOff(s, op, { user, now }) {
    const t = s.timeOff.find((x) => x.id === op.id); if (!t) throw new UserError('Request not found'); selfOr(user, t.employeeId);
    if (t.status !== 'pending' && t.status !== 'approved') throw new UserError('This request cannot be cancelled');
    if (t.status === 'approved' && t.from < dayKey(now)) throw new UserError('This time off already started');
    t.status = 'cancelled'; audit(s, user, now, 'timeoff.cancel', getE(s, t.employeeId).name); return {};
  },
  // shifts
  createShift(s, op, { user, now }) {
    need(user, MGR); const base = parseShift(op, now); shiftErrors(base, dayKey(now));
    const e = op.employeeId ? getE(s, op.employeeId) : null;
    const warnings = e ? failAssign(s, { ...base, id: 'new' }, e) : [];
    return once(s, op, () => {
      const sh = { id: nextId(s, 'sh'), ...base, employeeId: e ? e.id : null, published: !!s.published[weekStart(base.date)] };
      s.shifts.push(sh); audit(s, user, now, 'shift.create', `${sh.date} ${sh.start}-${sh.end} ${posName(sh.positionId)} ${e ? e.name : '(open)'}`); return { id: sh.id, warnings };
    });
  },
  updateShift(s, op, { user, now }) {
    need(user, MGR); const sh = getSh(s, op.shiftId); shiftErrors(sh, dayKey(now));
    if (openSwapFor(s, sh.id)) throw new UserError('Resolve the swap request on this shift first');
    const n = parseShift({ ...sh, ...op }, now); shiftErrors(n, dayKey(now));
    const next = { ...sh, ...n };
    let warnings = [];
    if (sh.employeeId) warnings = failAssign(s, next, getE(s, sh.employeeId));
    Object.assign(sh, n); audit(s, user, now, 'shift.update', `${sh.date} ${sh.start}-${sh.end}`); return { warnings };
  },
  deleteShift(s, op, { user, now }) {
    need(user, MGR); const sh = getSh(s, op.shiftId); shiftErrors(sh, dayKey(now));
    if (openSwapFor(s, sh.id)) throw new UserError('Resolve the swap request on this shift first');
    if (s.punches.some((p) => !p.void && p.shiftId === sh.id)) throw new UserError('This shift has a time clock record');
    s.shifts = s.shifts.filter((x) => x.id !== sh.id); audit(s, user, now, 'shift.delete', `${sh.date} ${sh.start}-${sh.end}`); return {};
  },
  assignShift(s, op, { user, now }) {
    need(user, MGR); const sh = getSh(s, op.shiftId); shiftErrors(sh, dayKey(now));
    if (openSwapFor(s, sh.id)) throw new UserError('Resolve the swap request on this shift first');
    if (op.employeeId === null) { sh.employeeId = null; audit(s, user, now, 'shift.unassign', `${sh.date} ${sh.start}`); return { warnings: [] }; }
    const e = getE(s, op.employeeId); const warnings = failAssign(s, sh, e, sh.employeeId === e.id ? sh.id : undefined);
    sh.employeeId = e.id; audit(s, user, now, 'shift.assign', `${sh.date} ${sh.start} ${posName(sh.positionId)} ${e.name}`); return { warnings };
  },
  publishWeek(s, op, { user, now }) {
    need(user, MGR); const wk = dateIn(op.week); if (!isWeekStart(wk)) throw new UserError('A week starts on Saturday');
    const list = s.shifts.filter((x) => weekStart(x.date) === wk); if (!list.length) throw new UserError('This week has no shifts');
    let n = 0; for (const sh of list) if (!sh.published) { sh.published = true; n++; }
    s.published[wk] = now; audit(s, user, now, 'week.publish', wk); return { published: n, open: list.filter((x) => !x.employeeId).length };
  },
  unpublishWeek(s, op, { user, now }) {
    need(user, MGR); const wk = dateIn(op.week); if (!isWeekStart(wk)) throw new UserError('A week starts on Saturday');
    if (addDays(wk, 6) < dayKey(now)) throw new UserError('This week is over');
    for (const sh of s.shifts) if (weekStart(sh.date) === wk && !s.punches.some((p) => !p.void && p.shiftId === sh.id)) sh.published = false;
    delete s.published[wk]; audit(s, user, now, 'week.unpublish', wk); return {};
  },
  copyWeek(s, op, { user, now }) {
    need(user, MGR); const from = dateIn(op.from), to = dateIn(op.to); if (!isWeekStart(from) || !isWeekStart(to)) throw new UserError('A week starts on Saturday');
    if (from === to) throw new UserError('Pick a different week to copy into');
    if (addDays(to, 6) < dayKey(now)) throw new UserError('Past weeks cannot be changed');
    if (diffDays(dayKey(now), to) > 56) throw new UserError('Shifts can be planned up to 8 weeks ahead');
    if (s.shifts.some((x) => weekStart(x.date) === to)) throw new UserError('That week already has shifts');
    const src = s.shifts.filter((x) => weekStart(x.date) === from); if (!src.length) throw new UserError('The source week has no shifts');
    let made = 0, skipped = 0; const offset = diffDays(from, to);
    for (const o of src) {
      const sh = { id: nextId(s, 'sh'), date: addDays(o.date, offset), start: o.start, end: o.end, positionId: o.positionId, breakMin: o.breakMin, note: o.note, employeeId: null, published: false };
      if (sh.date < dayKey(now)) { s.counters.sh--; skipped++; continue; }
      const e = o.employeeId ? s.employees.find((x) => x.id === o.employeeId) : null;
      if (e && checkAssign(s, sh, e).errors.length === 0) sh.employeeId = e.id; else if (e) skipped++;
      s.shifts.push(sh); made++;
    }
    audit(s, user, now, 'week.copy', `${from} to ${to}`); return { made, skipped };
  },
  // swaps
  requestSwap(s, op, { user, now }) {
    const sh = getSh(s, op.shiftId); if (!sh.employeeId) throw new UserError('Only an assigned shift can be given away');
    selfOr(user, sh.employeeId); if (!sh.published) throw new UserError('Only published shifts can be swapped');
    if (!futureShift(sh, now)) throw new UserError('That shift has already started');
    const type = oneOf(op.kind, ['give', 'swap'], 'Pick give or swap'); const note = optStr(op.note, 120, 'Note');
    if (openSwapFor(s, sh.id)) throw new UserError('This shift already has a pending request');
    const w = { id: nextId(s, 'w'), type, shiftId: sh.id, empId: sh.employeeId, toEmpId: null, withShiftId: null, status: 'peer', note, createdAt: now };
    if (type === 'swap') {
      const sh2 = getSh(s, op.withShiftId); if (!sh2.employeeId || sh2.employeeId === sh.employeeId) throw new UserError('Pick a shift of a colleague');
      if (!sh2.published || !futureShift(sh2, now)) throw new UserError('That shift cannot be swapped');
      if (openSwapFor(s, sh2.id)) throw new UserError('That shift already has a pending request');
      w.withShiftId = sh2.id; w.toEmpId = sh2.employeeId;
      const to = getE(s, w.toEmpId), from = getE(s, sh.employeeId); failAssign(s, sh, to, sh2.id); failAssign(s, sh2, from, sh.id);
    } else if (op.toEmpId) {
      const to = getE(s, op.toEmpId); if (to.id === sh.employeeId) throw new UserError('Pick a colleague');
      failAssign(s, sh, to); w.toEmpId = to.id;
    }
    return once(s, op, () => { s.swaps.push(w); audit(s, user, now, 'swap.request', `${type} ${sh.date} ${sh.start}`); return { id: w.id }; });
  },
  respondSwap(s, op, { user, now }) {
    const w = s.swaps.find((x) => x.id === op.id); if (!w) throw new UserError('Request not found');
    if (w.status !== 'peer') throw new UserError('This request is no longer waiting for a colleague');
    if (typeof op.accept !== 'boolean') throw new UserError('Bad request');
    if (user.role !== 'staff' || !user.employeeId) throw new PermError('You do not have permission to do this');
    const me = getE(s, user.employeeId);
    if (w.toEmpId && w.toEmpId !== me.id) throw new PermError('You do not have permission to do this');
    if (me.id === w.empId) throw new PermError('You do not have permission to do this');
    const { sh, sh2 } = swapShifts(s, w);
    if (shiftStartTs(sh) <= now) { w.status = 'expired'; throw new UserError('That shift has already started'); }
    if (!op.accept) { if (!w.toEmpId) throw new UserError('Nothing to decline'); w.status = 'declined'; w.decidedAt = now; audit(s, user, now, 'swap.decline', `${sh.date}`); return {}; }
    if (w.type === 'swap') failAssign(s, sh, me, sh2.id); else failAssign(s, sh, me);
    w.toEmpId = me.id; w.status = 'manager'; audit(s, user, now, 'swap.accept', `${sh.date} ${sh.start}`); return {};
  },
  claimShift(s, op, { user, now }) {
    const sh = getSh(s, op.shiftId); if (user.role !== 'staff' || !user.employeeId) throw new PermError('You do not have permission to do this');
    const e = getE(s, user.employeeId);
    if (sh.employeeId) throw new UserError('That shift is not open'); if (!sh.published) throw new UserError('That shift is not published');
    if (!futureShift(sh, now)) throw new UserError('That shift has already started');
    if (s.swaps.some((w) => w.type === 'claim' && w.shiftId === sh.id && w.toEmpId === e.id && w.status === 'manager')) throw new UserError('You already asked for this shift');
    failAssign(s, sh, e);
    return once(s, op, () => { const w = { id: nextId(s, 'w'), type: 'claim', shiftId: sh.id, empId: e.id, toEmpId: e.id, withShiftId: null, status: 'manager', note: optStr(op.note, 120, 'Note'), createdAt: now }; s.swaps.push(w); audit(s, user, now, 'swap.claim', `${sh.date} ${sh.start} ${e.name}`); return { id: w.id }; });
  },
  decideSwap(s, op, { user, now }) {
    need(user, MGR); const w = s.swaps.find((x) => x.id === op.id); if (!w) throw new UserError('Request not found');
    if (w.status !== 'manager') throw new UserError('This request is not waiting for a manager');
    if (typeof op.approve !== 'boolean') throw new UserError('Bad request');
    const note = optStr(op.note, 120, 'Note');
    if (!op.approve) { if (!note) throw new UserError('Add a reason for declining'); w.status = 'denied'; w.note2 = note; w.decidedBy = user.name; w.decidedAt = now; audit(s, user, now, 'swap.deny', w.id); return {}; }
    if (w.type === 'claim') for (const o of s.swaps) if (o !== w && o.type === 'claim' && o.shiftId === w.shiftId && o.status === 'manager') { o.status = 'denied'; o.note2 = 'Given to someone else'; o.decidedAt = now; }
    const warnings = applySwap(s, w, now); w.status = 'approved'; w.decidedBy = user.name; w.decidedAt = now; audit(s, user, now, 'swap.approve', w.id); return { warnings };
  },
  cancelSwap(s, op, { user, now }) {
    const w = s.swaps.find((x) => x.id === op.id); if (!w) throw new UserError('Request not found'); selfOr(user, w.empId);
    if (w.status !== 'peer' && w.status !== 'manager') throw new UserError('This request cannot be cancelled');
    w.status = 'cancelled'; w.decidedAt = now; audit(s, user, now, 'swap.cancel', w.id); return {};
  },
  // time clock
  clockIn(s, op, { user, now }) {
    const empId = op.employeeId || user.employeeId; if (!empId) throw new UserError('Bad request'); selfOr(user, empId); const e = getE(s, empId);
    if (!e.active) throw new UserError('This person is not active');
    if (openPunch(s, e.id)) throw new UserError('Already clocked in');
    const note = optStr(op.note, 120, 'Note'); const sh = findShiftFor(s, e.id, now); const mgr = user.role !== 'staff';
    if (!sh && !mgr) throw new UserError('No published shift for you right now. Ask your manager.');
    if (!sh && !note) throw new UserError('Add a note for an unscheduled punch');
    if (lockedDate(s, dayKey(now))) throw new UserError('This date is in an approved payroll run');
    return once(s, op, () => {
      const late = sh ? Math.max(0, Math.round((now - shiftStartTs(sh)) / 60000)) : 0;
      const p = { id: nextId(s, 'p'), employeeId: e.id, in: now, out: null, breakMin: 0, breakStart: null, shiftId: sh ? sh.id : null, source: 'clock', approved: false, lateMin: late, paidMin: null, note };
      s.punches.push(p); audit(s, user, now, 'clock.in', `${e.name}${mgr ? ' (by manager)' : ''}`); return { id: p.id, late };
    });
  },
  startBreak(s, op, { user, now }) {
    const empId = op.employeeId || user.employeeId; selfOr(user, empId); const p = openPunch(s, empId);
    if (!p) throw new UserError('Not clocked in'); if (p.breakStart) throw new UserError('Already on a break');
    p.breakStart = now; return {};
  },
  endBreak(s, op, { user, now }) {
    const empId = op.employeeId || user.employeeId; selfOr(user, empId); const p = openPunch(s, empId);
    if (!p || !p.breakStart) throw new UserError('Not on a break');
    p.breakMin += Math.max(1, Math.round((now - p.breakStart) / 60000)); p.breakStart = null; return {};
  },
  clockOut(s, op, { user, now }) {
    const empId = op.employeeId || user.employeeId; if (!empId) throw new UserError('Bad request'); selfOr(user, empId); const e = getE(s, empId); const p = openPunch(s, e.id);
    if (!p) throw new UserError('Not clocked in');
    if (now - p.in > 16 * 3600e3) throw new UserError('This punch is longer than 16 hours. A manager must correct it.');
    if (p.breakStart) { p.breakMin += Math.max(1, Math.round((now - p.breakStart) / 60000)); p.breakStart = null; }
    return once(s, op, () => { p.out = now; finalize(s, p); audit(s, user, now, 'clock.out', e.name); return { paidMin: p.paidMin }; });
  },
  addPunch(s, op, { user, now }) {
    need(user, MGR); const e = getE(s, op.employeeId); const a = punchTime(op, 'date', 'in', 'Clock in');
    let b = punchTime({ date: op.outDate || op.date, out: op.out }, 'date', 'out', 'Clock out'); if (!op.outDate && b <= a) b += 864e5;
    const reason = str(op.reason, 3, 120, 'Reason'); checkPunchTimes(s, e.id, a, b, now); const brk = intIn(op.breakMin ?? 0, 0, 180, 'Break');
    return once(s, op, () => { const p = { id: nextId(s, 'p'), employeeId: e.id, in: a, out: b, breakMin: brk, breakStart: null, shiftId: null, source: 'manual', approved: false, lateMin: 0, paidMin: null, note: reason, editedBy: user.name }; finalize(s, p); s.punches.push(p); audit(s, user, now, 'punch.add', `${e.name} ${dayKey(a)}: ${reason}`); return { id: p.id }; });
  },
  editPunch(s, op, { user, now }) {
    need(user, MGR); const p = s.punches.find((x) => x.id === op.id && !x.void); if (!p) throw new UserError('Punch not found');
    if (lockedDate(s, punchDate(p))) throw new UserError('This date is in an approved payroll run');
    const reason = str(op.reason, 3, 120, 'Reason'); const a = punchTime(op, 'date', 'in', 'Clock in');
    let b = punchTime({ date: op.outDate || op.date, out: op.out }, 'date', 'out', 'Clock out'); if (!op.outDate && b <= a) b += 864e5;
    checkPunchTimes(s, p.employeeId, a, b, now, p.id); const brk = intIn(op.breakMin ?? 0, 0, 180, 'Break');
    p.in = a; p.out = b; p.breakMin = brk; p.breakStart = null; p.source = p.source === 'clock' ? 'clock' : p.source; p.approved = false; p.editedBy = user.name; p.note = reason;
    if (p.source === 'clock') p.source = 'manual'; finalize(s, p); audit(s, user, now, 'punch.edit', `${getE(s, p.employeeId).name} ${dayKey(a)}: ${reason}`); return {};
  },
  voidPunch(s, op, { user, now }) {
    need(user, MGR); const p = s.punches.find((x) => x.id === op.id && !x.void); if (!p) throw new UserError('Punch not found');
    if (lockedDate(s, punchDate(p))) throw new UserError('This date is in an approved payroll run');
    const reason = str(op.reason, 3, 120, 'Reason'); p.void = true; p.note = reason; audit(s, user, now, 'punch.void', `${getE(s, p.employeeId).name} ${punchDate(p)}: ${reason}`); return {};
  },
  requestCorrection(s, op, { user, now }) {
    selfOr(user, op.employeeId); const e = getE(s, op.employeeId); const date = dateIn(op.date); const today = dayKey(now);
    if (date > today || diffDays(date, today) > 14) throw new UserError('Corrections can be requested for the last 14 days');
    toMin(op.in); toMin(op.out); const reason = str(op.reason, 3, 120, 'Reason');
    if (lockedDate(s, date)) throw new UserError('This date is in an approved payroll run');
    if (s.corrections.some((c) => c.status === 'pending' && c.employeeId === e.id && c.date === date)) throw new UserError('You already have a pending correction for this day');
    return once(s, op, () => { const c = { id: nextId(s, 'c'), employeeId: e.id, date, in: op.in, out: op.out, reason, status: 'pending', createdAt: now }; s.corrections.push(c); audit(s, user, now, 'correction.request', `${e.name} ${date}`); return { id: c.id }; });
  },
  decideCorrection(s, op, { user, now }) {
    need(user, MGR); const c = s.corrections.find((x) => x.id === op.id); if (!c) throw new UserError('Request not found');
    if (c.status !== 'pending') throw new UserError('This request was already decided'); if (typeof op.approve !== 'boolean') throw new UserError('Bad request');
    const note = optStr(op.note, 120, 'Note'); if (!op.approve && !note) throw new UserError('Add a reason for declining');
    if (op.approve) {
      const a = tsAt(c.date, c.in); let b = tsAt(c.date, c.out); if (b <= a) b += 864e5;
      checkPunchTimes(s, c.employeeId, a, b, now);
      const p = { id: nextId(s, 'p'), employeeId: c.employeeId, in: a, out: b, breakMin: 0, breakStart: null, shiftId: null, source: 'correction', approved: false, lateMin: 0, paidMin: null, note: c.reason, editedBy: user.name };
      const sh = s.shifts.find((x) => x.employeeId === c.employeeId && x.date === c.date); if (sh && !s.punches.some((q) => !q.void && q.shiftId === sh.id)) p.shiftId = sh.id;
      p.breakMin = sh ? Math.min(sh.breakMin, 60) : 0; finalize(s, p); s.punches.push(p);
    }
    c.status = op.approve ? 'approved' : 'declined'; c.note = note; c.decidedBy = user.name; c.decidedAt = now; audit(s, user, now, 'correction.' + c.status, `${getE(s, c.employeeId).name} ${c.date}`); return {};
  },
  approveTimesheet(s, op, { user, now }) {
    need(user, MGR); const from = dateIn(op.from, 'From'), to = dateIn(op.to, 'To');
    if (to < from || diffDays(from, to) > 31) throw new UserError('Pick a range of up to 32 days');
    if (to >= dayKey(now)) throw new UserError('Timesheets can be approved after the day is over');
    const inR = (p) => { const d = punchDate(p); return d >= from && d <= to && (!op.employeeId || p.employeeId === op.employeeId); };
    const open = livePunches(s).filter((p) => !p.out && inR(p)).length;
    if (open) throw new UserError(`${open} punch${open > 1 ? 'es are' : ' is'} still open. Fix them first.`);
    let n = 0; for (const p of livePunches(s)) if (inR(p) && !p.approved) { p.approved = true; p.approvedBy = user.name; n++; }
    audit(s, user, now, 'timesheet.approve', `${from} to ${to}: ${n}`); return { approved: n };
  },
  unapproveTimesheet(s, op, { user, now }) {
    need(user, ['owner']); const from = dateIn(op.from, 'From'), to = dateIn(op.to, 'To'); if (to < from || diffDays(from, to) > 31) throw new UserError('Pick a range of up to 32 days');
    if (lockedDate(s, from) || lockedDate(s, to)) throw new UserError('This date is in an approved payroll run');
    let n = 0; for (const p of livePunches(s)) { const d = punchDate(p); if (d >= from && d <= to && p.approved) { p.approved = false; n++; } }
    audit(s, user, now, 'timesheet.unapprove', `${from} to ${to}: ${n}`); return { changed: n };
  },
  // tips and sales
  addTips(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'payroll']); const date = dateIn(op.date); const today = dayKey(now);
    if (date > today || diffDays(date, today) > 60) throw new UserError('Tips can be entered for the last 60 days');
    if (lockedDate(s, date)) throw new UserError('This date is in an approved payroll run');
    const cash = intIn(op.cash ?? 0, 0, 5000000, 'Cash tips'), card = intIn(op.card ?? 0, 0, 5000000, 'Card tips'); if (cash + card <= 0) throw new UserError('Enter an amount');
    const note = optStr(op.note, 80, 'Note');
    return once(s, op, () => { const t = { id: nextId(s, 'tp'), date, cash, card, note, by: user.name }; s.tips.push(t); audit(s, user, now, 'tips.add', `${date}: ${egp(cash)} cash, ${egp(card)} card`); return { id: t.id }; });
  },
  deleteTips(s, op, { user, now }) {
    need(user, ['owner', 'manager', 'payroll']); const t = s.tips.find((x) => x.id === op.id); if (!t) throw new UserError('Tip entry not found');
    if (lockedDate(s, t.date)) throw new UserError('This date is in an approved payroll run');
    s.tips = s.tips.filter((x) => x !== t); audit(s, user, now, 'tips.delete', t.date); return {};
  },
  setSales(s, op, { user, now }) {
    need(user, MGR); const date = dateIn(op.date); const today = dayKey(now);
    if (date > today || diffDays(date, today) > 60) throw new UserError('Sales can be entered for the last 60 days');
    const amount = intIn(op.amount, 0, 100000000, 'Sales'); s.sales[date] = amount; audit(s, user, now, 'sales.set', `${date}: ${egp(amount)}`); return {};
  },
  // payroll
  createRun(s, op, { user, now }) {
    need(user, ['owner', 'payroll']); const from = dateIn(op.from, 'From'); if (!isWeekStart(from)) throw new UserError('A pay period starts on a Saturday');
    const weeks = intIn(op.weeks, 1, 2, 'Weeks'); const to = addDays(from, weeks * 7 - 1);
    if (to >= dayKey(now)) throw new UserError('The pay period must be over');
    if (s.runs.some((r) => r.from <= to && from <= r.to)) throw new UserError('Overlaps another payroll run');
    if (s.runs.some((r) => r.status === 'draft')) throw new UserError('Finish or delete the draft run first');
    return once(s, op, () => { const r = { id: nextId(s, 'pr'), no: 'PR-' + String(s.counters.pr).padStart(3, '0'), from, to, status: 'draft', adjustments: [], lines: null, createdBy: user.name, createdAt: now }; s.runs.push(r); audit(s, user, now, 'run.create', `${r.no} ${from} to ${to}`); return { id: r.id }; });
  },
  addAdjustment(s, op, { user, now }) {
    need(user, ['owner', 'payroll']); const r = getRun(s, op.runId); if (r.status !== 'draft') throw new UserError('Only a draft run can be changed');
    const e = getE(s, op.employeeId); const kind = oneOf(op.kind, ['bonus', 'deduction'], 'Pick bonus or deduction'); const amount = intIn(op.amount, 100, 5000000, 'Amount (piasters)'); const reason = str(op.reason, 3, 80, 'Reason');
    if (r.adjustments.length >= 100) throw new UserError('Too many adjustments');
    return once(s, op, () => { const a = { id: nextId(s, 'a'), employeeId: e.id, kind, amount, reason, by: user.name }; r.adjustments.push(a); audit(s, user, now, 'run.adjust', `${r.no} ${e.name} ${kind} ${egp(amount)}: ${reason}`); return { id: a.id }; });
  },
  removeAdjustment(s, op, { user, now }) {
    need(user, ['owner', 'payroll']); const r = getRun(s, op.runId); if (r.status !== 'draft') throw new UserError('Only a draft run can be changed');
    if (!r.adjustments.some((a) => a.id === op.id)) throw new UserError('Adjustment not found');
    r.adjustments = r.adjustments.filter((a) => a.id !== op.id); audit(s, user, now, 'run.unadjust', r.no); return {};
  },
  approveRun(s, op, { user, now }) {
    need(user, ['owner']); const r = getRun(s, op.runId); if (r.status !== 'draft') throw new UserError('This run is already approved');
    const issues = runIssues(s, r); if (issues.length) throw new UserError('Fix the open issues before approving');
    const { lines } = periodLines(s, r.from, r.to, r.adjustments); if (!lines.length) throw new UserError('Nothing to pay in this period');
    r.lines = lines.map((l, i) => ({ ...l, slip: `PS-${r.no.slice(3)}-${String(i + 1).padStart(3, '0')}` }));
    r.status = 'approved'; r.approvedBy = user.name; r.approvedAt = now; audit(s, user, now, 'run.approve', `${r.no}: net ${egp(totals(r.lines).net)}`); return {};
  },
  markPaid(s, op, { user, now }) {
    need(user, ['owner', 'payroll']); const r = getRun(s, op.runId); if (r.status !== 'approved') throw new UserError('Only an approved run can be marked as paid');
    const method = oneOf(op.method, ['cash', 'bank', 'wallet'], 'Pick how it was paid'); const date = dateIn(op.date, 'Payment date');
    if (date > dayKey(now) || date < r.to) throw new UserError('Payment date must be after the period and not in the future');
    r.status = 'paid'; r.paidAt = date; r.method = method; r.paidBy = user.name; audit(s, user, now, 'run.paid', `${r.no} ${method} ${date}`); return {};
  },
  reopenRun(s, op, { user, now }) {
    need(user, ['owner']); const r = getRun(s, op.runId); if (r.status !== 'approved') throw new UserError('Only an approved run that is not paid can be reopened');
    const reason = str(op.reason, 3, 120, 'Reason'); r.status = 'draft'; r.lines = null; r.approvedBy = null; r.reopened = (r.reopened || 0) + 1; audit(s, user, now, 'run.reopen', `${r.no}: ${reason}`); return {};
  },
  deleteRun(s, op, { user, now }) {
    need(user, ['owner', 'payroll']); const r = getRun(s, op.runId); if (r.status !== 'draft') throw new UserError('Only a draft run can be deleted');
    s.runs = s.runs.filter((x) => x !== r); audit(s, user, now, 'run.delete', r.no); return {};
  },
  updateSettings(s, op, { user, now }) {
    need(user, ['owner']); const st = settings(s); const n = {};
    const lim = { otAfterHours: [20, 60], otPercent: [100, 300], maxDailyHours: [6, 16], maxWeekPlanHours: [30, 80], minRestHours: [6, 16], insurancePercent: [0, 30], cardFeePercent: [0, 10], roundMin: [1, 15] };
    for (const [k, [lo, hi]] of Object.entries(lim)) if (op[k] !== undefined) n[k] = intIn(op[k], lo, hi, k);
    if (!Object.keys(n).length) throw new UserError('Nothing to change');
    if (s.runs.some((r) => r.status === 'draft')) throw new UserError('Finish or delete the draft payroll run first');
    s.settings = { ...st, ...n }; audit(s, user, now, 'settings', Object.entries(n).map(([k, v]) => `${k}=${v}`).join(', ')); return {};
  },
  logReminder(s, op, { user, now }) {
    need(user, MGR);
    const key = typeof op.key === 'string' && /^[a-z]{2,6}:[a-z0-9-]{1,24}$/.test(op.key) ? op.key : null; if (!key) throw new UserError('Bad request');
    s.reminderLog.push({ key, date: dayKey(now), by: user.name }); if (s.reminderLog.length > 200) s.reminderLog.shift(); return {};
  },
};
const DEFAULT_RATE = { lead: 5500, waiter: 3500, cook: 4500, cashier: 3800, host: 3400, barista: 3600, dish: 3200 };

export function applyOp(s, op, ctx) {
  const fn = op && typeof op === 'object' ? OPS[op.type] : null;
  if (!fn || !Object.prototype.hasOwnProperty.call(OPS, op.type)) throw new UserError('Unknown action');
  if (op.key !== undefined) { if (typeof op.key !== 'string' || op.key.length < 4 || op.key.length > 40) throw new UserError('Bad request'); if (s.keys.includes(op.key)) return { duplicate: true }; }
  return fn(s, op, ctx);
}
export const OP_NAMES = Object.keys(OPS);

// ---------- reports ----------
export function reports(s, now, money) {
  const today = dayKey(now), st = settings(s); const cur = weekStart(today);
  const weeks = []; for (let i = 7; i >= 0; i--) weeks.push(addDays(cur, -7 * i));
  const byWeek = Object.fromEntries(weeks.map((w) => [w, { hours: 0, ot: 0, cost: 0, otCost: 0, sales: 0, tips: 0, late: 0, punches: 0 }]));
  const perEmp = {}; const posHours = {};
  for (const p of livePunches(s)) {
    if (!p.out) continue; const w = weekStart(punchDate(p)); if (!byWeek[w]) continue;
    const e = s.employees.find((x) => x.id === p.employeeId); if (!e) continue;
    ((perEmp[e.id] ||= {})[w] = ((perEmp[e.id] || {})[w] || 0) + (p.paidMin || 0));
    byWeek[w].punches++; if (p.lateMin > st.lateGraceMin) byWeek[w].late++;
    if (weeks.indexOf(w) >= 4) posHours[e.positionIds[0]] = (posHours[e.positionIds[0]] || 0) + (p.paidMin || 0);
  }
  for (const [id, wk] of Object.entries(perEmp)) {
    const e = s.employees.find((x) => x.id === id);
    for (const [w, m] of Object.entries(wk)) { const o = Math.max(0, m - st.otAfterHours * 60); byWeek[w].hours += m; byWeek[w].ot += o; if (money) { const reg = Math.round(((m - o) * e.rate) / 60), ot = Math.round((o * e.rate * st.otPercent) / 100 / 60); byWeek[w].cost += reg + ot; byWeek[w].otCost += ot; } }
  }
  for (const [d, v] of Object.entries(s.sales)) { const w = weekStart(d); if (byWeek[w]) byWeek[w].sales += v; }
  for (const t of s.tips) { const w = weekStart(t.date); if (byWeek[w]) byWeek[w].tips += tipNet(t, st); }
  const rows = weeks.map((w) => { const b = byWeek[w]; return { week: w, hours: b.hours, ot: b.ot, late: b.late, punches: b.punches, ...(money ? { cost: b.cost, otCost: b.otCost, sales: b.sales, laborPct: b.sales ? b.cost / b.sales : null, tips: b.tips } : {}) }; });
  const done = rows.filter((r) => r.week < cur);
  const thisWeek = s.shifts.filter((x) => weekStart(x.date) === cur);
  const nextWeek = s.shifts.filter((x) => weekStart(x.date) === addDays(cur, 7));
  const late = done.reduce((a, r) => a + r.late, 0), pun = done.reduce((a, r) => a + r.punches, 0);
  const noShows = s.shifts.filter((x) => x.employeeId && x.published && x.date < today && x.date >= addDays(cur, -28) && !livePunches(s).some((p) => p.shiftId === x.id) && !livePunches(s).some((p) => p.employeeId === x.employeeId && punchDate(p) === x.date)).length;
  const out = {
    weeks: rows, posHours: POS_IDS.map((id) => ({ id, minutes: posHours[id] || 0 })), latePct: pun ? late / pun : 0, noShows,
    openThisWeek: thisWeek.filter((x) => !x.employeeId).length, openNextWeek: nextWeek.filter((x) => !x.employeeId).length, coverage: thisWeek.length ? thisWeek.filter((x) => x.employeeId).length / thisWeek.length : 1,
    publishedNext: !!s.published[addDays(cur, 7)],
  };
  if (money) { const last4 = done.slice(-4); const c = last4.reduce((a, r) => a + r.cost, 0), sa = last4.reduce((a, r) => a + r.sales, 0); out.laborPct4 = sa ? c / sa : null; out.cost4 = c; out.sales4 = sa; out.tips4 = last4.reduce((a, r) => a + r.tips, 0); }
  return out;
}

// ---------- reminders ----------
export function reminders(s, now) {
  const st = settings(s); const today = dayKey(now); const tomorrow = addDays(today, 1); const out = []; const logs = {};
  for (const r of s.reminderLog) logs[r.key] = r.date > (logs[r.key] || '') ? r.date : logs[r.key];
  const push = (o) => out.push({ ...o, sent: logs[o.key] === today ? today : null });
  for (const sh of s.shifts) if (sh.employeeId && sh.date === tomorrow && sh.published) push({ key: `sh:${sh.id}`, type: 'shift', employeeId: sh.employeeId, shiftId: sh.id, severity: 'soon', due: sh.date });
  for (const p of livePunches(s)) if (!p.out && now - p.in > 12 * 3600e3) push({ key: `fg:${p.id}`, type: 'forgot', employeeId: p.employeeId, punchId: p.id, severity: 'overdue', due: punchDate(p) });
  for (const e of s.employees) if (e.active && e.healthCard) { const left = diffDays(today, e.healthCard); if (left <= st.healthDays) push({ key: `hc:${e.id}`, type: 'health', employeeId: e.id, severity: left < 0 ? 'overdue' : 'soon', due: e.healthCard, daysLeft: left }); }
  return out;
}

// ---------- csv ----------
export function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export const toCsv = (rows) => '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

// ---------- what each user may see ----------
const pubEmp = (e) => ({ id: e.id, name: e.name, nameAr: e.nameAr, positionIds: e.positionIds, active: e.active });
export function view(s, user, now) {
  const today = dayKey(now), st = settings(s), role = user.role;
  const staff = role === 'staff', owner = role === 'owner', mgr = role === 'owner' || role === 'manager', pay = role === 'owner' || role === 'payroll';
  const myId = user.employeeId; const from70 = addDays(today, -70);
  const employees = staff ? s.employees.map((e) => (e.id === myId ? { ...pubEmp(e), phone: e.phone, healthCard: e.healthCard, hired: e.hired, avail: e.avail } : pubEmp(e)))
    : s.employees.map((e) => (pay ? e : (({ rate, insured, ...r }) => r)(e)));
  const shifts = (mgr ? s.shifts : s.shifts.filter((x) => x.published)).filter((x) => x.date >= addDays(today, -35));
  const swaps = s.swaps.filter((w) => mgr || (staff && (w.empId === myId || w.toEmpId === myId || (w.status === 'peer' && w.type === 'give' && !w.toEmpId))) ).filter((w) => !staff || w.createdAt > now - 30 * 864e5);
  const v = {
    today, nowTs: now, me: { id: user.id, name: user.name, nameAr: user.nameAr, role, employeeId: myId || null }, company: s.company, resetAt: s.resetAt,
    settings: st, employees, shifts, published: s.published,
    timeOff: staff ? s.timeOff.filter((t) => t.employeeId === myId) : s.timeOff.filter((t) => t.to >= addDays(today, -60)),
    swaps,
    punches: livePunches(s).filter((p) => punchDate(p) >= from70 && (!staff || p.employeeId === myId)),
    corrections: staff ? s.corrections.filter((c) => c.employeeId === myId) : s.corrections.filter((c) => c.createdAt > now - 60 * 864e5 || c.status === 'pending'),
  };
  if (!staff) { v.tips = s.tips.filter((t) => t.date >= from70).map((t) => ({ ...t, net: tipNet(t, st) })); v.tipDist = allocateTips(s, from70, today).byEmp; }
  if (mgr || pay) v.sales = Object.fromEntries(Object.entries(s.sales).filter(([d]) => d >= from70));
  if (pay) { v.runs = s.runs.map((r) => runView(s, r)); }
  if (staff) v.payslips = s.runs.filter((r) => r.lines && (r.status === 'approved' || r.status === 'paid')).map((r) => ({ id: r.id, no: r.no, from: r.from, to: r.to, status: r.status, paidAt: r.paidAt || null, method: r.method || null, line: r.lines.find((l) => l.employeeId === myId) })).filter((p) => p.line);
  if (mgr || pay) v.reports = reports(s, now, pay);
  if (mgr) { v.reminders = reminders(s, now); v.reminderLog = s.reminderLog.slice(-40); }
  if (owner) v.audit = s.audit;
  return v;
}

// ---------- seed ----------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// name, arabic, positions, rate (piasters per hour), phone, off day (0 = Sunday), weekly shift cap
const STAFF = [
  ['Hossam Lotfy', 'حسام لطفي', ['lead', 'cashier'], 5800, '201001230001', 5, 6], ['Rania Mahfouz', 'رانيا محفوظ', ['lead', 'host'], 5600, '201001230002', 0, 6],
  ['Youssef Hassan', 'يوسف حسن', ['waiter'], 3600, '201001230003', 3, 6], ['Mina Adel', 'مينا عادل', ['waiter'], 3500, '201001230004', 1, 6], ['Karim Saad', 'كريم سعد', ['waiter'], 3500, '201001230005', 2, 6],
  ['Nour Ashraf', 'نور أشرف', ['waiter', 'host', 'lead'], 3400, '201001230006', 4, 6], ['Ahmed Mansour', 'أحمد منصور', ['waiter', 'barista'], 3400, '201001230007', 6, 6], ['Salma Gad', 'سلمى جاد', ['waiter', 'barista'], 3500, '201001230008', 1, 6],
  ['Tamer Fahmy', 'تامر فهمي', ['waiter', 'host'], 3300, '201001230009', 3, 6], ['Mai Ezzat', 'مي عزت', ['waiter', 'host'], 3300, '201001230010', 0, 6],
  ['Chef Mostafa Ragab', 'الشيف مصطفى رجب', ['cook'], 7500, '201001230011', 5, 6], ['Ashraf Younis', 'أشرف يونس', ['cook'], 5200, '201001230012', 2, 6], ['Wael Sabry', 'وائل صبري', ['cook'], 4800, '201001230013', 4, 6],
  ['Osama Helmy', 'أسامة حلمي', ['cook'], 4500, '201001230014', 1, 6], ['Hany Zaki', 'هاني زكي', ['cook', 'dish'], 4300, '201001230015', 6, 6], ['Ibrahim Nasser', 'إبراهيم ناصر', ['cook', 'dish'], 4000, '201001230016', 0, 6],
  ['Dalia Fouad', 'داليا فؤاد', ['cashier', 'host'], 3900, '201001230017', 2, 6], ['Basma Sherif', 'بسمة شريف', ['cashier'], 3800, '201001230018', 4, 6],
  ['Lina Magdy', 'لينا مجدي', ['barista'], 3700, '201001230019', 5, 6], ['Omar Tarek', 'عمر طارق', ['barista'], 3600, '201001230020', 3, 6],
  ['Sayed Abdo', 'سيد عبده', ['dish'], 3200, '201001230021', 1, 6], ['Fathy Ramadan', 'فتحي رمضان', ['dish'], 3200, '201001230022', 4, 6],
  ['Marwa Said', 'مروة سعيد', ['host', 'cashier'], 3400, '201001230023', 6, 6], ['Karam Ali', 'كرم علي', ['cook'], 4200, '201001230024', 2, 6],
  ['Hagar Nabil', 'هاجر نبيل', ['barista', 'cashier'], 3500, '201001230025', 0, 6], ['Adel Fekry', 'عادل فكري', ['dish', 'host'], 3200, '201001230026', 3, 6],
];
// position, start, end, break, normal count, busy count (Thursday, Friday, Saturday)
const SLOTS = [
  ['lead', '11:00', '20:00', 1, 1], ['lead', '17:00', '02:00', 1, 1], ['waiter', '11:00', '20:00', 2, 3], ['waiter', '17:00', '02:00', 3, 4],
  ['cook', '08:00', '17:00', 2, 2], ['cook', '15:00', '00:00', 2, 3], ['cashier', '11:00', '20:00', 1, 1], ['cashier', '17:00', '02:00', 1, 1],
  ['host', '17:00', '02:00', 1, 1], ['barista', '10:00', '19:00', 1, 1], ['barista', '16:00', '01:00', 1, 1], ['dish', '10:00', '19:00', 1, 1], ['dish', '17:00', '02:00', 1, 1],
];
export function seed(now = Date.now()) {
  const R = rng(20261125); const today = dayKey(now); const cur = weekStart(today);
  const s = {
    resetAt: now, counters: { e: 0, sh: 0, p: 0, t: 0, w: 0, c: 0, tp: 0, pr: 0, a: 0, u: 0 }, keys: [], audit: [], reminderLog: [], settings: { ...DEFAULTS },
    company: { name: 'Nile Grill House', nameAr: 'نايل جريل هاوس' },
    users: [{ id: 'u-owner', name: 'Hany Wagdy', nameAr: 'هاني وجدي', role: 'owner', pin: '1111' }, { id: 'u-mgr', name: 'Dina Samir', nameAr: 'دينا سمير', role: 'manager', pin: '2222' }, { id: 'u-pay', name: 'Samir Kamel', nameAr: 'سمير كامل', role: 'payroll', pin: '3333' }, { id: 'u-staff', name: 'Youssef Hassan', nameAr: 'يوسف حسن', role: 'staff', pin: '4444', employeeId: 'e3' }],
    employees: [], shifts: [], published: {}, timeOff: [], swaps: [], punches: [], corrections: [], tips: [], sales: {}, runs: [],
  };
  const caps = {}; const mine = {};
  for (const [name, nameAr, positionIds, rate, phone, off, cap] of STAFF) {
    const id = nextId(s, 'e'); caps[id] = cap;
    const avail = { [off]: { mode: 'off' } };
    if (['e6', 'e8'].includes(id)) { for (let d = 0; d < 7; d++) if (d !== off) avail[d] = { mode: 'window', from: '15:00', to: '03:00' }; }
    s.employees.push({ id, name, nameAr, positionIds, rate, phone, hired: addDays(today, -Math.round(120 + R() * 900)), active: true, insured: R() < 0.7, healthCard: addDays(today, Math.round(60 + R() * 280)), avail });
  }
  const em = (id) => s.employees.find((x) => x.id === id);
  em('e9').healthCard = addDays(today, 12); em('e22').healthCard = addDays(today, -6);
  const user = { id: 'u-owner', name: 'seed', role: 'owner' };
  // build a week of shifts, assigning each to the least loaded eligible person
  const build = (wk, assign, openRate, extra = 0) => {
    const load = {}, count = {};
    for (let d = 0; d < 7; d++) {
      const date = addDays(wk, d); const busy = [4, 5, 6].includes(dow(date));
      for (const [pos, start, end, n, nb] of SLOTS) for (let k = 0; k < (busy ? nb : n); k++) {
        const sh = { id: nextId(s, 'sh'), date, start, end, positionId: pos, breakMin: 30, note: '', employeeId: null, published: false };
        if (assign && !(openRate && R() < openRate)) {
          const cand = s.employees.filter((e) => (count[e.id] || 0) < caps[e.id] + extra && checkAssign({ settings: s.settings, timeOff: s.timeOff, shifts: mine[e.id] || [] }, sh, e).errors.length === 0).sort((a, b) => (load[a.id] || 0) - (load[b.id] || 0) || R() - 0.5);
          if (cand[0]) { sh.employeeId = cand[0].id; (mine[cand[0].id] ||= []).push(sh); load[cand[0].id] = (load[cand[0].id] || 0) + shiftPaidMin(sh); count[cand[0].id] = (count[cand[0].id] || 0) + 1; }
        }
        s.shifts.push(sh);
      }
    }
  };
  // history, current week (with a few open shifts) and next week (draft, not published)
  for (let w = -8; w <= 1; w++) { const wk = addDays(cur, w * 7); build(wk, true, w === 0 ? 0.04 : w === 1 ? 0.18 : 0, w < 0 ? 2 : 0); }
  for (const sh of s.shifts) { const wk = weekStart(sh.date); if (wk <= cur) sh.published = true; }
  for (let w = -8; w <= 0; w++) s.published[addDays(cur, w * 7)] = dayTs0(addDays(cur, w * 7 - 3));
  // time clock, tips and sales from the schedule
  const inProgress = [];
  for (const sh of s.shifts) {
    if (!sh.employeeId || !sh.published) continue; const a = shiftStartTs(sh), b = shiftEndTs(sh); if (a > now) continue;
    const r = R(); if (r < 0.015 && sh.date < today) continue; // no-show
    const late = R() < 0.12 ? Math.round(3 + R() * 22) : 0, early = !late && R() < 0.3 ? Math.round(4 + R() * 12) : 0;
    const stay = sh.positionId === 'lead' ? Math.round(R() * 50) : R() < 0.35 ? Math.round(R() * 30) : 0;
    const inTs = a + (late - early) * 60000; let outTs = b + stay * 60000;
    const p = { id: nextId(s, 'p'), employeeId: sh.employeeId, in: inTs, out: outTs, breakMin: 0, breakStart: null, shiftId: sh.id, source: 'clock', approved: false, lateMin: late, paidMin: null, note: '' };
    if (R() < 0.7) p.breakMin = Math.round(20 + R() * 20);
    if (outTs > now) { if (inTs <= now && R() < 0.92) { p.out = null; inProgress.push(p); s.punches.push(p); } continue; }
    finalize(s, p); p.approved = punchDate(p) < addDays(cur, -3); s.punches.push(p);
  }
  for (let d = -56 - 6; d < 0; d++) {
    const date = addDays(cur, d); if (date >= today) continue; if (date < addDays(cur, -56)) continue;
    const busy = [4, 5, 6].includes(dow(date)); const sale = Math.round((busy ? 31000 + R() * 7000 : 16000 + R() * 4500)); s.sales[date] = sale * 100;
    s.tips.push({ id: nextId(s, 'tp'), date, cash: Math.round(sale * (0.018 + R() * 0.012)) * 100, card: Math.round(sale * (0.04 + R() * 0.025)) * 100, note: '', by: 'Dina Samir' });
  }
  for (let d = 0; d < diffDays(cur, today); d++) { const date = addDays(cur, d); const busy = [4, 5, 6].includes(dow(date)); const sale = Math.round(busy ? 31000 + R() * 7000 : 16000 + R() * 4500); s.sales[date] = sale * 100; if (date < today) s.tips.push({ id: nextId(s, 'tp'), date, cash: Math.round(sale * (0.018 + R() * 0.012)) * 100, card: Math.round(sale * (0.04 + R() * 0.025)) * 100, note: '', by: 'Dina Samir' }); }
  // a forgotten clock-out from yesterday, and requests waiting for decisions
  const open = inProgress.length; void open;
  // payroll runs: three paid, built by the real rules
  const mkRun = (from, weeks, paid) => {
    const r = { id: nextId(s, 'pr'), no: 'PR-' + String(s.counters.pr).padStart(3, '0'), from, to: addDays(from, weeks * 7 - 1), status: 'draft', adjustments: [], lines: null, createdBy: 'Samir Kamel', createdAt: dayTs0(addDays(from, weeks * 7 + 1)) };
    s.runs.push(r);
    if (r.no === 'PR-002') { const e = em('e12'); r.adjustments.push({ id: nextId(s, 'a'), employeeId: e.id, kind: 'bonus', amount: 50000, reason: 'Holiday menu launch', by: 'Samir Kamel' }); r.adjustments.push({ id: nextId(s, 'a'), employeeId: 'e7', kind: 'deduction', amount: 30000, reason: 'Salary advance', by: 'Samir Kamel' }); }
    const { lines } = periodLines(s, r.from, r.to, r.adjustments); r.lines = lines.map((l, i) => ({ ...l, slip: `PS-${r.no.slice(3)}-${String(i + 1).padStart(3, '0')}` }));
    r.status = paid ? 'paid' : 'approved'; r.approvedBy = 'Hany Wagdy'; r.approvedAt = dayTs0(addDays(r.to, 2)); if (paid) { r.paidAt = addDays(r.to, 3); r.method = R() < 0.5 ? 'bank' : 'cash'; r.paidBy = 'Samir Kamel'; }
  };
  mkRun(addDays(cur, -56), 2, true); mkRun(addDays(cur, -42), 2, true); mkRun(addDays(cur, -28), 2, true);
  // pending requests so each role has something to do
  const futureShift2 = (empId, minDays) => s.shifts.find((x) => x.employeeId === empId && x.published && shiftStartTs(x) > now && diffDays(today, x.date) >= minDays);
  const yS = futureShift2('e3', 1), kS = futureShift2('e5', 1), mS = futureShift2('e4', 2);
  if (yS && kS && yS.positionId === kS.positionId) { const w = { id: nextId(s, 'w'), type: 'swap', shiftId: yS.id, empId: 'e3', toEmpId: 'e5', withShiftId: kS.id, status: 'peer', note: 'Family dinner that night', createdAt: now - 3600e3 }; if (checkAssign(s, yS, em('e5'), kS.id).errors.length === 0 && checkAssign(s, kS, em('e3'), yS.id).errors.length === 0) s.swaps.push(w); }
  if (mS) s.swaps.push({ id: nextId(s, 'w'), type: 'give', shiftId: mS.id, empId: 'e4', toEmpId: null, withShiftId: null, status: 'peer', note: 'Exam the next morning', createdAt: now - 7200e3 });
  for (const og of s.shifts.filter((x) => !x.employeeId && x.published && shiftStartTs(x) > now && x.positionId !== 'lead')) {
    const cand = s.employees.find((e) => e.id !== 'e3' && checkAssign({ settings: s.settings, timeOff: s.timeOff, shifts: s.shifts }, og, e).errors.length === 0);
    if (cand) { s.swaps.push({ id: nextId(s, 'w'), type: 'claim', shiftId: og.id, empId: cand.id, toEmpId: cand.id, withShiftId: null, status: 'manager', note: '', createdAt: now - 1800e3 }); break; }
  }
  const tg = s.shifts.find((x) => x.employeeId === 'e8' && x.published && shiftStartTs(x) > now && diffDays(today, x.date) >= 1);
  if (tg) { const t = { id: nextId(s, 't'), employeeId: 'e8', from: addDays(today, 10), to: addDays(today, 12), reason: 'Cousin wedding in Alexandria', status: 'pending', createdAt: now - 86400e3 }; s.timeOff.push(t); }
  s.timeOff.push({ id: nextId(s, 't'), employeeId: 'e14', from: addDays(today, 5), to: addDays(today, 6), reason: 'Medical appointment', status: 'approved', decidedBy: 'Dina Samir', decidedAt: now - 5 * 3600e3, createdAt: now - 2 * 864e5 });
  const dsh = s.shifts.find((x) => x.employeeId === 'e5' && x.date === addDays(today, -2) && x.published);
  if (dsh && !lockedDate(s, dsh.date)) { const p = s.punches.find((x) => x.shiftId === dsh.id); if (p && p.out) { s.corrections.push({ id: nextId(s, 'c'), employeeId: 'e5', date: dsh.date, in: dsh.start, out: hmOf((toMin(dsh.end) + 30) % 1440), reason: 'Phone died, forgot to clock out', status: 'pending', createdAt: now - 4 * 3600e3 }); } }
  const yday = addDays(today, -1); const fp = s.punches.find((x) => x.out && punchDate(x) === yday && x.employeeId === 'e23');
  if (fp) { fp.out = null; fp.paidMin = null; fp.approved = false; }
  for (let i = 0; i < 30; i++) audit(s, user, now - (i + 1) * 5400e3, ['shift.assign', 'clock.in', 'timesheet.approve', 'swap.approve', 'week.publish'][i % 5], 'seed history');
  s.audit.length = 0; audit(s, { id: 'u-owner', name: 'Hany Wagdy' }, now, 'seed', 'Demo data created');
  return s;
}
const dayTs0 = (k) => localTs(k, 9 * 60);
