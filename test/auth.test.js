import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, ready } from '../src/db.js';
import { authReady, login, registerUser, userFromToken } from '../src/auth.js';

test.before(async () => { await Promise.all([ready, authReady]); db.exec('DELETE FROM sessions; DELETE FROM users;'); });
test.after(() => db.close());

test('password login returns a session and role without exposing the password hash', async () => {
  await registerUser({ id: 'agent-1', email: 'agent@example.com', password: 'correct horse battery staple', display_name: 'Support Agent', role: 'agent' });
  assert.equal(await login('agent@example.com', 'wrong password'), null);
  const session = await login('agent@example.com', 'correct horse battery staple');
  assert.equal(session.user.role, 'agent');
  assert.equal('password_hash' in session.user, false);
  assert.equal((await userFromToken(session.token)).email, 'agent@example.com');
});

test('user registration requires a strong password and approved role', async () => {
  await assert.rejects(() => registerUser({ email: 'short@example.com', password: 'short', display_name: 'Short', role: 'customer' }), /at least 10/);
  await assert.rejects(() => registerUser({ email: 'bad@example.com', password: 'long enough password', display_name: 'Bad', role: 'owner' }), /role is invalid/);
});

test('administrator password follows the configured value after restart', () => {
  const temp = mkdtempSync(join(tmpdir(), 'frontdesk-auth-'));
  const file = join(temp, 'frontdesk.sqlite');
  const script = `import { authReady, login } from './src/auth.js';
    await authReady;
    const current = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
    if (!current || current.user.role !== 'admin') process.exit(1);
    if (process.env.OLD_PASSWORD && await login(process.env.ADMIN_EMAIL, process.env.OLD_PASSWORD)) process.exit(2);`;
  const env = { ...process.env, NODE_ENV: 'test', DB_FILE: file, ADMIN_EMAIL: 'demo@example.test' };
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...env, ADMIN_PASSWORD: 'initial-demo-password' } });
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...env, ADMIN_PASSWORD: '1234', OLD_PASSWORD: 'initial-demo-password' } });
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
