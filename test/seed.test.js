import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveTicket, db, listTickets, seedDemoTickets } from '../src/db.js';

test('demo examples cover SA-1 through SA-10 and preserve archive history', async () => {
  await seedDemoTickets('admin');
  assert.deepEqual((await listTickets()).map(ticket => ticket.id).sort((a, b) => a - b), Array.from({ length: 10 }, (_, index) => index + 1));
  assert.equal(await archiveTicket(4, 'admin'), true);
  assert.equal(await archiveTicket(7, 'admin'), true);
  await seedDemoTickets('admin');
  const visible = await listTickets();
  assert.deepEqual(visible.map(ticket => ticket.id).sort((a, b) => a - b), Array.from({ length: 10 }, (_, index) => index + 1));
  assert.equal(visible.find(ticket => ticket.id === 4).subject, 'Two-factor code is not arriving');
  assert.equal(visible.find(ticket => ticket.id === 7).subject, 'Exported report has missing rows');
  assert.deepEqual(db.prepare('SELECT action FROM audit_events WHERE ticket_id=4 ORDER BY id').all().map(event => event.action).slice(-2), ['ticket.archived', 'ticket.demo_restored']);
  await seedDemoTickets('admin');
  assert.equal((await listTickets()).length, 10);
});
