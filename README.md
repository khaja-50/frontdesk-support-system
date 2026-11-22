# Frontdesk

A small support workspace for keeping customer requests in one place. Customers can open tickets and follow their own conversations. Support staff can pick up tickets, reply, leave private notes, and track what happened from start to finish.

**Live app:** [frontdesk-support-system.onrender.com](https://frontdesk-support-system.onrender.com/)

## Take a look

The sign-in page shows the demo administrator login. You can also create a customer account from there. The workspace includes ten example tickets, SA-1 through SA-10, so the open, waiting, in-progress, and closed views have something to explore.

Open a ticket to see its conversation and activity timeline. Try changing its status or assigning it to an agent. The summary cards and filters help narrow the queue; **All statuses** shows closed tickets too.

## Run it locally

Use Node.js 22 or newer:

```bash
npm ci
npm start
```

Then open [localhost:3000](http://localhost:3000). Local development uses SQLite, so you can run the app without setting up a database server. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to create an administrator account. Production uses PostgreSQL through `DATABASE_URL`.

## How the ticket rules work

- Response targets count working time, Monday to Friday from 09:30 to 18:30 UTC, excluding configured holidays. Urgent tickets have a 60-minute target, high-priority tickets 240 minutes, and normal tickets 480 minutes.
- A ticket can only be claimed by one agent. The assignment is checked inside a database transaction.
- Internal notes stay out of customer ticket views and exports. Public replies remain visible to the customer.
- Status changes, assignments, and messages leave an audit record with an actor and timestamp. Closed tickets can be reopened within the allowed working-week window.
- Customers see only their own tickets. Agents and administrators can work across the queue.

## Checks

```bash
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

The browser tests cover the main workflows at desktop, tablet, and mobile widths. GitHub Actions runs the checks on every push. To check the hosted database, open [the health endpoint](https://frontdesk-support-system.onrender.com/health); production should report `"storage":"postgresql"` and `"persistent":true`.

The Render service uses the configuration in `render.yaml`. The first start creates the tables and loads the demo tickets. The password shown on the sign-in page is for this public demo; change it and remove the hint before using the app with real customer information.
