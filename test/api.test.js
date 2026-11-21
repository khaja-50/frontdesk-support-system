import test from 'node:test';
import assert from 'node:assert/strict';
import { db, createTicket, addMessage, getTicket, assignTicket, updateStatus, closeInactiveTickets, reopenTicket } from '../src/db.js';

test.before(() => { db.exec('DELETE FROM audit_events; DELETE FROM messages; DELETE FROM tickets;'); });
test.after(() => db.close());
test('ticket workflow keeps internal notes out of customer responses', () => {
  const ticket = createTicket({subject:'Cannot sign in',customer_email:'a@example.com',description:'Help',priority:'urgent'}, 'tester');
  addMessage(ticket.id, {body:'Reset instructions',visibility:'public'}, 'agent');
  addMessage(ticket.id, {body:'Escalated to identity team',visibility:'internal'}, 'agent');
  const customerView = getTicket(ticket.id, false);
  assert.equal(customerView.messages.length, 1);
  assert.equal(customerView.messages[0].visibility, 'public');
  assert.equal(getTicket(ticket.id, true).messages.length, 2);
  assert.equal(getTicket(ticket.id, true).audit.length, 3);
});
test('only one assignment wins when two agents try the same ticket', () => {
  const ticket = createTicket({subject:'Printer down',customer_email:'b@example.com',description:'Office printer',priority:'normal'}, 'tester');
  const first = assignTicket(ticket.id, 'agent-a', 'agent-a');
  const second = assignTicket(ticket.id, 'agent-b', 'agent-b');
  assert.equal(first.assignee_id, 'agent-a');
  assert.equal(second, null);
});
test('ticket creation rejects incomplete or malformed customer data', () => {
  assert.throws(() => createTicket({subject:'',customer_email:'bad',description:''}), /subject is required/);
  assert.throws(() => createTicket({subject:'Login',customer_email:'bad',description:'Help'}), /customer_email must be valid/);
  assert.throws(() => createTicket({subject:'Login',customer_email:'a@example.com',description:'Help',priority:'critical'}), /priority is invalid/);
});
test('status transitions record waiting and closure in the audit trail', () => {
  const ticket = createTicket({subject:'Need a callback',customer_email:'c@example.com',description:'Please call',priority:'normal'}, 'tester');
  assert.equal(updateStatus(ticket.id, 'waiting_customer', 'agent').status, 'waiting_customer');
  assert.equal(updateStatus(ticket.id, 'closed', 'agent').status, 'closed');
  const saved = getTicket(ticket.id, true);
  assert.equal(saved.audit.at(-1).action, 'ticket.status_changed');
  assert.equal(JSON.parse(saved.audit.at(-1).details).to, 'closed');
});
test('inactivity closes a ticket after one working week', () => {
  const ticket = createTicket({subject:'Old request',customer_email:'d@example.com',description:'No response',priority:'normal'}, 'tester');
  db.prepare('UPDATE tickets SET updated_at=? WHERE id=?').run('2026-11-13T09:30:00.000Z', ticket.id);
  assert.equal(closeInactiveTickets('2026-11-23T09:30:00.000Z', 'system'), 1);
  assert.equal(getTicket(ticket.id, true).status, 'closed');
});
test('reopening is allowed within one working week only', () => {
  const ticket = createTicket({subject:'Reopen me',customer_email:'e@example.com',description:'Follow-up',priority:'normal'}, 'tester');
  db.prepare("UPDATE tickets SET status='closed',closed_at=? WHERE id=?").run('2026-11-20T17:30:00.000Z', ticket.id);
  assert.equal(reopenTicket(ticket.id, 'customer', '2026-11-23T10:30:00.000Z').status, 'open');
  db.prepare("UPDATE tickets SET status='closed',closed_at=? WHERE id=?").run('2026-11-09T09:30:00.000Z', ticket.id);
  assert.equal(reopenTicket(ticket.id, 'customer', '2026-11-23T09:30:00.000Z'), false);
});
