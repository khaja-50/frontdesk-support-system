# Frontdesk

Frontdesk is a support-ticket workspace built for the Full Stack Developer assessment. It focuses on the operational risks in the brief: duplicate assignment, private internal notes leaking to customers, and weak evidence of agent responses.

## Run locally

Requires Node.js 22 or newer.

```bash
npm test
npm start
```

Open <http://localhost:3000>. The local demo uses Node's built-in SQLite driver so the app can be reviewed without a service account. `DB_FILE` can point to a persistent database file.

## Business rules implemented

- SLA time is counted Monday-Friday, 09:30-18:30 UTC, with configurable holidays; urgent, high, and normal targets are 60, 240, and 480 working minutes.
- Assignment uses a transaction and conditional update so only one agent can claim an unassigned ticket.
- Internal notes are stored with explicit private visibility and are omitted from customer-facing ticket reads.
- Audit events are append-only and record actor, action, details, and timestamp.
- The API has a guarded reopen path for tickets closed within seven days.

## Honest completion note

This repository is a focused assessment implementation. The local workflow is complete and tested. Production deployment still requires wiring a managed PostgreSQL database and setting the platform's environment variables. The SQLite storage is intentionally the zero-setup review path; the schema is kept small so it can be ported to PostgreSQL without changing the API contract.

## Key routes

`GET /api/tickets`, `POST /api/tickets`, `GET /api/tickets/:id`, `POST /api/tickets/:id/assign`, `POST /api/tickets/:id/messages`, `POST /api/tickets/:id/reopen`, `GET /api/tickets/:id/audit`.
