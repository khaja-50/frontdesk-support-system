import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTickets, defaultFilters, ticketCounts } from '../public/queue.js';
const tickets = [
  { id: 1, subject: 'Invoice', customer_email: 'one@test.dev', description: 'Download blocked', priority: 'high', status: 'waiting_customer', assignee_id: null, created_at: '2026-11-01', updated_at: '2026-11-04' },
  { id: 2, subject: 'Access', customer_email: 'two@test.dev', priority: 'urgent', status: 'closed', assignee_id: 'admin', created_at: '2026-11-02', updated_at: '2026-11-03' },
  { id: 3, subject: 'Receipt', customer_email: 'three@test.dev', priority: 'normal', status: 'in_progress', assignee_id: 'admin', created_at: '2026-11-03', updated_at: '2026-11-05' },
];
const select = (changes) => selectTickets(tickets, { ...defaultFilters, ...changes }).map(t => t.id);
test('queue combines search, status, priority and assignee filters', () => {
  assert.deepEqual(select({}), [3, 1]);
  assert.deepEqual(select({ status: 'all', search: ' SA-2 ', priority: 'urgent', assignee: 'admin' }), [2]);
  assert.deepEqual(select({ search: 'blocked', assignee: 'unassigned' }), [1]);
  assert.deepEqual(select({ status: 'closed', assignee: 'unassigned' }), []);
});
test('sort uses original dates and urgency without mutating ticket data', () => {
  assert.deepEqual(select({ status: 'all', sort: 'oldest' }), [1, 2, 3]);
  assert.deepEqual(select({ status: 'all', sort: 'newest' }), [3, 2, 1]);
  assert.deepEqual(select({ status: 'all', sort: 'urgency' }), [2, 1, 3]);
  assert.deepEqual(tickets.map(t => t.id), [1, 2, 3]);
});
test('metrics count all accessible data, independently of list filters', () => {
  assert.deepEqual(ticketCounts(tickets), { open: 0, active: 1, urgent: 1 });
  assert.deepEqual(ticketCounts([]), { open: 0, active: 0, urgent: 0 });
});
