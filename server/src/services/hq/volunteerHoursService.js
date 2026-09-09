import { query } from '../../db.js';
import { ptDateString, currentMonthBoundsPT } from '../../config/pacificTime.js';
import { windowBounds, scaffoldDays } from './metricsHelpers.js';
import { resolveVolunteerMinutesForProgram, minutesToHours } from '../volunteerTimeService.js';
import { PROJECT_WORK_LAUNCH_DATE } from '../../config/constants.js';

/**
 * Volunteer/Project time source of truth moved on PROJECT_WORK_LAUNCH_DATE:
 * `daily_scores.volunteer_hours` for dates before it (legacy, untouched),
 * Inspire Challenge's `summer_entries.project_minutes` on/after it (current)
 * — see services/volunteerTimeService.js, the one canonical resolver both
 * sources are read through. Never sum either column directly here.
 */
export async function getVolunteerHoursOverview({ days = 30 } = {}) {
  const today = ptDateString();
  const { start } = windowBounds(days, today);
  const { start: monthStart, end: monthEnd } = currentMonthBoundsPT();

  const [allTime, thisMonth, legacyTrendRes, currentTrendRes] = await Promise.all([
    resolveVolunteerMinutesForProgram('2000-01-01', today),
    resolveVolunteerMinutesForProgram(monthStart, monthEnd),
    query(
      `select ds.date::text as day, coalesce(sum(ds.volunteer_hours), 0)::float as hours
         from daily_scores ds join users u on u.id = ds.user_id
        where ds.date between $1 and $2 and ds.date < $3 and u.system_role = 'participant'
        group by ds.date`,
      [start, today, PROJECT_WORK_LAUNCH_DATE]
    ),
    query(
      `select se.date::text as day, coalesce(sum(se.project_minutes), 0)::int as minutes
         from summer_entries se join users u on u.id = se.user_id
        where se.date between $1 and $2 and se.date >= $3 and u.system_role = 'participant'
        group by se.date`,
      [start, today, PROJECT_WORK_LAUNCH_DATE]
    ),
  ]);

  const byDay = new Map();
  for (const row of legacyTrendRes.rows) byDay.set(row.day, (byDay.get(row.day) || 0) + row.hours);
  for (const row of currentTrendRes.rows) byDay.set(row.day, (byDay.get(row.day) || 0) + minutesToHours(row.minutes));
  const trend = scaffoldDays(start, today).map((day) => ({ date: day, hours: byDay.get(day) || 0 }));

  return {
    totalHours: minutesToHours(allTime.totalMinutes),
    hoursThisMonth: minutesToHours(thisMonth.totalMinutes),
    trend,
  };
}

export async function listVolunteerHoursMembers({ search, appRole, page = 1, pageSize = 20 } = {}) {
  const today = ptDateString();
  const { start: monthStart, end: monthEnd } = currentMonthBoundsPT();
  const conditions = [`u.system_role = 'participant'`];
  const params = [];
  let i = 1;
  if (search) {
    conditions.push(`(u.first_name ilike $${i} or u.last_name ilike $${i} or u.email ilike $${i})`);
    params.push(`%${search}%`);
    i += 1;
  }
  if (appRole) {
    conditions.push(`u.app_role = $${i}`);
    params.push(appRole);
    i += 1;
  }
  const where = conditions.join(' and ');
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(100, Math.max(1, Number(pageSize) || 20));

  // Hours themselves come from the canonical resolver (legacy + current +
  // any Base44 volunteer-hours checkpoint) — the whole-program form so this
  // stays two queries total, never N+1 per row. This query only supplies the
  // filtered participant identity + their most recent raw activity date
  // (a checkpoint has no day-level resolution, so it can never move
  // last_activity — see volunteerTimeService.js).
  const [membersRes, allTime, thisMonth] = await Promise.all([
    query(
      `select u.id, u.first_name, u.last_name,
              greatest(
                (select max(date) from daily_scores where user_id = u.id and volunteer_hours > 0),
                (select max(date) from summer_entries where user_id = u.id and project_minutes > 0)
              ) as last_activity
         from users u
        where ${where}`,
      params
    ),
    resolveVolunteerMinutesForProgram('2000-01-01', today),
    resolveVolunteerMinutesForProgram(monthStart, monthEnd),
  ]);

  const all = membersRes.rows.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    totalHours: minutesToHours(allTime.byUser.get(r.id) || 0),
    monthHours: minutesToHours(thisMonth.byUser.get(r.id) || 0),
    lastActivity: r.last_activity,
  }));
  all.sort((a, b) => b.totalHours - a.totalHours || a.firstName.localeCompare(b.firstName));

  const offset = (safePage - 1) * safePageSize;
  const rows = all.slice(offset, offset + safePageSize);

  return { rows, total: all.length, page: safePage, pageSize: safePageSize };
}
