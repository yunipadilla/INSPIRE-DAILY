// Reading-cap integration tests against the real database, using ONE DISPOSABLE
// participant (account_status 'pending' — never listed in HQ or reconciled) that
// is fully deleted in `after`. No application endpoint is called, so no
// streak reconciliation can run. Run explicitly — this database is shared with
// production:
//
//   npm run test:integration
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../../src/db.js';
import { insertSummerEntry } from '../../src/repositories/summerEntries.js';
import { buildSummerEntryValues, calculateSummerPoints } from '../../src/lib/summerChallenge.js';
import { expectedTotalForRow } from '../../src/agents/summerChallengeAgent.js';
import { getMemberChallengeCategoryBreakdown } from '../../src/services/hq/challengeService.js';

const TAG = `qa-readingcap-integration-${Date.now()}@example.com`;
const OLD_DAY = '2026-11-20';   // before the cap change
const NEW_DAY = '2026-11-24';   // first capped day
const NEW_DAY_2 = '2026-11-25';
const NEW_DAY_3 = '2026-11-26';
let userId;

/** Submit the way the route does: clean the body for the date, score it, insert. */
async function submit(date, body) {
  const values = buildSummerEntryValues(body, date);
  const total = calculateSummerPoints(values, date);
  return insertSummerEntry(userId, date, values, total);
}
const rowsFor = async (date) => (await query('select * from summer_entries where user_id = $1 and date = $2', [userId, date])).rows;

before(async () => {
  const { rows } = await query(
    `insert into users (email, password_hash, first_name, last_name, birthday, app_role, account_status)
     values ($1, 'x', 'QA', 'ReadingCap', '2000-01-01', 'intern', 'pending') returning id`, [TAG]);
  userId = rows[0].id;
});

after(async () => {
  await query('delete from summer_entries where user_id = $1', [userId]);
  await query('delete from users where id = $1', [userId]);
  const { rows } = await query(`select count(*)::int as n from users where email like 'qa-readingcap-integration-%'`);
  assert.equal(rows[0].n, 0, 'disposable account cleaned up');
  await pool.end();
});

test('capped day: 4 sessions submitted -> 2 stored, 1.5 points, within the DB CHECK', async () => {
  const rec = await submit(NEW_DAY, { readingSessions: 4 });
  assert.equal(rec.reading_sessions, 2);
  assert.equal(Number(rec.total_points), 1.5);
});

test('a second submission for the same day is rejected by the database and cannot change or add points', async () => {
  await assert.rejects(() => submit(NEW_DAY, { readingSessions: 4, exercise: true }), (err) => err.code === '23505');
  const rows = await rowsFor(NEW_DAY);
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].total_points), 1.5);
  assert.equal(rows[0].exercise, false);
});

test('simultaneous submissions for one day: exactly one wins, Reading stays at the cap', async () => {
  const results = await Promise.allSettled([
    submit(NEW_DAY_2, { readingSessions: 4 }),
    submit(NEW_DAY_2, { readingSessions: 4 }),
    submit(NEW_DAY_2, { readingSessions: 3 }),
    submit(NEW_DAY_2, { readingSessions: 2 }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === '23505'));
  const rows = await rowsFor(NEW_DAY_2);
  assert.equal(rows.length, 1);
  assert.ok(Number(rows[0].total_points) <= 1.5);
});

test('history preserved: an entry dated before the change keeps 4 Reading points and is not seen as drift', async () => {
  // Insert exactly what the old code would have stored on 2026-11-20 (4 sessions = 4 points).
  const rec = await insertSummerEntry(userId, OLD_DAY, buildSummerEntryValues({ readingSessions: 4 }, OLD_DAY), 4);
  assert.equal(rec.reading_sessions, 4);
  assert.equal(Number(rec.total_points), 4);
  // The 15-minute agent's own expectation for this stored row equals the stored total -> it would NOT rewrite it.
  const [row] = await rowsFor(OLD_DAY);
  assert.equal(expectedTotalForRow(row), Number(row.total_points));
  // ...and so is the capped row.
  const [capped] = await rowsFor(NEW_DAY);
  assert.equal(expectedTotalForRow(capped), Number(capped.total_points));
});

test('HQ per-day audit: old row = 4 pts, capped row = 1.5 pts, neither flagged as a mismatch', async () => {
  const bd = await getMemberChallengeCategoryBreakdown(userId, '2026-11');
  const byDate = Object.fromEntries(bd.rows.map((r) => [r.date, r]));
  assert.equal(byDate[OLD_DAY].categories.readingSessions, 4);
  assert.equal(byDate[OLD_DAY].storedTotal, 4);
  assert.equal(byDate[OLD_DAY].mismatch, false);
  assert.equal(byDate[NEW_DAY].categories.readingSessions, 1.5);
  assert.equal(byDate[NEW_DAY].computedTotal, 1.5);
  assert.equal(byDate[NEW_DAY].mismatch, false);
  const reading = bd.categories.find((c) => c.id === 'readingSessions');
  assert.equal(reading.max, 1.5);
});

test('HQ audit would flag a capped-date row that somehow carried an uncapped total (defense in depth)', async () => {
  await query(
    `insert into summer_entries (user_id, date, reading_sessions, total_points) values ($1, $2, 4, 4)`, [userId, NEW_DAY_3]);
  const bd = await getMemberChallengeCategoryBreakdown(userId, '2026-11');
  const row = bd.rows.find((r) => r.date === NEW_DAY_3);
  assert.equal(row.computedTotal, 1.5);
  assert.equal(row.mismatch, true);
});

test('stored Challenge totals for the disposable member add up exactly (4 + 1.5 + 1.5 + 4)', async () => {
  const { rows } = await query('select sum(total_points)::float as t, count(*)::int as n from summer_entries where user_id = $1', [userId]);
  assert.equal(rows[0].n, 4);
  assert.equal(rows[0].t, 11);
});
