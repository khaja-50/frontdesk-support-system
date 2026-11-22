import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { createSession, createUser, deleteSession, findUserByEmail, findUserBySession, ready, seedDemoTickets, updateUserPasswordHash } from './db.js';

const SESSION_DAYS = 7;
const hashToken = token => createHash('sha256').update(token).digest('hex');
const hashPassword = (password, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
function verifyPassword(password, stored) {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export const authReady = ready.then(async () => {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return;
  const admin = await findUserByEmail(process.env.ADMIN_EMAIL);
  if (!admin) {
    await createUser({ id: 'admin', email: process.env.ADMIN_EMAIL, passwordHash: hashPassword(process.env.ADMIN_PASSWORD), displayName: process.env.ADMIN_NAME || 'Administrator', role: 'admin' });
  } else if (admin.role === 'admin' && !verifyPassword(process.env.ADMIN_PASSWORD, admin.password_hash)) {
    await updateUserPasswordHash(admin.id, hashPassword(process.env.ADMIN_PASSWORD));
  }
}).then(async () => {
  if (process.env.NODE_ENV !== 'test' && process.env.ADMIN_EMAIL) {
    const admin = await findUserByEmail(process.env.ADMIN_EMAIL);
    if (admin) await seedDemoTickets(admin.id);
  }
});

export async function registerUser(input) {
  if (!input.email || !input.password || !input.display_name || !input.role) throw new Error('email, password, display_name, and role are required');
  if (typeof input.password !== 'string' || !/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,}$/.test(input.password)) throw new Error('password must be at least 6 characters with letters and numbers only');
  return createUser({ id: input.id || randomBytes(12).toString('hex'), email: input.email.trim().toLowerCase(), passwordHash: hashPassword(input.password), displayName: input.display_name.trim(), role: input.role });
}
export async function registerCustomer(input) { return registerUser({ ...input, role: 'customer' }); }
export async function login(email, password) {
  const user = await findUserByEmail(email.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) return null;
  const token = randomBytes(32).toString('hex');
  await createSession(hashToken(token), user.id, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString());
  return { token, user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role } };
}
export async function userFromToken(token) { return token ? findUserBySession(hashToken(token)) : null; }
export async function logout(token) { if (token) await deleteSession(hashToken(token)); }
export { hashPassword };
