// Tier Lab integration tests against the real database, using ONE DISPOSABLE
// participant (account_status 'pending', so it never appears in HQ lists or the
// program-wide reconcile) that is fully deleted in `after`. Everything the
// service does is read-only; only the fixtures are written. Run explicitly —
// this database is shared with production:
//
//   npm run test:integration
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../../src/db.js';
import { getTierLabMember, simulateTierRules } from '../../src/services/hq/tierLabService.js';
import { getRuleSet } from '../../src/config/tierRules.js';

const NOW = new Date('2026-12-05T20:00:00Z'); // Sat 2026-12-05, 12:00 PM PST — Friday 12-04 closed
const MONTH = '2026-11';
const TAG = `qa-tierlab-integration-${Date.now()}@example.com`;
let userId;

const requiredNov = [];
for (let d = 2; d <= 30; d++) {
  const date = `2026-11-${String(d).padStart(2, '0')}`;
  if (new Date(`${date}T12:00:00Z`).getUTCDay() !== 0) requiredNov.push(date);
}

async function addScore(date) {
  await query(
    `insert into daily_scores (user_id, date, display_name, earned_way, best_self, ceo_mindset, grit, happiness, sleep, total_score, points)
     values ($1, $2, 'QA', true, 8, 8, 8, 8, 8, 40, 40)`, [userId, date]);
}
async function addChallenge(date, points) {
  await query(`insert into summer_entries (user_id, date, total_points) values ($1, $2, $3)`, [userId, date, points]);
}

before(async () => {
  const { rows } = await query(
    `insert into users (email, password_hash, first_name, last_name, birthday, app_role, account_status, created_at)
     values ($1, 'x', 'QA', 'TierLab', '2000-01-01', 'intern', 'pending', '2026-11-02T20:00:00Z') returning id`, [TAG]);
  userId = rows[0].id;
  // Base44-style checkpoint: Nov 2-6 are covered by an aggregate (50 pts, 4 days), with no raw rows for those days
  // except one raw Challenge row (Nov 4, 30 pts) that the aggregate already includes.
  await query(
    `insert into base44_checkpoints (user_id, source, checkpoint_date, streak_checkpoint, challenge_period, challenge_points_checkpoint, challenge_days_checkpoint)
     values ($1, 'base44', '2026-11-06', 4, '2026-11', 50, 4)`, [userId]);
  await addChallenge('2026-11-04', 30);   // on/before checkpoint -> must NOT be added again
  await addChallenge('2026-11-08', 99);   // a SUNDAY row -> not a required day, must not count
  await addChallenge('2026-11-09', 20);
  await addChallenge('2026-11-10', 10);
  // Completed entries: every required day after the checkpoint except Sat Nov 7 (a real miss).
  for (const d of requiredNov) if (d > '2026-11-07') await addScore(d);
});

after(async () => {
  await query('delete from streak_shield_events where user_id = $1', [userId]);
  await query('delete from base44_checkpoints where user_id = $1', [userId]);
  await query('delete from summer_entries where user_id = $1', [userId]);
  await query('delete from daily_scores where user_id = $1', [userId]);
  await query('delete from users where id = $1', [userId]);
  const { rows } = await query(`select count(*)::int as n from users where email like 'qa-tierlab-integration-%'`);
  assert.equal(rows[0].n, 0, 'disposable account cleaned up');
  await pool.end();
});

test('14. checkpoint does not double count: points = aggregate + only post-checkpoint weekday rows; Sunday row ignored', async () => {
  const out = await getTierLabMember(userId, { endMonth: MONTH, now: NOW });
  const nov = out.result.monthlyBreakdown.find((m) => m.month === MONTH);
  // 50 (aggregate, already includes the Nov 4 row) + 20 + 10. NOT 50+30+20+10, NOT +99.
  assert.equal(nov.challengePoints, 80);
  assert.equal(nov.challengeUnverifiableDays, 0, 'aggregate covers Nov 2-6');
  assert.equal(nov.challengeDays, 25);
  assert.ok(Math.abs(nov.challengeAverage - 80 / 25) < 1e-12);
});

test('completion: raw rows only; checkpoint days w/o rows are unverifiable; Nov 7 is a real miss; no fabricated records', async () => {
  const out = await getTierLabMember(userId, { endMonth: MONTH, now: NOW });
  const nov = out.result.monthlyBreakdown.find((m) => m.month === MONTH);
  assert.equal(nov.eligibleDays, 25);
  assert.equal(nov.completedEntries, 19);
  assert.equal(nov.unverifiableDays, 5);  // Nov 2-6
  assert.equal(nov.missedDays, 1);        // Sat Nov 7 (after the checkpoint)
  assert.equal(nov.status, 'partial');
  assert.equal(nov.completionRate, 19 / 20);
  assert.equal(out.result.ruleVersion, 'v1');
  const { rows } = await query('select count(*)::int n from daily_scores where user_id = $1', [userId]);
  assert.equal(rows[0].n, 19, 'the service wrote no Daily Score rows');
});

test('15. a shield-protected miss stays a miss: shields + a consumed ledger row change nothing', async () => {
  const before = await getTierLabMember(userId, { endMonth: MONTH, now: NOW });
  await query('update users set streak_shields = 3, streak_count = 20 where id = $1', [userId]);
  await query(
    `insert into streak_shield_events (user_id, event_type, amount, streak_value, event_date, reason, source)
     values ($1, 'consumed', -1, 4, '2026-11-07', 'QA shield protected a missed day', 'qa')`, [userId]);
  const after = await getTierLabMember(userId, { endMonth: MONTH, now: NOW });
  assert.deepEqual(after.result.monthlyBreakdown, before.result.monthlyBreakdown);
  assert.equal(after.result.monthlyBreakdown.find((m) => m.month === MONTH).missedDays, 1);
  assert.equal(after.result.completionRate, before.result.completionRate);
});

test('the service never touches streak/shield state', async () => {
  const { rows: [u] } = await query('select streak_count, streak_shields, streak_last_date, last_streak_reconciled_at from users where id = $1', [userId]);
  await getTierLabMember(userId, { endMonth: MONTH, now: NOW });
  const { rows: [u2] } = await query('select streak_count, streak_shields, streak_last_date, last_streak_reconciled_at from users where id = $1', [userId]);
  assert.deepEqual(u2, u);
});

test('18. the Rule Simulator previews without changing the saved draft rules', async () => {
  const snapshot = JSON.stringify(getRuleSet('v1'));
  const lenient = [
    { tier: 1, minCompletion: 0.2, minChallengeAvg: 1 },
    { tier: 2, minCompletion: 0.1, minChallengeAvg: 1 },
    { tier: 3, minCompletion: 0.05, minChallengeAvg: 0 },
  ];
  const sim = await simulateTierRules(lenient, { now: NOW });
  assert.equal(sim.saved, false);
  assert.equal(sim.draft.rules.version, 'v1');
  assert.match(sim.preview.rules.version, /preview/);
  assert.equal(sim.draft.distribution.total, sim.preview.distribution.total);
  assert.equal(JSON.stringify(getRuleSet('v1')), snapshot, 'saved rules unchanged after a simulation');
  const again = await simulateTierRules(getRuleSet('v1').tiers, { now: NOW });
  assert.deepEqual(again.draft.distribution, again.preview.distribution, 'previewing the draft thresholds equals the draft');
  assert.equal(again.changes.length, 0);
});
