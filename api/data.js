import { applyOp, seed, view, normalize, UserError, PermError, ROLES } from '../public/logic.js';
import { signToken, readToken } from './_auth.js';

// One shared demo company kept in the memory of the running server instance. It is rebuilt from the seed every 6 hours
// and whenever the instance restarts. There is no database (see README, "Honest limits").
const RESET_MS = 6 * 60 * 60 * 1000;
let mem = null;
export const store = {
  async load(now) { if (!mem || now - mem.resetAt > RESET_MS) mem = seed(now); return mem; },
  async save(s) { mem = s; },
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const now = Date.now();
    const state = await store.load(now);
    const auth = String(req.headers.authorization || '').replace(/^Bearer /, '');
    if (req.method === 'POST') {
      let body;
      try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}; }
      catch (e) { return res.status(400).json({ error: 'Bad JSON' }); }
      if (JSON.stringify(body).length > 20000) return res.status(413).json({ error: 'Too large' });
      const op = body.op || {};
      if (op.type === 'login') {
        const u = typeof op.pin === 'string' ? state.users.find((x) => x.pin === op.pin) : null;
        if (!u) return res.status(401).json({ error: 'Wrong PIN' });
        return res.status(200).json({ token: signToken(u.id, now), me: { id: u.id, name: u.name, nameAr: u.nameAr, role: u.role, employeeId: u.employeeId || null } });
      }
      const user = readToken(auth, state.users, now);
      if (!user) return res.status(401).json({ error: 'Sign in again' });
      if (op.type === 'reset') {
        if (user.role !== ROLES.owner) return res.status(403).json({ error: 'You do not have permission to do this' });
        const fresh = seed(now); await store.save(fresh);
        return res.status(200).json({ ...view(fresh, user, now), result: {} });
      }
      normalize(state, now);
      const result = applyOp(state, op, { user: user, now });
      await store.save(state);
      return res.status(200).json({ ...view(state, user, now), result });
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const user = readToken(auth, state.users, now);
    if (!user) return res.status(401).json({ error: 'Sign in again' });
    normalize(state, now); await store.save(state);
    return res.status(200).json(view(state, user, now));
  } catch (e) {
    if (e instanceof SyntaxError) return res.status(400).json({ error: 'Bad request' });
    if (e instanceof PermError) return res.status(403).json({ error: e.message });
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    return res.status(500).json({ error: 'Server error' });
  }
}
