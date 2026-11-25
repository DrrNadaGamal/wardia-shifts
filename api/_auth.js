import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

// Demo sign-in: a PIN gives a signed token that names the user and expires after 12 hours.
// The PINs are public on the sign-in screen, so this is a demo of role separation, not real security.
const secret = () => createHash('sha256').update('wardia-v1:' + (process.env.WARDIA_SECRET || 'local-dev-only')).digest();
const mac = (s) => createHmac('sha256', secret()).update(s).digest('base64url');
export const TOKEN_TTL_MS = 12 * 3600 * 1000;

export function signToken(userId, now = Date.now()) {
  const body = `${userId}.${now + TOKEN_TTL_MS}`;
  return `${Buffer.from(body).toString('base64url')}.${mac(body)}`;
}
export function readToken(token, users, now = Date.now()) {
  try {
    const [b, sig] = String(token || '').split('.');
    const body = Buffer.from(b, 'base64url').toString();
    const a = Buffer.from(mac(body)), c = Buffer.from(sig || '');
    if (a.length !== c.length || !timingSafeEqual(a, c)) return null;
    const [id, exp] = body.split('.');
    if (Number(exp) < now) return null;
    const u = users.find((x) => x.id === id);
    return u ? { id: u.id, name: u.name, nameAr: u.nameAr, role: u.role, employeeId: u.employeeId || null } : null;
  } catch { return null; }
}
