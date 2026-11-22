import test from 'node:test';
import assert from 'node:assert/strict';
import { db, ready, createTicket, addMessage, getTicket, customerExport, assignTicket, updateStatus, closeInactiveTickets, reopenTicket, archiveTicket, listTickets } from '../src/db.js';

test.before(async () => { await ready; db.exec('DELETE FROM audit_events; DELETE FROM messages; DELETE FROM tickets;'); });
test.after(() => db.close());
test('ticket workflow keeps internal notes out of customer responses', async () => {
  const ticket = await createTicket({subject:'Cannot sign in',customer_email:'a@example.com',description:'Help',priority:'urgent'}, 'tester');
  await addMessage(ticket.id, {body:'Reset instructions',visibility:'public'}, 'agent');
  await addMessage(ticket.id, {body:'Escalated to identity team',visibility:'internal'}, 'agent');
  const customerView = await getTicket(ticket.id, false);
  assert.equal(customerView.messages.length, 1);
  assert.equal(customerView.messages[0].visibility, 'public');
  assert.equal((await getTicket(ticket.id, true)).messages.length, 2);
  assert.equal((await getTicket(ticket.id, true)).audit.length, 3);
});
test('only one assignment wins when two agents try the same ticket', async () => {
  const ticket = await createTicket({subject:'Printer down',customer_email:'b@example.com',description:'Office printer',priority:'normal'}, 'tester');
  const first = await assignTicket(ticket.id, 'agent-a', 'agent-a');
  const second = await assignTicket(ticket.id, 'agent-b', 'agent-b');
  assert.equal(first.assignee_id, 'agent-a');
  assert.equal(second, null);
});
test('ticket creation rejects incomplete or malformed customer data', async () => {
  await assert.rejects(() => createTicket({subject:'',customer_email:'bad',description:''}), /subject is required/);
  await assert.rejects(() => createTicket({subject:'Login',customer_email:'bad',description:'Help'}), /customer_email must be valid/);
  await assert.rejects(() => createTicket({subject:'Login',customer_email:'a@example.com',description:'Help',priority:'critical'}), /priority is invalid/);
});
test('status transitions record waiting and closure in the audit trail', async () => {
  const ticket = await createTicket({subject:'Need a callback',customer_email:'c@example.com',description:'Please call',priority:'normal'}, 'tester');
  assert.equal((await updateStatus(ticket.id, 'waiting_customer', 'agent')).status, 'waiting_customer');
  assert.equal((await updateStatus(ticket.id, 'closed', 'agent')).status, 'closed');
  const saved = await getTicket(ticket.id, true);
  assert.equal(saved.audit.at(-1).action, 'ticket.status_changed');
  assert.equal(JSON.parse(saved.audit.at(-1).details).to, 'closed');
});
test('inactivity closes a ticket after one working week', async () => {
  const ticket = await createTicket({subject:'Old request',customer_email:'d@example.com',description:'No response',priority:'normal'}, 'tester');
  db.prepare('UPDATE tickets SET updated_at=? WHERE id=?').run('2026-11-13T09:30:00.000Z', ticket.id);
  assert.equal(await closeInactiveTickets('2026-11-23T09:30:00.000Z', 'system'), 1);
  assert.equal((await getTicket(ticket.id, true)).status, 'closed');
});
test('reopening is allowed within one working week only', async () => {
  const ticket = await createTicket({subject:'Reopen me',customer_email:'e@example.com',description:'Follow-up',priority:'normal'}, 'tester');
  db.prepare("UPDATE tickets SET status='closed',closed_at=? WHERE id=?").run('2026-11-20T17:30:00.000Z', ticket.id);
  assert.equal((await reopenTicket(ticket.id, 'customer', '2026-11-23T10:30:00.000Z')).status, 'open');
  db.prepare("UPDATE tickets SET status='closed',closed_at=? WHERE id=?").run('2026-11-09T09:30:00.000Z', ticket.id);
  assert.equal(await reopenTicket(ticket.id, 'customer', '2026-11-23T09:30:00.000Z'), false);
});
test('customer export contains public conversation only', async () => {
  const ticket = await createTicket({subject:'Export me',customer_email:'f@example.com',description:'Question',priority:'normal'}, 'tester');
  await addMessage(ticket.id, {body:'Public answer',visibility:'public'}, 'agent');
  await addMessage(ticket.id, {body:'Private escalation',visibility:'internal'}, 'agent');
  const exported = await customerExport(ticket.id);
  assert.equal(exported.messages.length, 1);
  assert.equal(exported.messages[0].body, 'Public answer');
  assert.equal('audit' in exported, false);
});

test('archiving removes a ticket from the queue while preserving its audit record', async () => {
  const ticket = await createTicket({ subject: 'Temporary review ticket', customer_email: 'review@example.com', description: 'Archive after review', priority: 'normal' }, 'tester');
  assert.equal(await archiveTicket(ticket.id, 'admin'), true);
  assert.equal(await archiveTicket(ticket.id, 'admin'), false);
  assert.equal((await listTickets()).some(item => item.id === ticket.id), false);
  assert.equal(await getTicket(ticket.id, true), null);
  const events = db.prepare('SELECT action,actor_id FROM audit_events WHERE ticket_id=? ORDER BY id').all(ticket.id);
  assert.equal(events.at(-1).action, 'ticket.archived');
  assert.equal(events.at(-1).actor_id, 'admin');
});
