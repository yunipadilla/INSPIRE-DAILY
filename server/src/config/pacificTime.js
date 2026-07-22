// Canonical Pacific Time (America/Los_Angeles) helpers.
// Every deadline, streak calculation, daily reset, and scheduled job in the
// app must go through these — never Date.now()/UTC math directly — so that
// PST/PDT transitions are handled correctly and consistently everywhere.

const PT_ZONE = 'America/Los_Angeles';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Current instant, expressed as a 'YYYY-MM-DD' string in Pacific Time. */
export function ptDateString(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: PT_ZONE }); // en-CA => YYYY-MM-DD
}

/** 0 (Sunday) .. 6 (Saturday), for a given 'YYYY-MM-DD' date string, computed via PT weekday name. */
export function ptDayOfWeek(dateStr) {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: PT_ZONE, weekday: 'long' }).format(
    new Date(`${dateStr}T12:00:00Z`)
  );
  return WEEKDAYS.indexOf(weekday);
}

/** Current hour (0-23) in Pacific Time. */
export function ptHour(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: PT_ZONE, hour: 'numeric', hour12: false }).format(date)
  );
}

export function isBeforeNoonPT(date = new Date()) {
  return ptHour(date) < 12;
}

export function isSundayPT(date = new Date()) {
  return ptDayOfWeek(ptDateString(date)) === 0;
}

/** Add/subtract whole days from a 'YYYY-MM-DD' string, anchored at noon UTC to dodge DST edge cases. */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

/** Milliseconds until the next Pacific-Time midnight (used for client countdowns / scheduling). */
export function msUntilMidnightPT(date = new Date()) {
  const todayStr = ptDateString(date);
  const tomorrowStr = addDays(todayStr, 1);
  const nowPartsMs = new Date(
    new Intl.DateTimeFormat('en-US', {
      timeZone: PT_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date)
  ).getTime();
  const midnightLocalGuess = new Date(`${tomorrowStr}T00:00:00`).getTime();
  return Math.max(0, midnightLocalGuess - nowPartsMs);
}

/** The submission deadline (noon PT the day after `dateStr`) as a human string, e.g. "12:00 PM PT tomorrow". */
export function deadlineLabelFor(dateStr) {
  const nextDay = addDays(dateStr, 1);
  return `12:00 PM Pacific Time on ${nextDay}`;
}

/** { start, end } 'YYYY-MM-DD' bounds of the current calendar month, in Pacific Time. */
export function currentMonthBoundsPT(date = new Date()) {
  const todayStr = ptDateString(date);
  const [year, month] = todayStr.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export const PACIFIC_TIME_ZONE = PT_ZONE;
