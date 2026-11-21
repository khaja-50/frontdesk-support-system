CREATE TABLE tickets (
  id BIGSERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('normal', 'high', 'urgent')) DEFAULT 'normal',
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'closed')) DEFAULT 'open',
  assignee_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  sla_due_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ
);
CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id),
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'internal')),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  ticket_id BIGINT NOT NULL REFERENCES tickets(id),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE holidays (date DATE PRIMARY KEY, label TEXT NOT NULL);
