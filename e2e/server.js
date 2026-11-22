// Isolated browser fixtures: always use an in-memory database, never deployment data.
process.env.NODE_ENV = 'test';
process.env.DB_FILE = ':memory:';
process.env.ADMIN_EMAIL = 'khawajarizwanali123@gmail.com';
process.env.ADMIN_PASSWORD = '1234';
process.env.ADMIN_NAME = 'Test reviewer';
const { createServer } = await import('node:http');
const { app } = await import('../src/server.js');
const { authReady } = await import('../src/auth.js');
const { createTicket, updateStatus, assignTicket, addMessage } = await import('../src/db.js');
await authReady;
const fixtures = [
  ['Unable to download monthly invoice', 'maya@example.test', 'The invoice download stops before the PDF is ready.', 'high', 'waiting_customer'],
  ['Update billing contact', 'rohan@example.test', 'Please update the contact receiving our billing emails.', 'normal', 'closed'],
  ['Login alert after password reset', 'leena@example.test', 'An unexpected sign-in alert appeared after resetting my password.', 'urgent', 'open'],
  ['Payment receipt needs correction', 'nora@example.test', 'The company name on the payment receipt needs to be corrected.', 'normal', 'in_progress'],
  ['Export includes a longer customer reference than expected', 'customer.with.a.very.long.email.address@example.test', 'Please check the reference field in the exported report for our account.', 'normal', 'open'],
];
for (const [subject, customer_email, description, priority, status] of fixtures) {
  const ticket = await createTicket({ subject, customer_email, description, priority }, 'admin');
  if (status === 'in_progress') await assignTicket(ticket.id, 'admin', 'admin');
  if (status !== 'open') await updateStatus(ticket.id, status, 'admin');
  if (status === 'closed') await addMessage(ticket.id, { body: 'The billing contact has been updated.', visibility: 'public' }, 'admin');
}
createServer(app).listen(4175, '127.0.0.1');
