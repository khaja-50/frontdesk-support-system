# Frontdesk

Frontdesk is a support-ticket workspace built for the Full Stack Developer assessment. It focuses on the operational risks in the brief: duplicate assignment, private internal notes leaking to customers, and weak evidence of agent responses.

## Run locally

Requires Node.js 22 or newer.

```bash
npm ci
npm test
npm start
```

Open <http://localhost:3000>. Tests and local development use Node's built-in SQLite driver so the app can be reviewed without a service account. Production uses PostgreSQL whenever `DATABASE_URL` is present.

## Business rules implemented

- SLA time is counted Monday-Friday, 09:30-18:30 UTC, with configurable holidays; urgent, high, and normal targets are 60, 240, and 480 working minutes.
- Assignment uses a transaction and conditional update so only one agent can claim an unassigned ticket.
- Internal notes are stored with explicit private visibility and are omitted from customer-facing ticket reads.
- Audit events are append-only and record actor, action, details, and timestamp.
- The API has a guarded reopen path for tickets closed within seven days.

## Honest completion note

This repository is a focused assessment implementation. The local workflow is complete and tested. The Render blueprint provisions a managed PostgreSQL database and injects its connection string as `DATABASE_URL`; the application creates its tables on startup. SQLite remains the zero-setup review path for local tests, while the production API uses PostgreSQL without changing the API contract.

## Login and roles

Production login uses a hashed password and an HTTP-only session cookie. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the hosting environment to bootstrap the first administrator. An administrator can create customer or agent accounts with `POST /api/users`; customers can see only their own tickets, while agents and administrators can work the full queue and add internal notes.

The sign-in page also provides a customer self-registration path for review. Admin and agent accounts remain controlled by the administrator. On a fresh hosted database, the app adds three demo tickets—open, waiting on customer, and closed—so reviewers can inspect each queue view immediately. Existing data is never overwritten.

For the assessment demo, use the temporary administrator email and password configured in Render under the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables. The sign-in page points reviewers here for setup guidance. Do not commit the actual password to this public repository; replace the temporary value after review if the deployment is reused.

## Verification after hosting

1. Open the deployed URL and confirm the dashboard loads.
2. Check `/health` returns `{"status":"ok","storage":"postgresql","persistent":true}`. If it reports SQLite, the Render service is still using its fallback and `DATABASE_URL` has not been linked yet.
3. Create a normal and urgent ticket and confirm their SLA due times differ.
4. Assign the same ticket from two agent sessions; only one assignment should succeed.
5. Add a public reply and an internal note; customer views and exports must show only the public reply.
6. Move a ticket to `waiting_customer`, close it, and verify the audit trail records each transition.

## Key routes

`GET /api/tickets`, `POST /api/tickets`, `GET /api/tickets/:id`, `POST /api/tickets/:id/assign`, `POST /api/tickets/:id/messages`, `POST /api/tickets/:id/status`, `POST /api/tickets/:id/reopen`, `GET /api/tickets/:id/audit`, `GET /api/tickets/:id/export`.

## Dashboard controls

Search matches ticket IDs, subjects, customer emails, and descriptions. Status, priority, and assignee filters combine with search; sorting supports recent activity, oldest, newest, and urgency. The default queue excludes closed tickets. Choose **All statuses** to include them, or use the sidebar's Closed tickets view. Clear filters returns to the default active queue.

The summary buttons count all tickets the signed-in user can access. Selecting a summary resets other filters so its result count matches the metric. Assignee options come from the returned tickets; the interface shows agent IDs because the existing API does not provide an agent directory. Ticket timestamps use the browser's local time.

The compact navigation drawer supports keyboard focus, Escape, Profile, and Sign out. Motion is reduced when the operating system requests it. Icons are bundled locally; their license is in `THIRD_PARTY_NOTICES.md`.

## Browser verification

```bash
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

The browser suite runs the real app and API with an isolated in-memory SQLite database and test-only accounts. It checks desktop (1440px), tablet (820px), and mobile (390px) layouts, filtering, sorting, keyboard access, login errors, registration, profile, sign-out, ticket creation, replies, notes, assignment, and status changes. Customer exports are checked for private-note leakage. Screenshots and failure traces are saved under `test-results/` and are not committed.

These local checks do not verify Render connectivity or PostgreSQL deployment configuration; use the hosted verification steps above for those. GitHub Actions runs both the unit checks and browser workflows on each push.
