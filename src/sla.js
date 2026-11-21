const DEFAULT_HOURS = { start: 9.5, end: 18.5 };

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function isWorkingDay(date, holidays = []) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6 && !holidays.includes(dayKey(date));
}

export function addWorkingMinutes(input, minutes, holidays = [], hours = DEFAULT_HOURS) {
  let cursor = new Date(input);
  const step = minutes < 0 ? -1 : 1;
  let remaining = Math.abs(minutes);
  while (remaining > 0) {
    if (!isWorkingDay(cursor, holidays)) {
      cursor.setUTCDate(cursor.getUTCDate() + step);
      cursor.setUTCHours(step > 0 ? Math.floor(hours.start) : Math.floor(hours.end), step > 0 ? 30 : 0, 0, 0);
      continue;
    }
    const start = new Date(cursor); start.setUTCHours(9, 30, 0, 0);
    const end = new Date(cursor); end.setUTCHours(18, 30, 0, 0);
    if (step > 0 && cursor < start) cursor = start;
    if (step > 0 && cursor >= end) { cursor.setUTCDate(cursor.getUTCDate() + 1); cursor.setUTCHours(9, 30, 0, 0); continue; }
    if (step < 0 && cursor > end) cursor = end;
    if (step < 0 && cursor <= start) { cursor.setUTCDate(cursor.getUTCDate() - 1); cursor.setUTCHours(18, 30, 0, 0); continue; }
    const boundary = step > 0 ? end : start;
    const available = Math.floor(Math.abs(boundary - cursor) / 60000);
    const move = Math.min(remaining, available);
    cursor = new Date(cursor.getTime() + step * move * 60000);
    remaining -= move;
  }
  return cursor.toISOString();
}

export function workingMinutesBetween(startInput, endInput, holidays = []) {
  let start = new Date(startInput), end = new Date(endInput);
  if (end <= start) return 0;
  let total = 0;
  for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    if (!isWorkingDay(d, holidays)) continue;
    const open = new Date(d); open.setUTCHours(9, 30, 0, 0);
    const close = new Date(d); close.setUTCHours(18, 30, 0, 0);
    const from = new Date(Math.max(start, open));
    const to = new Date(Math.min(end, close));
    if (to > from) total += (to - from) / 60000;
  }
  return total;
}

export const isWorkingDayForTest = isWorkingDay;
