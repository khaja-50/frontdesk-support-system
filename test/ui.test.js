import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const javascript = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('ticket modal has a non-submitting close button', () => {
  assert.match(html, /<dialog id="ticket-dialog">/);
  assert.match(html, /<button type="button" class="close" onclick="this\.closest\('dialog'\)\.close\(\)"/);
});

test('sidebar exposes all ticket states', () => {
  assert.match(html, /data-view="all"/);
  assert.match(html, /data-view="waiting"/);
  assert.match(html, /data-view="closed"/);
  assert.match(javascript, /status === 'waiting_customer'/);
  assert.match(javascript, /status === 'closed'/);
});

test('ticket detail workflow calls protected actions', () => {
  assert.match(html, /id="ticket-detail-dialog"/);
  assert.match(html, /id="detail-visibility"/);
  assert.match(html, /id="detail-status"/);
  assert.match(javascript, /\/messages`/);
  assert.match(javascript, /\/status`/);
  assert.match(javascript, /\/assign`/);
  assert.match(javascript, /detail-audit/);
});
