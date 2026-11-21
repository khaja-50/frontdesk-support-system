import test from 'node:test';
import assert from 'node:assert/strict';
import { addWorkingMinutes, workingMinutesBetween } from '../src/sla.js';

test('SLA clock skips weekends and starts at 09:30', () => {
  assert.equal(addWorkingMinutes('2026-11-20T17:30:00.000Z', 120), '2026-11-23T10:30:00.000Z');
});
test('SLA clock excludes configured holidays', () => {
  assert.equal(addWorkingMinutes('2026-11-23T09:30:00.000Z', 60, ['2026-11-23']), '2026-11-24T10:30:00.000Z');
});
test('working minutes are limited to support hours', () => {
  assert.equal(workingMinutesBetween('2026-11-23T08:00:00Z','2026-11-23T19:00:00Z'), 540);
});
