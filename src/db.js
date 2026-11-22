import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import { addWorkingMinutes, workingMinutesBetween } from './sla.js';

const usePostgres = Boolean(process.env.DATABASE_URL) && process.env.NODE_ENV !== 'test';
export const storage = usePostgres ? 'postgresql' : 'sqlite';
const schema = `
CREATE TABLE IF NOT EXISTS tickets (id BIGSERIAL PRIMARY KEY, subject TEXT NOT NULL, customer_email TEXT NOT NULL, description TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open', assignee_id TEXT, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL, sla_due_at TIMESTAMPTZ NOT NULL, closed_at TIMESTAMPTZ, archived_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS messages (id BIGSERIAL PRIMARY KEY, ticket_id BIGINT NOT NULL REFERENCES tickets(id), author_id TEXT NOT NULL, body TEXT NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ('public','internal')), created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (id BIGSERIAL PRIMARY KEY, ticket_id BIGINT NOT NULL REFERENCES tickets(id), actor_id TEXT NOT NULL, action TEXT NOT NULL, details JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS holidays (date DATE PRIMARY KEY, label TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('customer','agent','admin')), created_at TIMESTAMPTZ NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL);`;

export const db = usePostgres ? null : (() => {
  mkdirSync('data', { recursive: true });
  const sqlite = new DatabaseSync(process.env.DB_FILE || 'data/frontdesk.sqlite');
  sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, customer_email TEXT NOT NULL, description TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL DEFAULT 'open', assignee_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sla_due_at TEXT NOT NULL, closed_at TEXT, archived_at TEXT);
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tickets(id), author_id TEXT NOT NULL, body TEXT NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ('public','internal')), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL REFERENCES tickets(id), actor_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS holidays (date TEXT PRIMARY KEY, label TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('customer','agent','admin')), created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL);`);
  return sqlite;
})();

if (db && !db.prepare("PRAGMA table_info(tickets)").all().some(column => column.name === 'archived_at')) db.exec('ALTER TABLE tickets ADD COLUMN archived_at TEXT');

const pool = usePostgres ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined }) : null;
export const ready = usePostgres ? pool.query(schema).then(() => pool.query('ALTER TABLE tickets ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ')) : Promise.resolve();
const now = () => new Date().toISOString();
const sqliteHolidays = () => db.prepare('SELECT date FROM holidays').all().map(x => x.date);
async function pgQuery(text, values = []) { await ready; return pool.query(text, values); }
async function holidays() { return usePostgres ? (await pgQuery('SELECT date::text FROM holidays')).rows.map(x => x.date) : sqliteHolidays(); }
function validateTicketInput(input) {
  for (const field of ['subject', 'customer_email', 'description']) if (typeof input[field] !== 'string' || !input[field].trim()) throw new Error(`${field} is required`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.customer_email)) throw new Error('customer_email must be valid');
  if (input.priority && !['normal', 'high', 'urgent'].includes(input.priority)) throw new Error('priority is invalid');
}
function sqliteAudit(ticketId, actorId, action, details) { return db.prepare('INSERT INTO audit_events(ticket_id,actor_id,action,details,created_at) VALUES(?,?,?,?,?)').run(ticketId, actorId, action, JSON.stringify(details), now()); }
async function pgAudit(ticketId, actorId, action, details) { await pgQuery('INSERT INTO audit_events(ticket_id,actor_id,action,details,created_at) VALUES($1,$2,$3,$4,$5)', [ticketId, actorId, action, details, now()]); }

export async function listTickets(customerEmail = null) {
  if (usePostgres) return customerEmail ? (await pgQuery('SELECT * FROM tickets WHERE archived_at IS NULL AND lower(customer_email)=lower($1) ORDER BY updated_at DESC', [customerEmail])).rows : (await pgQuery('SELECT * FROM tickets WHERE archived_at IS NULL ORDER BY updated_at DESC')).rows;
  return customerEmail ? db.prepare('SELECT * FROM tickets WHERE archived_at IS NULL AND lower(customer_email)=lower(?) ORDER BY updated_at DESC').all(customerEmail) : db.prepare('SELECT * FROM tickets WHERE archived_at IS NULL ORDER BY updated_at DESC').all();
}
export async function ticketCount() {
  return usePostgres ? Number((await pgQuery('SELECT COUNT(*)::int AS count FROM tickets WHERE archived_at IS NULL')).rows[0].count) : db.prepare('SELECT COUNT(*) AS count FROM tickets WHERE archived_at IS NULL').get().count;
}
async function ticketSubjectExists(subject) {
  return usePostgres ? (await pgQuery('SELECT 1 FROM tickets WHERE subject=$1 LIMIT 1', [subject])).rowCount > 0 : Boolean(db.prepare('SELECT 1 FROM tickets WHERE subject=? LIMIT 1').get(subject));
}
export async function findUserByEmail(email) {
  if (usePostgres) return (await pgQuery('SELECT id,email,password_hash,display_name,role FROM users WHERE lower(email)=lower($1)', [email])).rows[0] || null;
  return db.prepare('SELECT id,email,password_hash,display_name,role FROM users WHERE lower(email)=lower(?)').get(email) || null;
}
export async function createUser({ id, email, passwordHash, displayName, role }) {
  if (!['customer', 'agent', 'admin'].includes(role)) throw new Error('role is invalid');
  if (usePostgres) return (await pgQuery('INSERT INTO users(id,email,password_hash,display_name,role,created_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,email,display_name,role', [id, email, passwordHash, displayName, role, now()])).rows[0];
  return db.prepare('INSERT INTO users(id,email,password_hash,display_name,role,created_at) VALUES(?,?,?,?,?,?)').run(id, email, passwordHash, displayName, role, now());
}
export async function createSession(tokenHash, userId, expiresAt) {
  if (usePostgres) await pgQuery('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [tokenHash, userId, expiresAt]);
  else db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash, userId, expiresAt);
}
export async function findUserBySession(tokenHash) {
  if (usePostgres) return (await pgQuery('SELECT u.id,u.email,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > NOW()', [tokenHash])).rows[0] || null;
  return db.prepare("SELECT u.id,u.email,u.display_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')").get(tokenHash) || null;
}
export async function deleteSession(tokenHash) {
  if (usePostgres) await pgQuery('DELETE FROM sessions WHERE token_hash=$1', [tokenHash]);
  else db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
}
export async function getTicket(id, includeInternal = false) {
  if (usePostgres) {
    const ticket = (await pgQuery('SELECT * FROM tickets WHERE id=$1 AND archived_at IS NULL', [id])).rows[0]; if (!ticket) return null;
    const messages = await pgQuery(`SELECT id,author_id,body,visibility,created_at FROM messages WHERE ticket_id=$1 ${includeInternal ? '' : "AND visibility='public'"} ORDER BY created_at`, [id]);
    const audit = await pgQuery('SELECT id,actor_id,action,details,created_at FROM audit_events WHERE ticket_id=$1 ORDER BY id', [id]);
    return { ...ticket, messages: messages.rows, audit: audit.rows };
  }
  const ticket = db.prepare('SELECT * FROM tickets WHERE id=? AND archived_at IS NULL').get(id); if (!ticket) return null;
  ticket.messages = db.prepare(`SELECT id,author_id,body,visibility,created_at FROM messages WHERE ticket_id=? ${includeInternal ? '' : "AND visibility='public'"} ORDER BY created_at`).all(id);
  ticket.audit = db.prepare('SELECT id,actor_id,action,details,created_at FROM audit_events WHERE ticket_id=? ORDER BY id').all(id); return ticket;
}
export async function customerExport(id) {
  if (usePostgres) { const ticket = (await pgQuery('SELECT id,subject,customer_email,description,priority,status,created_at,updated_at,sla_due_at FROM tickets WHERE id=$1', [id])).rows[0]; if (!ticket) return null; ticket.messages = (await pgQuery("SELECT author_id,body,created_at FROM messages WHERE ticket_id=$1 AND visibility='public' ORDER BY created_at", [id])).rows; return ticket; }
  const ticket = db.prepare('SELECT id,subject,customer_email,description,priority,status,created_at,updated_at,sla_due_at FROM tickets WHERE id=?').get(id); if (!ticket) return null; ticket.messages = db.prepare("SELECT author_id,body,created_at FROM messages WHERE ticket_id=? AND visibility='public' ORDER BY created_at").all(id); return ticket;
}
export async function createTicket(input, actorId = 'customer') {
  validateTicketInput(input); const created = now(); const due = addWorkingMinutes(created, input.priority === 'urgent' ? 60 : input.priority === 'high' ? 240 : 480, await holidays());
  if (usePostgres) { const id = (await pgQuery('INSERT INTO tickets(subject,customer_email,description,priority,status,created_at,updated_at,sla_due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [input.subject, input.customer_email, input.description, input.priority || 'normal', 'open', created, created, due])).rows[0].id; await pgAudit(id, actorId, 'ticket.created', { subject: input.subject }); return getTicket(id, true); }
  const result = db.prepare('INSERT INTO tickets(subject,customer_email,description,priority,status,created_at,updated_at,sla_due_at) VALUES(?,?,?,?,?,?,?,?)').run(input.subject, input.customer_email, input.description, input.priority || 'normal', 'open', created, created, due); sqliteAudit(Number(result.lastInsertRowid), actorId, 'ticket.created', { subject: input.subject }); return getTicket(Number(result.lastInsertRowid), true);
}
export async function assignTicket(id, assigneeId, actorId) {
  if (usePostgres) { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await client.query("UPDATE tickets SET assignee_id=$1,updated_at=$2 WHERE id=$3 AND assignee_id IS NULL AND status IN ('open','in_progress') RETURNING id", [assigneeId, now(), id]); if (result.rowCount !== 1) { await client.query('ROLLBACK'); return null; } await client.query('INSERT INTO audit_events(ticket_id,actor_id,action,details,created_at) VALUES($1,$2,$3,$4,$5)', [id, actorId, 'ticket.assigned', { assigneeId }, now()]); await client.query('COMMIT'); return getTicket(id, true); } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
  db.exec('BEGIN IMMEDIATE'); try { const result = db.prepare("UPDATE tickets SET assignee_id=?,updated_at=? WHERE id=? AND assignee_id IS NULL AND status IN ('open','in_progress')").run(assigneeId, now(), id); if (result.changes !== 1) { db.exec('ROLLBACK'); return null; } sqliteAudit(id, actorId, 'ticket.assigned', { assigneeId }); db.exec('COMMIT'); return getTicket(id, true); } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export async function addMessage(id, input, actorId) {
  const ticket = usePostgres ? (await pgQuery('SELECT * FROM tickets WHERE id=$1', [id])).rows[0] : db.prepare('SELECT * FROM tickets WHERE id=?').get(id); if (!ticket) return null; const created = now(); const visibility = input.visibility === 'internal' ? 'internal' : 'public';
  if (usePostgres) { await pgQuery('INSERT INTO messages(ticket_id,author_id,body,visibility,created_at) VALUES($1,$2,$3,$4,$5)', [id, actorId, input.body, visibility, created]); await pgQuery("UPDATE tickets SET status=CASE WHEN status='open' THEN 'in_progress' ELSE status END,updated_at=$1 WHERE id=$2", [created, id]); await pgAudit(id, actorId, visibility === 'internal' ? 'note.added' : 'reply.sent', { visibility }); }
  else { db.prepare('INSERT INTO messages(ticket_id,author_id,body,visibility,created_at) VALUES(?,?,?,?,?)').run(id, actorId, input.body, visibility, created); db.prepare("UPDATE tickets SET status=CASE WHEN status='open' THEN 'in_progress' ELSE status END,updated_at=? WHERE id=?").run(created, id); sqliteAudit(id, actorId, visibility === 'internal' ? 'note.added' : 'reply.sent', { visibility }); }
  return getTicket(id, true);
}
export async function updateStatus(id, status, actorId) {
  if (!['open', 'in_progress', 'waiting_customer', 'closed'].includes(status)) throw new Error('status is invalid'); const ticket = usePostgres ? (await pgQuery('SELECT * FROM tickets WHERE id=$1', [id])).rows[0] : db.prepare('SELECT * FROM tickets WHERE id=?').get(id); if (!ticket) return null; const closedAt = status === 'closed' ? now() : null; const updated = now();
  if (usePostgres) { await pgQuery('UPDATE tickets SET status=$1,closed_at=$2,updated_at=$3 WHERE id=$4', [status, closedAt, updated, id]); await pgAudit(id, actorId, 'ticket.status_changed', { from: ticket.status, to: status }); } else { db.prepare('UPDATE tickets SET status=?,closed_at=?,updated_at=? WHERE id=?').run(status, closedAt, updated, id); sqliteAudit(id, actorId, 'ticket.status_changed', { from: ticket.status, to: status }); } return getTicket(id, true);
}
export async function closeInactiveTickets(asOf = now(), actorId = 'system') { const candidates = usePostgres ? (await pgQuery("SELECT id,updated_at FROM tickets WHERE archived_at IS NULL AND status IN ('open','in_progress','waiting_customer')")).rows : db.prepare("SELECT id,updated_at FROM tickets WHERE archived_at IS NULL AND status IN ('open','in_progress','waiting_customer')").all(); let closed = 0; for (const ticket of candidates) if (workingMinutesBetween(ticket.updated_at, asOf, await holidays()) >= 5 * 540) { await updateStatus(ticket.id, 'closed', actorId); closed += 1; } return closed; }
export async function reopenTicket(id, actorId, asOf = now()) { const ticket = usePostgres ? (await pgQuery('SELECT * FROM tickets WHERE id=$1', [id])).rows[0] : db.prepare('SELECT * FROM tickets WHERE id=?').get(id); if (!ticket) return null; if (ticket.status !== 'closed') return getTicket(id, true); if (workingMinutesBetween(ticket.closed_at, asOf, await holidays()) > 5 * 540) return false; const updated = now(); if (usePostgres) { await pgQuery("UPDATE tickets SET status='open',closed_at=NULL,updated_at=$1 WHERE id=$2", [updated, id]); await pgAudit(id, actorId, 'ticket.reopened', {}); } else { db.prepare("UPDATE tickets SET status='open',closed_at=NULL,updated_at=? WHERE id=?").run(updated, id); sqliteAudit(id, actorId, 'ticket.reopened', {}); } return getTicket(id, true); }
export async function seedDemoTickets(actorId) {
  const samples = [
    { subject: 'Unable to download monthly invoice', customer_email: 'maya.demo@example.com', description: 'The invoice link opens, but the PDF download never starts.', priority: 'high', status: 'waiting_customer', message: 'Could you confirm which browser and device you are using?' },
    { subject: 'Update billing contact', customer_email: 'rohan.demo@example.com', description: 'Please update the billing contact for the Northstar workspace.', priority: 'normal', status: 'closed', message: 'The billing contact was updated and the request is now complete.' },
    { subject: 'Login alert after password reset', customer_email: 'leena.demo@example.com', description: 'A customer needs help understanding a sign-in alert after resetting a password.', priority: 'urgent', status: 'open', message: null },
    { subject: 'Payment receipt needs correction', customer_email: 'nora.demo@example.com', description: 'The customer needs a corrected receipt for the latest payment.', priority: 'normal', status: 'in_progress', message: 'We are checking the payment record and will reply shortly.' },
    { subject: 'Change notification preferences', customer_email: 'sam.demo@example.com', description: 'The customer wants to stop receiving weekly account summaries.', priority: 'high', status: 'closed', message: 'Notification preferences were updated successfully.' }
  ];
  let created = false;
  for (const sample of samples) {
    if (await ticketSubjectExists(sample.subject)) continue;
    const ticket = await createTicket(sample, actorId);
    if (sample.message) await addMessage(ticket.id, { body: sample.message, visibility: 'public' }, actorId);
    await updateStatus(ticket.id, sample.status, actorId);
    created = true;
  }
  return created;
}

export async function archiveTicket(id, actorId) {
  const archivedAt = now();
  if (usePostgres) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('UPDATE tickets SET archived_at=$1 WHERE id=$2 AND archived_at IS NULL RETURNING id', [archivedAt, id]);
      if (result.rowCount !== 1) { await client.query('ROLLBACK'); return false; }
      await client.query('INSERT INTO audit_events(ticket_id,actor_id,action,details,created_at) VALUES($1,$2,$3,$4,$5)', [id, actorId, 'ticket.archived', {}, archivedAt]);
      await client.query('COMMIT');
      return true;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare('UPDATE tickets SET archived_at=? WHERE id=? AND archived_at IS NULL').run(archivedAt, id);
    if (result.changes !== 1) { db.exec('ROLLBACK'); return false; }
    sqliteAudit(id, actorId, 'ticket.archived', {});
    db.exec('COMMIT');
    return true;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
