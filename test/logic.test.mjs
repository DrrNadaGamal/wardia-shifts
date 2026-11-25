import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.js';

const NOW = Date.UTC(2026, 10, 25, 9, 0); // Wed 25 Nov 2026, 11:00 Cairo
const TODAY = '2026-11-25';
const S = () => L.seed(NOW);
const byRole = (s, role) => s.users.find((u) => u.role === role);
const op = (s, role, o, now = NOW) => L.applyOp(s, o, { user: byRole(s, role), now });
const as = (s, user, o, now = NOW) => L.applyOp(s, o, { user, now });
const bad = (fn, cls, re) => assert.throws(fn, (e) => e instanceof cls && (!re || re.test(e.message)), re ? String(re) : 'throws');
const E = (s, id) => s.employees.find((e) => e.id === id);
const staffUser = (s, empId) => ({ id: 'u-x' + empId, name: E(s, empId).name, role: 'staff', employeeId: empId });
// a clean state with one employee of each kind and no shifts
const blank = () => { const s = S(); s.shifts = []; s.swaps = []; s.timeOff = []; s.corrections = []; s.punches = []; s.tips = []; s.runs = []; s.published = {}; for (const e of s.employees) e.avail = {}; return s; };
const mk = (s, date, start, end, pos, emp = null, extra = {}) => { const sh = { id: 'sh' + (++s.counters.sh), date, start, end, positionId: pos, breakMin: 30, note: '', employeeId: emp, published: true, ...extra }; s.shifts.push(sh); return sh; };

