import { test, expect } from '@playwright/test';

const admin = { email: 'reviewer@example.test', password: 'Browser-check-only-123!' };
async function signIn(page) {
  await page.goto('/');
  await page.locator('#login-form [name="email"]').fill(admin.email);
  await page.locator('#login-form [name="password"]').fill(admin.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#tickets .card').first()).toBeVisible();
}
async function navigation(page) {
  if (await page.locator('#open-nav').isVisible()) await page.locator('#open-nav').click();
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('layout, sidebar controls and profile remain usable at every viewport', async ({ page }, testInfo) => {
  await signIn(page);
  await noOverflow(page);
  await expect(page.locator('.stat')).toHaveCount(3);
  const heading = await page.locator('.stat small').first().evaluate(el => getComputedStyle(el).fontWeight);
  const number = await page.locator('.stat strong').first().evaluate(el => getComputedStyle(el).fontWeight);
  expect(Number(heading)).toBeGreaterThan(Number(number));
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
  await navigation(page);
  await expect(page.getByText('09:30—18:30')).toBeVisible();
  const profileBox = await page.locator('#profile').boundingBox();
  const logoutBox = await page.locator('#logout').boundingBox();
  expect(profileBox.width).toBe(logoutBox.width);
  expect(profileBox.height).toBe(logoutBox.height);
  await page.locator('#profile').click();
  await expect(page.locator('#profile-email')).toHaveText(admin.email);
  await page.locator('#profile-dialog .close').click();
  await navigation(page);
  await page.locator('#logout').click();
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('Signed out successfully');
});

test('combined filters, accurate counts, sorting, no results and reset', async ({ page }) => {
  await signIn(page);
  await page.locator('#filter-status').selectOption('all');
  await page.locator('#filter-priority').selectOption('urgent');
  await expect(page.locator('.card .badge.urgent')).toHaveCount(await page.locator('.card').count());
  await page.locator('#filter-assignee').selectOption('unassigned');
  await expect(page.locator('.card').first()).toContainText('Unassigned');
  await page.locator('#search').fill('nothing-matches-this-search');
  await expect(page.getByText('No matching tickets')).toBeVisible();
  await page.locator('#clear-filters').click();
  await expect(page.locator('#search')).toHaveValue('');
  await page.locator('#filter-status').selectOption('all');
  await page.locator('#filter-sort').selectOption('oldest');
  const ids = await page.locator('.card').evaluateAll(cards => cards.map(card => Number(card.dataset.ticketId)));
  expect(ids).toEqual([...ids].sort((a,b) => a-b));
  await page.locator('#filter-sort').selectOption('newest');
  expect(await page.locator('.card').first().getAttribute('data-ticket-id')).toBe(String(Math.max(...ids)));
  await page.locator('#filter-sort').selectOption('urgency');
  await expect(page.locator('.card').first().locator('.badge.urgent')).toBeVisible();
  await page.locator('#filter-priority').selectOption('all');
  await page.locator('#filter-assignee').selectOption('admin');
  await expect(page.locator('.card').first()).toContainText('Agent admin');
  const count = await page.locator('.card').count();
  await expect(page.locator('#result-count')).toContainText(`${count} of`);
  await noOverflow(page);
});

test('metrics and sidebar navigate to matching tickets using real counts', async ({ page }) => {
  await signIn(page);
  const count = Number(await page.locator('[data-metric="urgent"] strong').textContent());
  await page.locator('[data-metric="urgent"]').click();
  await expect(page.locator('.card')).toHaveCount(count);
  await expect(page.locator('#filter-priority')).toHaveValue('urgent');
  await page.locator('[data-metric="active"]').click();
  await expect(page.locator('#filter-status')).toHaveValue('in_progress');
  await page.locator('[data-metric="open"]').click();
  await expect(page.locator('#filter-status')).toHaveValue('open');
  await navigation(page);
  await page.locator('[data-view="waiting"]').click();
  await expect(page.locator('#filter-status')).toHaveValue('waiting_customer');
  await expect(page.locator('.card').first().locator('.badge.waiting_customer')).toBeVisible();
  await navigation(page);
  await page.locator('[data-view="closed"]').click();
  await expect(page.locator('.card').first().locator('.badge.closed')).toBeVisible();
});

test('create, keyboard-open, reply, private note, assign and change status', async ({ page }, testInfo) => {
  await signIn(page);
  await page.locator('#new-ticket').click();
  await page.locator('#ticket-form .close').click();
  await expect(page.locator('#ticket-dialog')).not.toBeVisible();
  await page.locator('#new-ticket').click();
  const subject = `Workflow verification ${testInfo.project.name}`;
  await page.locator('#ticket-form [name="subject"]').fill(subject);
  await page.locator('#ticket-form [name="customer_email"]').fill('customer@example.test');
  await page.locator('#ticket-form [name="description"]').fill('Please check the payment reference on my receipt.');
  await page.locator('#ticket-form [name="priority"]').selectOption('high');
  await page.getByRole('button', { name: 'Create ticket', exact: true }).click();
  await expect(page.locator('#ticket-dialog')).not.toBeVisible();
  await expect(page.locator('#toast')).toContainText('created');
  await page.locator('#search').fill(subject);
  const card = page.locator('.card').filter({ hasText: subject });
  const ticketId = await card.getAttribute('data-ticket-id');
  await card.focus(); await card.press('Enter');
  await expect(page.locator('#detail-subject')).toHaveText(subject);
  await page.locator('#detail-body').fill('We are checking the receipt now.');
  await page.locator('#detail-send').click();
  await expect(page.locator('#detail-messages')).toContainText('We are checking');
  await page.locator('#detail-visibility').selectOption('internal');
  await page.locator('#detail-body').fill('Private finance escalation');
  await page.locator('#detail-send').click();
  await expect(page.locator('.message.internal')).toContainText('Private finance escalation');
  await page.locator('#detail-assignee').fill('admin');
  await page.locator('#detail-assign').click();
  await expect(page.locator('#toast')).toHaveText('Ticket assigned');
  await page.locator('#detail-status').selectOption('waiting_customer');
  await page.locator('#detail-status-save').click();
  await expect(page.locator('#detail-meta')).toContainText('WAITING ON CUSTOMER');
  await expect(page.locator('.timeline')).toContainText('Status changed');
  const exported = await (await page.request.get(`/api/tickets/${ticketId}/export`)).json();
  expect(JSON.stringify(exported)).not.toContain('Private finance escalation');
  await page.screenshot({ path: testInfo.outputPath('ticket-details.png'), fullPage: true });
  await page.locator('#ticket-detail-dialog .close').click();
  await page.reload();
  await page.locator('#search').fill(subject);
  await expect(page.locator('.card').filter({ hasText: subject })).toBeVisible();
  await noOverflow(page);
});

test('login errors are spaced and registration preserves customer access', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#login-form [name="email"]').fill(admin.email);
  await page.locator('#login-form [name="password"]').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#login-error')).toContainText('incorrect');
  const button = await page.locator('#login-form .primary').boundingBox();
  const error = await page.locator('#login-error').boundingBox();
  expect(error.y).toBeGreaterThanOrEqual(button.y + button.height + 12);
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
  await page.locator('#show-register').click();
  await page.locator('#register-form [name="display_name"]').fill('Browser customer');
  await page.locator('#register-form [name="email"]').fill(`customer-${testInfo.project.name}@example.test`);
  await page.locator('#register-form [name="password"]').fill('Customer-test-only-123!');
  await page.locator('#register-form [type="submit"]').click();
  await expect(page.locator('#app-shell')).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(0);
  await navigation(page);
  await page.locator('#profile').click();
  await expect(page.locator('#profile-role')).toHaveText('Customer');
  await noOverflow(page);
});

test('drawer traps focus, Escape closes it, and reduced motion is respected', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);
  if (await page.locator('#open-nav').isVisible()) {
    await page.locator('#open-nav').click();
    await expect(page.locator('#close-nav')).toBeFocused();
    await expect(page.locator('#logout')).toBeVisible();
    await page.locator('#close-nav').press('Shift+Tab');
    await expect(page.locator('#logout')).toBeFocused();
    await page.locator('#logout').press('Tab');
    await expect(page.locator('#close-nav')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#open-nav')).toBeFocused();
    await expect(page.locator('#open-nav')).toHaveAttribute('aria-expanded', 'false');
  }
  const duration = await page.locator('.card').first().evaluate(el => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThan(.01);
});

test('failed queue requests can be retried and failed creation preserves input', async ({ page }) => {
  await page.route('**/api/tickets', async (route) => {
    if (route.request().method() === 'GET') await route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } });
    else await route.continue();
  });
  await page.goto('/');
  await page.locator('#login-form [name="email"]').fill(admin.email);
  await page.locator('#login-form [name="password"]').fill(admin.password);
  await page.locator('#login-form [type="submit"]').click();
  await expect(page.getByText('Could not load tickets')).toBeVisible();
  await page.unroute('**/api/tickets');
  await page.locator('#retry-queue').click();
  await expect(page.locator('.card').first()).toBeVisible();
  await page.locator('#new-ticket').click();
  await page.locator('#ticket-form [name="subject"]').fill('Keep this draft');
  await page.locator('#ticket-form [name="customer_email"]').fill('draft@example.test');
  await page.locator('#ticket-form [name="description"]').fill('Keep this context if saving fails.');
  await page.route('**/api/tickets', route => route.fulfill({ status: 503, json: { error: 'Unable to save. Try again.' } }));
  await page.locator('#ticket-form [type="submit"]').click();
  await expect(page.locator('#ticket-error')).toContainText('Unable to save');
  await expect(page.locator('#ticket-form [name="subject"]')).toHaveValue('Keep this draft');
  await expect(page.locator('#ticket-form [type="submit"]')).toBeEnabled();
});


test('administrator can archive a selected ticket without changing other tickets', async ({ page }) => {
  await signIn(page);
  await page.locator('#filter-status').selectOption('all');
  const before = await page.locator('.card').count();
  const id = await page.locator('.card').first().getAttribute('data-ticket-id');
  await page.locator('.card').first().click();
  await expect(page.locator('#detail-archive')).toBeVisible();
  await page.locator('#detail-archive').click();
  await expect(page.locator('#ticket-detail-dialog')).not.toBeVisible();
  await expect(page.locator('.card')).toHaveCount(before - 1);
  await expect(page.locator(`[data-ticket-id="${id}"]`)).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('archived');
  const response = await page.request.get(`/api/tickets/${id}`);
  expect(response.status()).toBe(404);
});
