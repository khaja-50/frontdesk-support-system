import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { addWorkingMinutes } from './sla.js';

mkdirSync('data', { recursive: true });
export const db = new DatabaseSync(process.env.DB_FILE || 'data/frontdesk.sqlite');
db.exec(`PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, customer_email TEXT NOT NULL, description TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open', assignee_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sla_due_at TEXT NOT NULL, closed_at TEXT);
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tickets(id), author_id TEXT NOT NULL, body TEXT NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ('public','internal')), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tickets(id), actor_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS holidays (date TEXT PRIMARY KEY, label TEXT NOT NULL);`);

const now = () => new Date().toISOString();
const holidays = () => db.prepare('SELECT date FROM holidays').all().map(x => x.date);
const audit = (ticketId, actorId, action, details) => db.prepare('INSERT INTO audit_events(ticket_id,actor_id,action,details,created_at) VALUES(?,?,?,?,?)').run(ticketId, actorId, action, JSON.stringify(details), now());
function validateTicketInput(input) {
  const required = ['subject', 'customer_email', 'description'];
  for (const field of required) if (typeof input[field] !== 'string' || !input[field].trim()) throw new Error(`${field} is required`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.customer_email)) throw new Error('customer_email must be valid');
  if (input.priority && !['normal', 'high', 'urgent'].includes(input.priority)) throw new Error('priority is invalid');
}

export function listTickets() { return db.prepare('SELECT * FROM tickets ORDER BY updated_at DESC').all(); }
export function getTicket(id, includeInternal = false) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(id);
  if (!ticket) return null;
  ticket.messages = db.prepare(`SELECT id,author_id,body,visibility,created_at FROM messages WHERE ticket_id=? ${includeInternal ? '' : "AND visibility='public'"} ORDER BY created_at`).all(id);
  ticket.audit = db.prepare('SELECT id,actor_id,action,details,created_at FROM audit_events WHERE ticket_id=? ORDER BY id').all(id);
  return ticket;
}
export function createTicket(input, actorId='customer') {
  validateTicketInput(input);
  const created = now();
  const due = addWorkingMinutes(created, input.priority === 'urgent' ? 60 : input.priority === 'high' ? 240 : 480, holidays());
  const result = db.prepare('INSERT INTO tickets(subject,customer_email,description,priority,status,created_at,updated_at,sla_due_at) VALUES(?,?,?,?,?,?,?,?)').run(input.subject, input.customer_email, input.description, input.priority || 'normal', 'open', created, created, due);
  audit(Number(result.lastInsertRowid), actorId, 'ticket.created', { subject: input.subject });
  return getTicket(Number(result.lastInsertRowid), true);
}
export function assignTicket(id, assigneeId, actorId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare("UPDATE tickets SET assignee_id=?,updated_at=? WHERE id=? AND assignee_id IS NULL AND status IN ('open','in_progress')").run(assigneeId, now(), id);
    if (result.changes !== 1) { db.exec('ROLLBACK'); return null; }
    audit(id, actorId, 'ticket.assigned', { assigneeId }); db.exec('COMMIT'); return getTicket(id, true);
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}
export function addMessage(id, input, actorId) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(id); if (!ticket) return null;
  const created = now();
  db.prepare('INSERT INTO messages(ticket_id,author_id,body,visibility,created_at) VALUES(?,?,?,?,?)').run(id, actorId, input.body, input.visibility === 'internal' ? 'internal' : 'public', created);
  db.prepare("UPDATE tickets SET status=CASE WHEN status='open' THEN 'in_progress' ELSE status END,updated_at=? WHERE id=?").run(created, id);
  audit(id, actorId, input.visibility === 'internal' ? 'note.added' : 'reply.sent', { visibility: input.visibility || 'public' });
  return getTicket(id, true);
}
export function updateStatus(id, status, actorId) {
  if (!['open', 'in_progress', 'waiting_customer', 'closed'].includes(status)) throw new Error('status is invalid');
  const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(id); if (!ticket) return null;
  const closedAt = status === 'closed' ? now() : null;
  db.prepare('UPDATE tickets SET status=?,closed_at=?,updated_at=? WHERE id=?').run(status, closedAt, now(), id);
  audit(id, actorId, 'ticket.status_changed', { from: ticket.status, to: status });
  return getTicket(id, true);
}
export function reopenTicket(id, actorId) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id=?').get(id); if (!ticket) return null;
  if (ticket.status !== 'closed') return getTicket(id, true);
  if ((Date.now() - Date.parse(ticket.closed_at)) > 7 * 24 * 60 * 60 * 1000) return false;
  db.prepare("UPDATE tickets SET status='open',closed_at=NULL,updated_at=? WHERE id=?").run(now(), id); audit(id, actorId, 'ticket.reopened', {}); return getTicket(id, true);
}