test('dates: Cairo day key, weeks start on Saturday, month helpers', () => {
  assert.equal(L.dayKey(Date.UTC(2026, 10, 25, 22, 30)), '2026-11-26');
  assert.equal(L.weekStart('2026-11-25'), '2026-11-21');
  assert.equal(L.weekStart('2026-11-21'), '2026-11-21');
  assert.equal(L.weekStart('2026-11-27'), '2026-11-21');
  assert.equal(L.weekStart('2026-11-28'), '2026-11-28');
  assert.equal(L.dow('2026-11-25'), 3);
  assert.equal(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(L.diffDays('2026-11-01', '2026-11-25'), 24);
  assert.equal(L.isKey('2026-02-30'), false);
  assert.equal(L.isWeekStart('2026-11-21'), true);
});
test('time: local time round trips through Cairo time, including daylight saving days', () => {
  for (const d of ['2026-01-15', '2026-04-23', '2026-04-24', '2026-04-25', '2026-07-01', '2026-10-29', '2026-10-30', '2026-11-25']) {
    for (const m of [60, 600, 1380]) { const ts = L.localTs(d, m); const p = L.localParts(ts); assert.equal(p.date, d, d + ' ' + m); assert.equal(p.min, m, d + ' ' + m); }
  }
  assert.equal(L.localTs(TODAY, 660), NOW); // 11:00 Cairo in winter is 09:00 UTC
  assert.equal(L.toMin('09:30'), 570);
  bad(() => L.toMin('25:00'), L.UserError);
  bad(() => L.toMin('9:30'), L.UserError);
});
test('shifts: overnight shift length, paid minutes, start and end timestamps', () => {
  const sh = { date: TODAY, start: '17:00', end: '02:00', breakMin: 30 };
  assert.equal(L.shiftMin(sh), 540); assert.equal(L.shiftPaidMin(sh), 510);
  assert.equal(L.shiftEndTs(sh) - L.shiftStartTs(sh), 540 * 60000);
  assert.equal(L.localParts(L.shiftEndTs(sh)).date, '2026-11-26');
  assert.equal(L.hmOf(L.toMin('02:00')), '02:00');
});
test('csv: escapes quotes, commas, formula starts', () => {
  assert.equal(L.csvCell('a,b'), '"a,b"'); assert.equal(L.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(L.csvCell('=1+1'), "'=1+1"); assert.equal(L.csvCell('@cmd'), "'@cmd");
  assert.ok(L.toCsv([['a', 'b']]).startsWith('\ufeff'));
});
test('seed: demo company has staff, eight weeks of history, paid runs and pending work', () => {
  const s = S();
  assert.equal(s.employees.length, 26); assert.equal(s.runs.length, 3); assert.ok(s.runs.every((r) => r.status === 'paid'));
  assert.ok(s.punches.length > 900); assert.ok(s.tips.length > 50); assert.equal(Object.keys(s.published).length, 9);
  assert.ok(s.swaps.some((w) => w.status === 'peer') && s.swaps.some((w) => w.status === 'manager'));
  assert.ok(s.timeOff.some((t) => t.status === 'pending')); assert.ok(s.corrections.some((c) => c.status === 'pending'));
  assert.ok(s.punches.some((p) => !p.out), 'someone is on the clock');
  assert.ok(s.shifts.some((x) => !x.employeeId && x.date > TODAY), 'open shifts ahead');
  assert.equal(L.seed(NOW).shifts.length, s.shifts.length, 'deterministic');
  assert.equal(L.weekStart(TODAY), '2026-11-21');
});
test('seed: every assigned shift in the schedule obeys the scheduling rules', () => {
  const s = S();
  for (const sh of s.shifts.filter((x) => x.employeeId && x.date >= '2026-11-21')) {
    const r = L.checkAssign(s, sh, E(s, sh.employeeId)); assert.deepEqual(r.errors.filter((x) => x !== 'timeoff'), [], sh.date + ' ' + sh.employeeId);
  }
});
test('seed: runs were built by the real rules and are internally consistent', () => {
  const s = S();
  for (const r of s.runs) {
    const t = L.totals(r.lines);
    assert.equal(t.net, r.lines.reduce((a, l) => a + l.net, 0));
    for (const l of r.lines) { assert.equal(l.gross, l.regPay + l.otPay + l.bonus + l.tips); assert.equal(l.net, l.gross - l.insurance - l.deductions); assert.ok(Number.isInteger(l.net)); }
    assert.equal(new Set(r.lines.map((l) => l.slip)).size, r.lines.length);
  }
  assert.ok(s.runs[1].lines.some((l) => l.bonus === 50000) && s.runs[1].lines.some((l) => l.deductions === 30000));
});

// ---------- scheduling rules ----------
test('rules: position, availability, time off, overlap, rest, daily and weekly limits', () => {
  const s = blank(); const e = E(s, 'e3'); // waiter
  const a = mk(s, '2026-12-01', '11:00', '19:00', 'waiter');
  assert.deepEqual(L.checkAssign(s, a, e).errors, []);
  assert.deepEqual(L.checkAssign(s, mk(s, '2026-12-01', '11:00', '19:00', 'cook'), e).errors, ['position']);
  e.avail = { [L.dow('2026-12-01')]: { mode: 'off' } }; assert.deepEqual(L.checkAssign(s, a, e).errors, ['availability']);
  e.avail = { [L.dow('2026-12-01')]: { mode: 'window', from: '15:00', to: '03:00' } }; assert.deepEqual(L.checkAssign(s, a, e).errors, ['availability']);
  assert.deepEqual(L.checkAssign(s, mk(s, '2026-12-01', '16:00', '01:00', 'waiter'), e).errors, []);
  e.avail = {};
  s.timeOff.push({ id: 't9', employeeId: 'e3', from: '2026-12-01', to: '2026-12-01', status: 'approved' }); assert.deepEqual(L.checkAssign(s, a, e).errors, ['timeoff']);
  s.timeOff[0].status = 'pending'; assert.deepEqual(L.checkAssign(s, a, e).errors, []);
  a.employeeId = 'e3';
  const ov = mk(s, '2026-12-01', '18:00', '23:00', 'waiter'); assert.ok(L.checkAssign(s, ov, e).errors.includes('overlap'));
  const late = mk(s, '2026-12-01', '17:00', '02:00', 'waiter'); assert.ok(L.checkAssign(s, late, e).errors.includes('overlap'));
  const next = mk(s, '2026-12-02', '03:00', '09:00', 'waiter'); assert.ok(L.checkAssign(s, next, e).errors.includes('rest'));
  const ok = mk(s, '2026-12-02', '11:00', '19:00', 'waiter'); assert.deepEqual(L.checkAssign(s, ok, e).errors, []);
  const long = mk(s, '2026-12-03', '08:00', '23:00', 'waiter'); assert.ok(L.checkAssign(s, long, e).errors.includes('daily'));
});
test('rules: more than 48 planned hours warns, more than 60 blocks', () => {
  const s = blank(); const e = E(s, 'e3');
  for (let d = 0; d < 5; d++) mk(s, L.addDays('2026-12-05', d), '10:00', '19:00', 'waiter', 'e3'); // 5 x 8.5h = 42.5h
  const sixth = mk(s, L.addDays('2026-12-05', 5), '10:00', '19:00', 'waiter'); // 51h
  const r = L.checkAssign(s, sixth, e); assert.deepEqual(r.errors, []); assert.deepEqual(r.warnings, ['overtime']);
  sixth.employeeId = 'e3';
  const seventh = mk(s, L.addDays('2026-12-05', 6), '10:00', '19:00', 'waiter'); // 59.5h
  assert.deepEqual(L.checkAssign(s, seventh, e).errors, []);
  seventh.employeeId = 'e3'; const extra = mk(s, L.addDays('2026-12-05', 6), '20:00', '23:00', 'waiter');
  assert.ok(L.checkAssign(s, extra, e).errors.includes('week'));
});
test('shifts: create, assign with warnings, update, delete, and the guard rails', () => {
  const s = blank();
  const r = op(s, 'manager', { type: 'createShift', date: '2026-12-01', start: '11:00', end: '19:00', positionId: 'waiter', employeeId: 'e3', key: 'k-create-1' });
  const sh = s.shifts.find((x) => x.id === r.id); assert.equal(sh.employeeId, 'e3'); assert.equal(sh.published, false);
  assert.equal(op(s, 'manager', { type: 'createShift', date: '2026-12-01', start: '11:00', end: '19:00', positionId: 'waiter', employeeId: 'e3', key: 'k-create-1' }).duplicate, true);
  assert.equal(s.shifts.length, 1);
  bad(() => op(s, 'manager', { type: 'createShift', date: '2026-12-01', start: '12:00', end: '20:00', positionId: 'waiter', employeeId: 'e3' }), L.UserError, /Overlaps/);
  bad(() => op(s, 'manager', { type: 'createShift', date: '2026-12-01', start: '12:00', end: '12:30', positionId: 'waiter' }), L.UserError, /between 2 and 16/);
  bad(() => op(s, 'manager', { type: 'createShift', date: '2026-11-20', start: '12:00', end: '18:00', positionId: 'waiter' }), L.UserError, /Past/);
  bad(() => op(s, 'manager', { type: 'createShift', date: '2027-03-20', start: '12:00', end: '18:00', positionId: 'waiter' }), L.UserError, /60 days/);
  bad(() => op(s, 'manager', { type: 'createShift', date: '2026-12-01', start: '12:00', end: '18:00', positionId: 'astronaut' }), L.UserError);
  bad(() => op(s, 'manager', { type: 'createShift', date: '2026-12-01', start: '12:00', end: '18:00', positionId: 'waiter', breakMin: 500 }), L.UserError);
  bad(() => op(s, 'manager', { type: 'createShift', date: '2026-12-01', start: '12:00', end: '18:00', positionId: 'cook', employeeId: 'e3' }), L.UserError, /position/);
  const o = op(s, 'manager', { type: 'createShift', date: '2026-12-02', start: '11:00', end: '19:00', positionId: 'waiter' });
  assert.equal(op(s, 'manager', { type: 'assignShift', shiftId: o.id, employeeId: 'e4' }).warnings.length, 0);
  op(s, 'manager', { type: 'assignShift', shiftId: o.id, employeeId: null }); assert.equal(s.shifts.find((x) => x.id === o.id).employeeId, null);
  op(s, 'manager', { type: 'updateShift', shiftId: o.id, start: '12:00', end: '20:00' }); assert.equal(s.shifts.find((x) => x.id === o.id).start, '12:00');
  op(s, 'manager', { type: 'deleteShift', shiftId: o.id }); assert.equal(s.shifts.some((x) => x.id === o.id), false);
  bad(() => op(s, 'manager', { type: 'deleteShift', shiftId: 'nope' }), L.UserError);
});
test('shifts: past shifts and shifts with a time clock record cannot change', () => {
  const s = blank(); const past = mk(s, '2026-11-24', '11:00', '19:00', 'waiter', 'e3');
  bad(() => op(s, 'manager', { type: 'deleteShift', shiftId: past.id }), L.UserError, /Past/);
  bad(() => op(s, 'manager', { type: 'assignShift', shiftId: past.id, employeeId: 'e4' }), L.UserError, /Past/);
  const today = mk(s, TODAY, '16:00', '23:00', 'waiter', 'e3'); s.punches.push({ id: 'p9', employeeId: 'e3', in: NOW, out: null, shiftId: today.id, breakMin: 0, source: 'clock' });
  bad(() => op(s, 'manager', { type: 'deleteShift', shiftId: today.id }), L.UserError, /time clock/);
});
test('weeks: publish, unpublish and copy the schedule', () => {
  const s = blank(); mk(s, '2026-12-05', '11:00', '19:00', 'waiter', 'e3', { published: false }); mk(s, '2026-12-06', '11:00', '19:00', 'cook', null, { published: false });
  bad(() => op(s, 'manager', { type: 'publishWeek', week: '2026-12-02' }), L.UserError, /Saturday/);
  bad(() => op(s, 'manager', { type: 'publishWeek', week: '2026-12-19' }), L.UserError, /no shifts/);
  const r = op(s, 'manager', { type: 'publishWeek', week: '2026-12-05' }); assert.equal(r.published, 2); assert.equal(r.open, 1);
  assert.ok(s.shifts.every((x) => x.published));
  const n = op(s, 'manager', { type: 'createShift', date: '2026-12-07', start: '11:00', end: '19:00', positionId: 'waiter' }); assert.equal(s.shifts.find((x) => x.id === n.id).published, true, 'new shifts in a published week are published');
  const c = op(s, 'manager', { type: 'copyWeek', from: '2026-12-05', to: '2026-12-12' }); assert.equal(c.made, 3); assert.equal(s.shifts.filter((x) => x.date >= '2026-12-12').length, 3);
  assert.ok(s.shifts.filter((x) => x.date >= '2026-12-12').every((x) => !x.published));
  bad(() => op(s, 'manager', { type: 'copyWeek', from: '2026-12-05', to: '2026-12-12' }), L.UserError, /already/);
  bad(() => op(s, 'manager', { type: 'copyWeek', from: '2026-12-05', to: '2026-12-05' }), L.UserError);
  op(s, 'manager', { type: 'unpublishWeek', week: '2026-12-05' }); assert.ok(s.shifts.filter((x) => L.weekStart(x.date) === '2026-12-05').every((x) => !x.published));
  s.timeOff.push({ id: 't1', employeeId: 'e3', from: '2026-12-19', to: '2026-12-19', status: 'approved' });
  const c2 = op(s, 'manager', { type: 'copyWeek', from: '2026-12-05', to: '2026-12-12' }.constructor === Object ? { type: 'copyWeek', from: '2026-12-12', to: '2026-12-19' } : {});
  assert.equal(c2.skipped, 1);
});

// ---------- time off, availability, staff ----------
test('time off: request, overlap, approve unassigns shifts, decline needs a reason', () => {
  const s = blank(); mk(s, '2026-12-03', '11:00', '19:00', 'waiter', 'e3'); mk(s, '2026-12-05', '11:00', '19:00', 'waiter', 'e3');
  const u = staffUser(s, 'e3');
  const r = as(s, u, { type: 'requestTimeOff', employeeId: 'e3', from: '2026-12-03', to: '2026-12-04', reason: 'Exam' });
  bad(() => as(s, u, { type: 'requestTimeOff', employeeId: 'e3', from: '2026-12-04', to: '2026-12-06', reason: 'More' }), L.UserError, /Overlaps/);
  bad(() => as(s, u, { type: 'requestTimeOff', employeeId: 'e3', from: '2026-11-20', to: '2026-11-21', reason: 'Past' }), L.UserError, /today or later/);
  bad(() => as(s, u, { type: 'requestTimeOff', employeeId: 'e3', from: '2026-12-10', to: '2026-12-08', reason: 'Back' }), L.UserError);
  bad(() => as(s, u, { type: 'requestTimeOff', employeeId: 'e4', from: '2026-12-10', to: '2026-12-11', reason: 'Other' }), L.PermError);
  bad(() => as(s, u, { type: 'decideTimeOff', id: r.id, approve: true }), L.PermError);
  bad(() => op(s, 'manager', { type: 'decideTimeOff', id: r.id, approve: false }), L.UserError, /reason/);
  const d = op(s, 'manager', { type: 'decideTimeOff', id: r.id, approve: true }); assert.equal(d.opened, 1);
  assert.equal(s.shifts[0].employeeId, null); assert.equal(s.shifts[1].employeeId, 'e3');
  bad(() => op(s, 'manager', { type: 'decideTimeOff', id: r.id, approve: false, note: 'x y z' }), L.UserError, /already/);
  as(s, u, { type: 'cancelTimeOff', id: r.id }); assert.equal(s.timeOff[0].status, 'cancelled');
});
test('availability: staff set their own, windows validated, at least two days free', () => {
  const s = blank(); const u = staffUser(s, 'e3');
  as(s, u, { type: 'setAvailability', employeeId: 'e3', days: { 1: { mode: 'off' }, 2: { mode: 'window', from: '16:00', to: '02:00' } } });
  assert.equal(E(s, 'e3').avail[1].mode, 'off'); assert.equal(E(s, 'e3').avail[2].from, '16:00');
  bad(() => as(s, u, { type: 'setAvailability', employeeId: 'e3', days: { 0: { mode: 'off' }, 1: { mode: 'off' }, 2: { mode: 'off' }, 3: { mode: 'off' }, 4: { mode: 'off' }, 5: { mode: 'off' } } }), L.UserError, /two days/);
  bad(() => as(s, u, { type: 'setAvailability', employeeId: 'e3', days: { 1: { mode: 'window', from: '10:00', to: '10:00' } } }), L.UserError);
  bad(() => as(s, u, { type: 'setAvailability', employeeId: 'e3', days: { 1: { mode: 'sometimes' } } }), L.UserError);
  bad(() => as(s, u, { type: 'setAvailability', employeeId: 'e4', days: {} }), L.PermError);
  op(s, 'manager', { type: 'setAvailability', employeeId: 'e4', days: { 6: { mode: 'off' } } }); assert.equal(E(s, 'e4').avail[6].mode, 'off');
});
test('staff: add, update, pay needs owner or payroll, deactivate opens future shifts', () => {
  const s = blank();
  const r = op(s, 'manager', { type: 'addEmployee', name: 'Test Person', nameAr: 'شخص تجربة', positionIds: ['cook', 'dish'], phone: '+20 100 000 0001' });
  const e = E(s, r.id); assert.equal(e.rate, 4500); assert.equal(e.phone, '+201000000001'); assert.equal(e.active, true);
  bad(() => op(s, 'manager', { type: 'addEmployee', name: 'Test Person', positionIds: ['cook'] }), L.UserError, /already/);
  bad(() => op(s, 'manager', { type: 'addEmployee', name: 'No Position', positionIds: [] }), L.UserError);
  bad(() => op(s, 'manager', { type: 'addEmployee', name: 'Bad Phone', positionIds: ['cook'], phone: 'abc' }), L.UserError);
  bad(() => op(s, 'manager', { type: 'setPay', employeeId: e.id, rate: 5000, insured: true }), L.PermError);
  bad(() => op(s, 'payroll', { type: 'setPay', employeeId: e.id, rate: 100, insured: true }), L.UserError);
  op(s, 'payroll', { type: 'setPay', employeeId: e.id, rate: 5000, insured: true }); assert.equal(e.rate, 5000); assert.equal(e.insured, true);
  mk(s, '2026-12-01', '08:00', '17:00', 'cook', e.id); mk(s, '2026-11-20', '08:00', '17:00', 'cook', e.id);
  bad(() => op(s, 'manager', { type: 'setActive', employeeId: e.id, active: false, reason: 'x' }), L.UserError);
  const d = op(s, 'manager', { type: 'setActive', employeeId: e.id, active: false, reason: 'Resigned' }); assert.equal(d.opened, 1);
  assert.equal(s.shifts[0].employeeId, null); assert.equal(s.shifts[1].employeeId, e.id, 'past shift keeps its person');
  bad(() => op(s, 'manager', { type: 'assignShift', shiftId: s.shifts[0].id, employeeId: e.id }), L.UserError, /no longer active/);
});

// ---------- swaps ----------
const swapState = () => {
  const s = blank(); const a = mk(s, '2026-12-02', '11:00', '19:00', 'waiter', 'e3'); const b = mk(s, '2026-12-03', '11:00', '19:00', 'waiter', 'e4'); const o = mk(s, '2026-12-04', '11:00', '19:00', 'waiter', null);
  return { s, a, b, o, u3: staffUser(s, 'e3'), u4: staffUser(s, 'e4'), u5: staffUser(s, 'e5') };
};
test('swaps: give away to the pool, a colleague takes it, the manager approves', () => {
  const { s, a, u3, u4, u5 } = swapState();
  const r = as(s, u3, { type: 'requestSwap', kind: 'give', shiftId: a.id, note: 'Exam' });
  bad(() => as(s, u3, { type: 'requestSwap', kind: 'give', shiftId: a.id }), L.UserError, /pending/);
  bad(() => as(s, u4, { type: 'requestSwap', kind: 'give', shiftId: a.id }), L.PermError);
  bad(() => as(s, u3, { type: 'respondSwap', id: r.id, accept: true }), L.PermError);
  bad(() => op(s, 'manager', { type: 'decideSwap', id: r.id, approve: true }), L.UserError, /not waiting for a manager/);
  as(s, u5, { type: 'respondSwap', id: r.id, accept: true }); assert.equal(s.swaps[0].status, 'manager'); assert.equal(s.swaps[0].toEmpId, 'e5');
  bad(() => as(s, u4, { type: 'respondSwap', id: r.id, accept: true }), L.UserError);
  bad(() => as(s, u5, { type: 'decideSwap', id: r.id, approve: true }), L.PermError);
  const d = op(s, 'manager', { type: 'decideSwap', id: r.id, approve: true }); assert.deepEqual(d.warnings, []);
  assert.equal(a.employeeId, 'e5'); assert.equal(s.swaps[0].status, 'approved');
});
test('swaps: a direct give can be declined, and a mutual swap exchanges both shifts', () => {
  const { s, a, b, u3, u4, u5 } = swapState();
  const g = as(s, u3, { type: 'requestSwap', kind: 'give', shiftId: a.id, toEmpId: 'e5' });
  bad(() => as(s, u4, { type: 'respondSwap', id: g.id, accept: true }), L.PermError);
  as(s, u5, { type: 'respondSwap', id: g.id, accept: false }); assert.equal(s.swaps[0].status, 'declined'); assert.equal(a.employeeId, 'e3');
  const w = as(s, u3, { type: 'requestSwap', kind: 'swap', shiftId: a.id, withShiftId: b.id });
  as(s, u4, { type: 'respondSwap', id: w.id, accept: true }); op(s, 'owner', { type: 'decideSwap', id: w.id, approve: true });
  assert.equal(a.employeeId, 'e4'); assert.equal(b.employeeId, 'e3');
  bad(() => as(s, u3, { type: 'requestSwap', kind: 'swap', shiftId: b.id, withShiftId: b.id }), L.UserError, /colleague/);
});
test('swaps: claim an open shift, manager decides, the loser is told no', () => {
  const { s, o, u3, u4 } = swapState();
  const c3 = as(s, u3, { type: 'claimShift', shiftId: o.id }); as(s, u4, { type: 'claimShift', shiftId: o.id });
  bad(() => as(s, u3, { type: 'claimShift', shiftId: o.id }), L.UserError, /already/);
  bad(() => op(s, 'manager', { type: 'claimShift', shiftId: o.id }), L.PermError);
  bad(() => op(s, 'manager', { type: 'decideSwap', id: c3.id, approve: false }), L.UserError, /reason/);
  op(s, 'manager', { type: 'decideSwap', id: c3.id, approve: true }); assert.equal(o.employeeId, 'e3');
  assert.equal(s.swaps[1].status, 'denied'); bad(() => as(s, u4, { type: 'claimShift', shiftId: o.id }), L.UserError, /not open/);
});
test('swaps: rules are checked again at approval, cancelled and expired requests close', () => {
  const { s, a, u3, u5 } = swapState();
  const r = as(s, u3, { type: 'requestSwap', kind: 'give', shiftId: a.id, toEmpId: 'e5' }); as(s, u5, { type: 'respondSwap', id: r.id, accept: true });
  s.timeOff.push({ id: 't5', employeeId: 'e5', from: '2026-12-02', to: '2026-12-02', status: 'approved' });
  bad(() => op(s, 'manager', { type: 'decideSwap', id: r.id, approve: true }), L.UserError, /time off/);
  assert.equal(a.employeeId, 'e3', 'nothing changed');
  op(s, 'manager', { type: 'decideSwap', id: r.id, approve: false, note: 'Not possible' }); assert.equal(s.swaps[0].status, 'denied');
  const c = as(s, u3, { type: 'requestSwap', kind: 'give', shiftId: a.id }); as(s, u3, { type: 'cancelSwap', id: c.id }); assert.equal(s.swaps[1].status, 'cancelled');
  const e = as(s, u3, { type: 'requestSwap', kind: 'give', shiftId: a.id }); L.normalize(s, L.shiftStartTs(a) + 1000); assert.equal(s.swaps.find((w) => w.id === e.id).status, 'expired');
  bad(() => as(s, u3, { type: 'requestSwap', kind: 'give', shiftId: a.id }, L.shiftStartTs(a) + 1000), L.UserError, /started/);
  bad(() => as(s, u3, { type: 'requestSwap', kind: 'give', shiftId: 'zzz' }), L.UserError);
});
test('swaps: a shift with a pending request cannot be edited or assigned', () => {
  const { s, a, u3 } = swapState(); as(s, u3, { type: 'requestSwap', kind: 'give', shiftId: a.id });
  bad(() => op(s, 'manager', { type: 'assignShift', shiftId: a.id, employeeId: 'e4' }), L.UserError, /swap/);
  bad(() => op(s, 'manager', { type: 'deleteShift', shiftId: a.id }), L.UserError, /swap/);
  bad(() => op(s, 'manager', { type: 'updateShift', shiftId: a.id, start: '12:00' }), L.UserError, /swap/);
});

// ---------- time clock ----------
const clockState = () => { const s = blank(); const sh = mk(s, TODAY, '11:00', '19:00', 'waiter', 'e3'); return { s, sh, u: staffUser(s, 'e3'), t0: L.shiftStartTs(sh) }; };
test('clock: window around the shift, one open punch, lateness, idempotency', () => {
  const { s, sh, u, t0 } = clockState();
  bad(() => as(s, u, { type: 'clockIn' }, t0 - 16 * 60000), L.UserError, /No published shift/);
  bad(() => as(s, u, { type: 'clockOut' }, t0), L.UserError, /Not clocked in/);
  const r = as(s, u, { type: 'clockIn', key: 'ci-0001' }, t0 + 7 * 60000); assert.equal(r.late, 7);
  assert.equal(as(s, u, { type: 'clockIn', key: 'ci-0001' }, t0 + 8 * 60000).duplicate, true);
  bad(() => as(s, u, { type: 'clockIn' }, t0 + 9 * 60000), L.UserError, /Already/);
  assert.equal(s.punches.length, 1); assert.equal(s.punches[0].shiftId, sh.id);
  bad(() => as(s, staffUser(s, 'e4'), { type: 'clockOut', employeeId: 'e3' }, t0 + 3600e3), L.PermError);
  bad(() => as(s, u, { type: 'clockIn', employeeId: 'e4' }, t0), L.PermError);
});
test('clock: unpublished shifts and other people\'s shifts do not allow a punch', () => {
  const { s, sh, u, t0 } = clockState(); sh.published = false;
  bad(() => as(s, u, { type: 'clockIn' }, t0), L.UserError, /No published shift/);
  sh.published = true; sh.employeeId = 'e4'; bad(() => as(s, u, { type: 'clockIn' }, t0), L.UserError, /No published shift/);
});
test('clock: time before the shift is not paid, a break is deducted, minutes round to 5', () => {
  const { s, u, t0 } = clockState();
  as(s, u, { type: 'clockIn' }, t0 - 10 * 60000);
  as(s, u, { type: 'startBreak' }, t0 + 4 * 3600e3); bad(() => as(s, u, { type: 'startBreak' }, t0 + 4 * 3600e3 + 1), L.UserError, /Already/);
  as(s, u, { type: 'endBreak' }, t0 + 4 * 3600e3 + 33 * 60000);
  bad(() => as(s, u, { type: 'endBreak' }, t0 + 5 * 3600e3), L.UserError, /Not on a break/);
  const r = as(s, u, { type: 'clockOut' }, t0 + 8 * 3600e3 + 12 * 60000); // 8h12 after start, 33 min break
  assert.equal(s.punches[0].breakMin, 33); assert.equal(r.paidMin, 460 - 0, 'rounded to 5'); // 492 - 33 = 459 -> 460
});
test('clock: no break taken on a long shift deducts the automatic break', () => {
  const { s, u, t0 } = clockState(); as(s, u, { type: 'clockIn' }, t0);
  const r = as(s, u, { type: 'clockOut' }, t0 + 8 * 3600e3); assert.equal(r.paidMin, 450); assert.equal(s.punches[0].autoBreak, true);
  const s2 = clockState(); as(s2.s, s2.u, { type: 'clockIn' }, s2.t0); const r2 = as(s2.s, s2.u, { type: 'clockOut' }, s2.t0 + 5 * 3600e3); assert.equal(r2.paidMin, 300, 'short shift has no automatic break');
});
test('clock: a manager can punch someone in with a note, and a forgotten punch cannot be closed late', () => {
  const { s, sh } = clockState(); sh.employeeId = null; const t = L.shiftStartTs(sh) + 600e3;
  bad(() => op(s, 'manager', { type: 'clockIn', employeeId: 'e3' }, t), L.UserError, /note/);
  op(s, 'manager', { type: 'clockIn', employeeId: 'e3', note: 'Phone broken' }, t); assert.equal(s.punches[0].shiftId, null);
  bad(() => op(s, 'manager', { type: 'clockOut', employeeId: 'e3' }, t + 20 * 3600e3), L.UserError, /16 hours/);
  op(s, 'manager', { type: 'clockOut', employeeId: 'e3' }, t + 3600e3); assert.ok(s.punches[0].out);
});
test('punches: add, edit and void need a reason, valid times and no overlap', () => {
  const s = blank(); const p = (o) => ({ type: 'addPunch', employeeId: 'e3', date: '2026-11-20', in: '11:00', out: '19:00', breakMin: 30, reason: 'Missed punch', ...o });
  const r = op(s, 'manager', p({})); assert.equal(s.punches[0].paidMin, 450);
  bad(() => op(s, 'manager', p({ in: '18:00', out: '22:00' })), L.UserError, /Overlaps/);
  bad(() => op(s, 'manager', p({ date: '2026-11-19', in: '12:00', out: '12:00' })), L.UserError, /16 hours|after/);
  bad(() => op(s, 'manager', p({ date: '2026-11-26' })), L.UserError, /future/);
  bad(() => op(s, 'manager', p({ date: '2026-08-01' })), L.UserError, /days back/);
  bad(() => op(s, 'manager', p({ reason: '' })), L.UserError, /Reason/);
  bad(() => op(s, 'manager', p({ breakMin: 400 })), L.UserError);
  bad(() => op(s, 'payroll', p({})), L.PermError); bad(() => as(s, staffUser(s, 'e3'), p({})), L.PermError);
  const ov = op(s, 'manager', p({ date: '2026-11-20', in: '20:00', out: '02:00' })); assert.equal(s.punches.find((x) => x.id === ov.id).paidMin, 330);
  op(s, 'manager', { type: 'editPunch', id: r.id, date: '2026-11-20', in: '10:30', out: '19:00', breakMin: 30, reason: 'Came early' });
  assert.equal(s.punches[0].paidMin, 480); op(s, 'manager', { type: 'voidPunch', id: r.id, reason: 'Duplicate' });
  assert.equal(L.view(s, byRole(s, 'owner'), NOW).punches.some((x) => x.id === r.id), false);
  bad(() => op(s, 'manager', { type: 'voidPunch', id: r.id, reason: 'Again' }), L.UserError, /not found/);
});
test('corrections: staff ask, the manager approves into a real punch or declines', () => {
  const s = blank(); const sh = mk(s, '2026-11-23', '11:00', '19:00', 'waiter', 'e3'); const u = staffUser(s, 'e3');
  const r = as(s, u, { type: 'requestCorrection', employeeId: 'e3', date: '2026-11-23', in: '11:00', out: '19:30', reason: 'Forgot to clock out' });
  bad(() => as(s, u, { type: 'requestCorrection', employeeId: 'e3', date: '2026-11-23', in: '11:00', out: '19:30', reason: 'Again' }), L.UserError, /pending/);
  bad(() => as(s, u, { type: 'requestCorrection', employeeId: 'e3', date: '2026-10-01', in: '11:00', out: '19:30', reason: 'Old' }), L.UserError, /14 days/);
  bad(() => as(s, u, { type: 'requestCorrection', employeeId: 'e4', date: '2026-11-23', in: '11:00', out: '19:30', reason: 'Other' }), L.PermError);
  bad(() => as(s, u, { type: 'decideCorrection', id: r.id, approve: true }), L.PermError);
  op(s, 'manager', { type: 'decideCorrection', id: r.id, approve: true }); assert.equal(s.punches.length, 1); assert.equal(s.punches[0].shiftId, sh.id); assert.equal(s.punches[0].source, 'correction');
  assert.equal(s.punches[0].paidMin, 8.5 * 60 - 30);
  const r2 = as(s, staffUser(s, 'e4'), { type: 'requestCorrection', employeeId: 'e4', date: '2026-11-23', in: '11:00', out: '19:00', reason: 'Lost' });
  bad(() => op(s, 'manager', { type: 'decideCorrection', id: r2.id, approve: false }), L.UserError, /reason/);
  op(s, 'manager', { type: 'decideCorrection', id: r2.id, approve: false, note: 'Not on the schedule' }); assert.equal(s.punches.length, 1);
});
test('timesheets: approval needs a finished day and no open punches', () => {
  const s = blank(); s.punches.push({ id: 'p1', employeeId: 'e3', in: L.tsAt('2026-11-20', '11:00'), out: L.tsAt('2026-11-20', '19:00'), breakMin: 30, source: 'manual', paidMin: 450, approved: false });
  s.punches.push({ id: 'p2', employeeId: 'e4', in: L.tsAt('2026-11-20', '11:00'), out: null, breakMin: 0, source: 'clock', approved: false });
  bad(() => op(s, 'manager', { type: 'approveTimesheet', from: '2026-11-20', to: '2026-11-20' }), L.UserError, /still open/);
  bad(() => op(s, 'manager', { type: 'approveTimesheet', from: '2026-11-25', to: '2026-11-25' }), L.UserError, /day is over/);
  bad(() => op(s, 'manager', { type: 'approveTimesheet', from: '2026-01-01', to: '2026-11-20' }), L.UserError, /32 days/);
  bad(() => op(s, 'payroll', { type: 'approveTimesheet', from: '2026-11-20', to: '2026-11-20' }), L.PermError);
  assert.equal(op(s, 'manager', { type: 'approveTimesheet', from: '2026-11-20', to: '2026-11-20', employeeId: 'e3' }).approved, 1); assert.equal(s.punches[0].approved, true);
  bad(() => op(s, 'manager', { type: 'unapproveTimesheet', from: '2026-11-20', to: '2026-11-20' }), L.PermError);
  assert.equal(op(s, 'owner', { type: 'unapproveTimesheet', from: '2026-11-20', to: '2026-11-20' }).changed, 1);
});

// ---------- tips and pay ----------
test('tips: the day\'s pool is split by hours times position weight and adds up exactly', () => {
  const s = blank(); const D = '2026-11-20'; const put = (id, h) => s.punches.push({ id: 'p' + id + h, employeeId: id, in: L.tsAt(D, '12:00'), out: L.tsAt(D, '12:00') + h * 3600e3, breakMin: 0, source: 'manual', paidMin: h * 60, approved: true });
  put('e3', 8); put('e4', 4); put('e11', 8); // two waiters, one cook
  op(s, 'manager', { type: 'addTips', date: D, cash: 100001, card: 200000 });
  const net = 100001 + 200000 - Math.round((200000 * 3) / 100); const a = L.allocateTips(s, D, D);
  assert.equal(Object.values(a.byEmp).reduce((x, y) => x + y, 0), net);
  assert.ok(a.byEmp.e3 > a.byEmp.e4 && a.byEmp.e4 > 0); assert.ok(Math.abs(a.byEmp.e3 / a.byEmp.e4 - 2) < 0.01);
  assert.ok(a.byEmp.e11 < a.byEmp.e3, 'a cook has a lower weight than a waiter'); assert.equal(a.unallocated.length, 0);
  op(s, 'manager', { type: 'addTips', date: D, cash: 5000, card: 0 }); assert.equal(Object.values(L.allocateTips(s, D, D).byEmp).reduce((x, y) => x + y, 0), net + 5000);
  const lone = L.allocateTips(s, '2026-11-19', '2026-11-19'); assert.equal(lone.unallocated.length, 0);
  op(s, 'manager', { type: 'addTips', date: '2026-11-19', cash: 5000, card: 0 }); assert.equal(L.allocateTips(s, '2026-11-19', '2026-11-19').unallocated[0].amount, 5000);
  bad(() => op(s, 'manager', { type: 'addTips', date: D, cash: 0, card: 0 }), L.UserError, /amount/);
  bad(() => op(s, 'manager', { type: 'addTips', date: '2026-11-30', cash: 100, card: 0 }), L.UserError);
  bad(() => as(s, staffUser(s, 'e3'), { type: 'addTips', date: D, cash: 100, card: 0 }), L.PermError);
});
test('tips: rounding never loses or invents a piaster', () => {
  const s = blank(); const D = '2026-11-20'; const ids = ['e3', 'e4', 'e5', 'e6', 'e7'];
  ids.forEach((id, i) => s.punches.push({ id: 'p' + i, employeeId: id, in: L.tsAt(D, '12:00'), out: L.tsAt(D, '20:00'), breakMin: 0, source: 'manual', paidMin: 480 - i * 7, approved: true }));
  for (const total of [1, 2, 3, 7, 99, 100001, 333333]) { s.tips = []; s.tips.push({ id: 'x', date: D, cash: total, card: 0 }); assert.equal(Object.values(L.allocateTips(s, D, D).byEmp).reduce((a, b) => a + b, 0), total); }
});
test('pay: overtime after 48 hours a week at the overtime rate, bonus and insurance', () => {
  const s = blank(); const e = E(s, 'e3'); e.rate = 4000; e.insured = true; const wk = '2026-11-07';
  const put = (d, h, i) => s.punches.push({ id: 'pp' + i, employeeId: 'e3', in: L.tsAt(d, '10:00'), out: L.tsAt(d, '10:00') + h * 3600e3, breakMin: 0, source: 'manual', paidMin: h * 60, approved: true });
  [0, 1, 2, 3, 4, 5].forEach((i) => put(L.addDays(wk, i), 9, i)); // 54 hours
  const r = L.periodLines(s, wk, L.addDays(wk, 6), [{ employeeId: 'e3', kind: 'bonus', amount: 10000 }, { employeeId: 'e3', kind: 'deduction', amount: 5000 }]).lines.find((l) => l.employeeId === 'e3');
  assert.equal(r.regMin, 48 * 60); assert.equal(r.otMin, 6 * 60);
  assert.equal(r.regPay, 48 * 4000); assert.equal(r.otPay, Math.round(6 * 4000 * 1.35));
  const wages = r.regPay + r.otPay + 10000; assert.equal(r.insurance, Math.round(wages * 0.11)); assert.equal(r.net, wages - r.insurance - 5000);
  e.insured = false; assert.equal(L.periodLines(s, wk, L.addDays(wk, 6)).lines[0].insurance, 0);
});
test('pay: overtime is counted per week, not across a two week run', () => {
  const s = blank(); s.employees[0].rate = 3000; const id = s.employees[0].id;
  for (let w = 0; w < 2; w++) for (let i = 0; i < 5; i++) { const d = L.addDays('2026-11-07', w * 7 + i); s.punches.push({ id: `q${w}${i}`, employeeId: id, in: L.tsAt(d, '10:00'), out: L.tsAt(d, '20:00'), source: 'manual', paidMin: 600, approved: true, breakMin: 0 }); }
  const l = L.periodLines(s, '2026-11-07', '2026-11-20').lines[0]; assert.equal(l.otMin, 2 * 120); assert.equal(l.regMin + l.otMin, 6000);
});
test('payroll: create, adjust, approve snapshot, pay, reopen', () => {
  const s = S(); const owner = 'owner', pay = 'payroll';
  bad(() => op(s, pay, { type: 'createRun', from: '2026-11-10', weeks: 1 }), L.UserError, /Saturday/);
  bad(() => op(s, pay, { type: 'createRun', from: '2026-11-21', weeks: 1 }), L.UserError, /over/);
  bad(() => op(s, pay, { type: 'createRun', from: '2026-11-14', weeks: 2 }), L.UserError, /over/);
  bad(() => op(s, pay, { type: 'createRun', from: '2026-11-07', weeks: 3 }), L.UserError);
  bad(() => op(s, 'manager', { type: 'createRun', from: '2026-11-07', weeks: 1 }), L.PermError);
  bad(() => op(s, pay, { type: 'createRun', from: '2026-10-31', weeks: 1 }), L.UserError, /Overlaps/);
  const r = op(s, pay, { type: 'createRun', from: '2026-11-07', weeks: 1, key: 'run-0001' }); const run = s.runs.find((x) => x.id === r.id);
  assert.equal(run.no, 'PR-004'); bad(() => op(s, pay, { type: 'createRun', from: '2026-11-14', weeks: 1 }), L.UserError, /draft/);
  assert.equal(L.runView(s, run).issues.length, 0);
  const emp = L.periodLines(s, run.from, run.to).lines[0];
  bad(() => op(s, pay, { type: 'addAdjustment', runId: run.id, employeeId: emp.employeeId, kind: 'deduction', amount: 99999999, reason: 'Too much' }), L.UserError);
  op(s, pay, { type: 'addAdjustment', runId: run.id, employeeId: emp.employeeId, kind: 'deduction', amount: emp.net + 100000, reason: 'Huge advance' });
  assert.ok(L.runView(s, run).issues.some((i) => i.type === 'negative'));
  bad(() => op(s, owner, { type: 'approveRun', runId: run.id }), L.UserError, /issues/);
  op(s, pay, { type: 'removeAdjustment', runId: run.id, id: run.adjustments[0].id });
  op(s, pay, { type: 'addAdjustment', runId: run.id, employeeId: emp.employeeId, kind: 'bonus', amount: 25000, reason: 'Great month' });
  bad(() => op(s, pay, { type: 'approveRun', runId: run.id }), L.PermError);
  op(s, owner, { type: 'approveRun', runId: run.id }); assert.equal(run.status, 'approved'); assert.ok(run.lines.every((l) => l.slip.startsWith('PS-004-')));
  const snap = JSON.stringify(run.lines);
  bad(() => op(s, pay, { type: 'addAdjustment', runId: run.id, employeeId: emp.employeeId, kind: 'bonus', amount: 100, reason: 'Late' }), L.UserError, /draft/);
  bad(() => op(s, 'manager', { type: 'voidPunch', id: s.punches.find((p) => L.dayKey(p.in) === '2026-11-10').id, reason: 'Nope' }), L.UserError, /approved payroll run/);
  bad(() => op(s, 'manager', { type: 'addTips', date: '2026-11-10', cash: 100, card: 0 }), L.UserError, /approved payroll run/);
  E(s, emp.employeeId).rate = 99999; assert.equal(JSON.stringify(run.lines), snap, 'approved lines do not change when a rate changes');
  bad(() => op(s, pay, { type: 'markPaid', runId: run.id, method: 'cash', date: '2026-11-08' }), L.UserError, /after the period/);
  bad(() => op(s, pay, { type: 'markPaid', runId: run.id, method: 'barter', date: '2026-11-25' }), L.UserError);
  op(s, pay, { type: 'markPaid', runId: run.id, method: 'bank', date: '2026-11-25' }); assert.equal(run.status, 'paid');
  bad(() => op(s, owner, { type: 'reopenRun', runId: run.id, reason: 'Oops oops' }), L.UserError, /not paid/);
  bad(() => op(s, owner, { type: 'deleteRun', runId: run.id }), L.UserError, /draft/);
});
test('payroll: open or unapproved timesheets and orphaned tips block approval; reopen and delete work on drafts', () => {
  const s = S(); const pay = 'payroll';
  const r = op(s, pay, { type: 'createRun', from: '2026-11-07', weeks: 1 }); const run = s.runs.find((x) => x.id === r.id);
  s.punches.find((p) => L.dayKey(p.in) === '2026-11-10').approved = false;
  assert.ok(L.runView(s, run).issues.some((i) => i.type === 'unapproved'));
  bad(() => op(s, 'owner', { type: 'approveRun', runId: run.id }), L.UserError, /issues/);
  op(s, 'manager', { type: 'approveTimesheet', from: '2026-11-10', to: '2026-11-10' });
  s.punches.push({ id: 'po', employeeId: 'e3', in: L.tsAt('2026-11-12', '11:00'), out: null, source: 'clock', breakMin: 0 });
  assert.ok(L.runView(s, run).issues.some((i) => i.type === 'open')); s.punches.pop();
  s.tips = s.tips.filter((t) => t.date !== '2026-11-11'); s.punches = s.punches.filter((p) => L.dayKey(p.in) !== '2026-11-11');
  s.tips.push({ id: 'tx', date: '2026-11-11', cash: 1000, card: 0 });
  assert.ok(L.runView(s, run).issues.some((i) => i.type === 'tips')); s.tips.pop();
  op(s, 'owner', { type: 'approveRun', runId: run.id });
  op(s, 'owner', { type: 'reopenRun', runId: run.id, reason: 'Missed a bonus' }); assert.equal(run.status, 'draft'); assert.equal(run.lines, null); assert.equal(run.reopened, 1);
  op(s, pay, { type: 'deleteRun', runId: run.id }); assert.equal(s.runs.length, 3);
});
test('settings: owner only, validated, not while a run is in draft, and they change the pay', () => {
  const s = S(); bad(() => op(s, 'manager', { type: 'updateSettings', otPercent: 150 }), L.PermError);
  bad(() => op(s, 'owner', { type: 'updateSettings', otPercent: 5 }), L.UserError); bad(() => op(s, 'owner', { type: 'updateSettings' }), L.UserError, /Nothing/);
  op(s, 'owner', { type: 'updateSettings', otPercent: 150, insurancePercent: 10 }); assert.equal(s.settings.otPercent, 150);
  op(s, 'payroll', { type: 'createRun', from: '2026-11-07', weeks: 1 }); bad(() => op(s, 'owner', { type: 'updateSettings', otPercent: 140 }), L.UserError, /draft/);
});

// ---------- roles, privacy, reports ----------
test('roles: who may do what', () => {
  const s = S(); const staff = byRole(s, 'staff'); const sh = s.shifts.find((x) => x.date > TODAY && !x.employeeId);
  for (const [role, o] of [['staff', { type: 'createShift', date: '2026-12-01', start: '11:00', end: '19:00', positionId: 'waiter' }], ['payroll', { type: 'createShift', date: '2026-12-01', start: '11:00', end: '19:00', positionId: 'waiter' }], ['staff', { type: 'publishWeek', week: '2026-11-28' }], ['payroll', { type: 'assignShift', shiftId: sh.id, employeeId: 'e3' }], ['staff', { type: 'setSales', date: TODAY, amount: 100 }], ['manager', { type: 'approveRun', runId: 'pr1' }], ['manager', { type: 'markPaid', runId: 'pr1', method: 'cash', date: TODAY }], ['staff', { type: 'addEmployee', name: 'Nope Nope', positionIds: ['cook'] }], ['payroll', { type: 'setActive', employeeId: 'e3', active: false, reason: 'Nope' }], ['staff', { type: 'logReminder', key: 'sh:abc' }], ['manager', { type: 'updateSettings', otPercent: 150 }]]) {
    bad(() => op(s, role, o), L.PermError, undefined);
  }
  assert.ok(staff.employeeId);
});
test('privacy: staff see no pay or other people\'s private data, managers see no pay, payroll sees pay', () => {
  const s = S(); const sv = (r) => L.view(s, byRole(s, r), NOW);
  const st = sv('staff'), mg = sv('manager'), pr = sv('payroll'), ow = sv('owner');
  assert.ok(st.employees.every((e) => e.rate === undefined && e.insured === undefined && e.phone === undefined || e.id === 'e3'));
  assert.ok(st.employees.find((e) => e.id === 'e3').avail !== undefined); assert.equal(st.employees.find((e) => e.id === 'e4').avail, undefined);
  assert.ok(st.shifts.every((x) => x.published)); assert.equal(st.runs, undefined); assert.equal(st.reports, undefined); assert.equal(st.audit, undefined); assert.equal(st.tips, undefined); assert.equal(st.sales, undefined);
  assert.ok(st.punches.every((p) => p.employeeId === 'e3')); assert.ok(st.timeOff.every((t) => t.employeeId === 'e3')); assert.ok(st.payslips.length >= 1 && st.payslips.every((p) => p.line.employeeId === 'e3'));
  assert.ok(!JSON.stringify(st).includes(E(s, 'e4').phone));
  assert.ok(mg.employees.every((e) => e.rate === undefined && e.insured === undefined) && mg.runs === undefined && mg.audit === undefined);
  assert.equal(mg.reports.weeks[0].cost, undefined); assert.equal(mg.reports.laborPct4, undefined);
  assert.ok(pr.employees[0].rate > 0 && pr.runs.length === 3 && pr.audit === undefined && pr.reminders === undefined);
  assert.ok(ow.audit.length > 0 && ow.reports.weeks[0].cost > 0 && ow.employees[0].rate > 0);
  assert.ok(st.swaps.every((w) => w.empId === 'e3' || w.toEmpId === 'e3' || (w.status === 'peer' && w.type === 'give')));
});
test('payslips: staff see only approved or paid runs', () => {
  const s = S(); const r = op(s, 'payroll', { type: 'createRun', from: '2026-11-07', weeks: 1 });
  const before = L.view(s, byRole(s, 'staff'), NOW).payslips.length; op(s, 'owner', { type: 'approveRun', runId: r.id });
  const after = L.view(s, byRole(s, 'staff'), NOW).payslips; assert.equal(after.length, before + 1); assert.equal(after[after.length - 1].status, 'approved');
});
test('reports: eight weeks of hours, overtime and labour cost against sales', () => {
  const s = S(); const r = L.reports(s, NOW, true);
  assert.equal(r.weeks.length, 8); assert.equal(r.weeks[7].week, '2026-11-21'); assert.ok(r.weeks.slice(0, 7).every((w) => w.hours > 40000 && w.cost > 0 && w.sales > 0));
  assert.ok(r.laborPct4 > 0.15 && r.laborPct4 < 0.4, 'labour is a believable share of sales: ' + r.laborPct4); assert.ok(r.weeks.some((w) => w.ot > 0));
  assert.ok(r.latePct > 0 && r.latePct < 0.3); assert.equal(r.posHours.length, 7); assert.ok(r.openNextWeek > 0); assert.equal(r.publishedNext, false);
  assert.equal(L.reports(s, NOW, false).weeks[0].cost, undefined);
});
test('reminders: tomorrow\'s shifts, forgotten clock-outs, health cards', () => {
  const s = S(); const r = L.reminders(s, NOW); const ty = (t) => r.filter((x) => x.type === t);
  assert.ok(ty('shift').length > 5 && ty('shift').every((x) => x.due === '2026-11-26')); assert.ok(ty('forgot').length >= 1);
  assert.deepEqual(ty('health').map((x) => x.employeeId).sort(), ['e22', 'e9']); assert.equal(ty('health').find((x) => x.employeeId === 'e22').severity, 'overdue');
  op(s, 'manager', { type: 'logReminder', key: 'hc:e9' }); assert.equal(L.reminders(s, NOW).find((x) => x.key === 'hc:e9').sent, TODAY);
  bad(() => op(s, 'manager', { type: 'logReminder', key: 'bad key!' }), L.UserError);
});
test('sales: managers enter recent days only', () => {
  const s = S(); op(s, 'manager', { type: 'setSales', date: '2026-11-24', amount: 2500000 }); assert.equal(s.sales['2026-11-24'], 2500000);
  bad(() => op(s, 'manager', { type: 'setSales', date: '2026-12-24', amount: 100 }), L.UserError); bad(() => op(s, 'manager', { type: 'setSales', date: '2026-11-24', amount: -5 }), L.UserError);
  bad(() => op(s, 'manager', { type: 'setSales', date: '2026-11-24', amount: 1.5 }), L.UserError);
});
test('safety: unknown actions, prototype names, hostile text kept as text, audit trail', () => {
  const s = S();
  for (const t of ['nope', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) bad(() => op(s, 'owner', { type: t }), L.UserError, /Unknown action/);
  bad(() => L.applyOp(s, null, { user: byRole(s, 'owner'), now: NOW }), L.UserError); bad(() => L.applyOp(s, 'x', { user: byRole(s, 'owner'), now: NOW }), L.UserError);
  const r = op(s, 'manager', { type: 'addEmployee', name: '<img src=x onerror=alert(1)>', nameAr: '=HYPERLINK("x")', positionIds: ['cook'] });
  assert.equal(E(s, r.id).name, '<img src=x onerror=alert(1)>'); assert.equal(L.csvCell(E(s, r.id).nameAr).includes("'=HYPERLINK"), true);
  assert.ok(s.audit[0].action === 'employee.add'); bad(() => op(s, 'manager', { type: 'logReminder', key: 'x'.repeat(50) }), L.UserError);
  bad(() => op(s, 'manager', { type: 'createShift', date: '2026-12-01', start: '11:00', end: '19:00', positionId: 'waiter', key: 'ab' }), L.UserError, /Bad request/);
  bad(() => op(s, 'manager', { type: 'createShift', date: '2026-12-01', start: '11:00', end: '19:00', positionId: 'waiter', key: { a: 1 } }), L.UserError);
});
test('all operations are covered by name', () => { assert.ok(L.OP_NAMES.length >= 40); assert.ok(L.OP_NAMES.includes('approveRun') && L.OP_NAMES.includes('clockIn')); });
