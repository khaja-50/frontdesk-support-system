import test from 'node:test';
import assert from 'node:assert/strict';
import { db, createTicket, addMessage, getTicket, assignTicket } from '../src/db.js';

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
