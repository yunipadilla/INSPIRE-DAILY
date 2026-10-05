// Service-level integration tests for services/streakService.js against the
// real database, using two DISPOSABLE accounts (account_status 'pending', so
// they never appear in HQ lists or the program-wide reconcile) that are
// fully deleted in `after`. Run explicitly — not part of `npm test`, since
// this database is shared with production:
//
//   npm run test:integration
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../../src/db.js';
import { reconcileUser } from '../../src/services/streakService.js';

const NOW = new Date('2026-11-12T21:00:00Z'); // Thu 2026-11-12, 1:00 PM PST
const DATES = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09', '2026-11-10', '2026-11-11'];
const ids = {};

async function makeUser(tag) {
  const { rows } = await query(
    `insert into users (email, password_hash, first_name, last_name, birthday, app_role, account_status)
     values ($1, 'x', 'QA', $2, '2000-01-01', 'intern', 'pending') returning id`,
    [`qa-streak-integration-${tag}-${Date.now()}@example.com`, `StreakIT-${tag}`]
  );
  return rows[0].id;
}
async function addScores(userId, dates) {
  for (const d of dates) {
    await query(
      `insert into daily_scores (user_id, date, display_name, earned_way, best_self, ceo_mindset, grit, happiness, sleep, total_score, points)
       values ($1, $2, 'QA', true, 8, 8, 8, 8, 8, 40, 40)`,
      [userId, d]
    );
  }
}
async function state(userId) {
  const { rows: [u] } = await query('select streak_count, streak_shields, streak_last_date::text as d from users where id = $1', [userId]);
  const { rows: ev } = await query(
    `select event_type, event_date::text as date, voided_at is not null as voided from streak_shield_events where user_id = $1 order by event_date, event_type`,
    [userId]
  );
  return { streak: u.streak_count, shields: u.streak_shields, lastDate: u.d, events: ev };
}

before(async () => {
  ids.a = await makeUser('a');
  ids.b = await makeUser('b');
  await addScores(ids.a, DATES);
  await addScores(ids.b, DATES);
});

after(async () => {
  for (const id of Object.values(ids)) {
    await query('delete from streak_shield_events where user_id = $1', [id]);
    await query('delete from daily_scores where user_id = $1', [id]);
    await query('delete from users where id = $1', [id]);
  }
  const { rows } = await query(`select count(*)::int as n from users where email like 'qa-streak-integration-%'`);
  assert.equal(rows[0].n, 0, 'disposable accounts cleaned up');
  await pool.end();
});

test('first reconcile derives state; runs 2 and 3 change nothing (idempotent)', async () => {
  const r1 = await reconcileUser(ids.a, { now: NOW });
  assert.equal(r1.anomaly, null);
  const s1 = await state(ids.a);
  assert.deepEqual([s1.streak, s1.shields], [9, 1]);
  assert.deepEqual(s1.events.map((e) => `${e.event_type}@${e.date}`), ['earned@2026-11-09']);

  for (let i = 0; i < 2; i++) {
    const r = await reconcileUser(ids.a, { now: NOW });
    assert.equal(r.changed, false);
    assert.deepEqual(await state(ids.a), s1);
  }
});

test('concurrent reconciles of the same user serialize — no duplicate events', async () => {
  const before = await state(ids.a);
  const results = await Promise.all(Array.from({ length: 6 }, () => reconcileUser(ids.a, { now: NOW })));
  assert.ok(results.every((r) => r && !r.anomaly));
  assert.deepEqual(await state(ids.a), before);
});

test('the database itself refuses a second active event for the same user/type/day', async () => {
  await assert.rejects(
    query(
      `insert into streak_shield_events (user_id, event_type, amount, streak_value, event_date, reason)
       values ($1, 'earned', 1, 7, '2026-11-09', 'dup')`,
      [ids.a]
    ),
    /duplicate key/
  );
});

test('a miss after the deadline consumes exactly one shield, atomically, once', async () => {
  const thu = new Date('2026-11-13T21:00:00Z'); // Fri 1 PM: Thu 11-12 is a closed miss
  await reconcileUser(ids.a, { now: thu });
  const s = await state(ids.a);
  assert.deepEqual([s.streak, s.shields, s.lastDate], [9, 0, '2026-11-12']);
  for (let i = 0; i < 3; i++) await reconcileUser(ids.a, { now: thu });
  const consumed = (await state(ids.a)).events.filter((e) => e.event_type === 'consumed' && !e.voided);
  assert.equal(consumed.length, 1);
});

test('invariant: an upward jump with no new Daily Score rows is refused, not written', async () => {
  await query('update users set streak_count = 0, streak_shields = 0 where id = $1', [ids.a]); // simulate corruption
  const r = await reconcileUser(ids.a, { now: new Date('2026-11-13T21:00:00Z') });
  assert.match(r.anomaly, /upward jump/);
  assert.equal((await state(ids.a)).streak, 0, 'left untouched for a human to inspect');
  const fixed = await reconcileUser(ids.a, { now: new Date('2026-11-13T21:00:00Z'), allowRebaseline: true });
  assert.equal(fixed.anomaly, null);
  assert.equal((await state(ids.a)).streak, 9);
});

test('a ledger row the replay no longer derives is voided (kept), never deleted', async () => {
  await query(
    `insert into streak_shield_events (user_id, event_type, amount, streak_value, event_date, reason)
     values ($1, 'consumed', -1, 5, '2026-11-01', 'bogus retroactive')`,
    [ids.a]
  );
  await reconcileUser(ids.a, { now: new Date('2026-11-13T21:00:00Z') });
  const bogus = (await state(ids.a)).events.find((e) => e.date === '2026-11-01');
  assert.equal(bogus.voided, true);
});

test('deleting one Daily Score changes only that user', async () => {
  await reconcileUser(ids.b, { now: NOW });
  const bBefore = await state(ids.b);
  await query(`delete from daily_scores where user_id = $1 and date = '2026-11-04'`, [ids.a]);
  await reconcileUser(ids.a, { now: NOW });
  const a = await state(ids.a);
  assert.deepEqual([a.streak, a.shields], [6, 0], 'Nov 4 now a miss with no shield -> reset, then 6 days');
  await reconcileUser(ids.b, { now: NOW });
  assert.deepEqual(await state(ids.b), bBefore);
});
