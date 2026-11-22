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
  await registerUser({ id: 'agent-1', email: 'agent@example.com', password: 'Agent123', display_name: 'Support Agent', role: 'agent' });
  assert.equal(await login('agent@example.com', 'wrong password'), null);
  const session = await login('agent@example.com', 'Agent123');
  assert.equal(session.user.role, 'agent');
  assert.equal('password_hash' in session.user, false);
  assert.equal((await userFromToken(session.token)).email, 'agent@example.com');
});

test('registration accepts six-character alphanumeric passwords and approved roles', async () => {
  await assert.rejects(() => registerUser({ email: 'short@example.com', password: 'Ab123', display_name: 'Short', role: 'customer' }), /at least 6/);
  await assert.rejects(() => registerUser({ email: 'letters@example.com', password: 'abcdef', display_name: 'Letters', role: 'customer' }), /letters and numbers/);
  await assert.rejects(() => registerUser({ email: 'digits@example.com', password: '123456', display_name: 'Digits', role: 'customer' }), /letters and numbers/);
  await assert.rejects(() => registerUser({ email: 'symbols@example.com', password: 'Ab123!', display_name: 'Symbols', role: 'customer' }), /letters and numbers only/);
  await registerUser({ email: 'six@example.com', password: 'Ab1234', display_name: 'Six', role: 'customer' });
  assert.equal((await login('six@example.com', 'Ab1234')).user.role, 'customer');
  await assert.rejects(() => registerUser({ email: 'bad@example.com', password: 'Valid123', display_name: 'Bad', role: 'owner' }), /role is invalid/);
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
