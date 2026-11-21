import test from 'node:test';
import assert from 'node:assert/strict';
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
