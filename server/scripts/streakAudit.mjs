// READ-ONLY streak/shield audit. Compares every approved user's stored
// streak_count / streak_shields against the canonical replay
// (src/lib/streakEngine.js) and classifies each. Writes nothing.
//
//   node scripts/streakAudit.mjs            # table
//   node scripts/streakAudit.mjs --json     # machine-readable
import { query } from '../src/db.js';
import { replayStreak, baselineFromCheckpoint, clockFrom } from '../src/lib/streakEngine.js';

const asJson = process.argv.includes('--json');
const clock = clockFrom(new Date());

const { rows: users } = await query(
  `select id, first_name, last_name, email, system_role, streak_count, streak_shields, streak_last_date::text as streak_last_date
     from users where account_status = 'approved' order by first_name, last_name`
);
const { rows: cps } = await query('select * from base44_checkpoints');
const cpByUser = new Map(cps.map((c) => [c.user_id, c]));
const { rows: corrs } = await query('select user_id, count(*)::int as n from streak_admin_corrections group by user_id');
const corrByUser = new Map(corrs.map((c) => [c.user_id, c.n]));
const { rows: evs } = await query(
  `select user_id, event_type, event_date::text as event_date from streak_shield_events
    where ${await hasColumn('streak_shield_events', 'voided_at') ? 'voided_at is null' : 'true'}`
);

const out = [];
for (const u of users) {
  const { rows } = await query('select date::text as d, submitted_at from daily_scores where user_id = $1 order by date', [u.id]);
  const dates = rows.map((r) => r.d);
  const cp = cpByUser.get(u.id) || null;
  const r = replayStreak({ submittedDates: dates, baseline: baselineFromCheckpoint(cp), ...clock });

  const streakOk = r.streak === u.streak_count;
  const shieldsOk = r.shields === u.streak_shields;
  let status = 'OK';
  if (!streakOk && !shieldsOk) status = 'BOTH_WRONG';
  else if (!streakOk) status = r.streak > u.streak_count ? 'STREAK_TOO_LOW' : 'STREAK_TOO_HIGH';
  else if (!shieldsOk) status = r.shields > u.streak_shields ? 'SHIELDS_TOO_LOW' : 'SHIELDS_TOO_HIGH';

  const userEvents = evs.filter((e) => e.user_id === u.id);
  out.push({
    name: `${u.first_name} ${u.last_name}`,
    email: u.email,
    role: u.system_role,
    storedStreak: u.streak_count,
    expectedStreak: r.streak,
    storedShields: u.streak_shields,
    expectedShields: r.shields,
    progressToNextShield: `${r.progress}/7`,
    checkpoint: cp ? `${cp.checkpoint_date}:${cp.streak_checkpoint} (${cp.source})` : null,
    adminCorrections: corrByUser.get(u.id) || 0,
    lastValidDailyScore: dates.length ? dates[dates.length - 1] : null,
    countedSinceBaseline: r.countedDates.length,
    replayMisses: r.events.filter((e) => e.type !== 'earned').map((e) => `${e.type}@${e.date}`),
    expectedEarn: r.events.filter((e) => e.type === 'earned').map((e) => e.date),
    expectedConsume: r.events.filter((e) => e.type === 'consumed').map((e) => e.date),
    ledgerEarn: userEvents.filter((e) => e.event_type === 'earned').map((e) => e.event_date),
    ledgerConsume: userEvents.filter((e) => e.event_type === 'consumed').map((e) => e.event_date),
    pending: r.pendingDates,
    status,
  });
}

if (asJson) {
  console.log(JSON.stringify({ clock, users: out }, null, 2));
} else {
  console.log(`clock: ${clock.today} ${clock.beforeNoon ? 'before' : 'after'} noon PT`);
  for (const o of out) {
    console.log(
      `${o.status.padEnd(16)} ${o.name.padEnd(22)} streak ${String(o.storedStreak).padStart(3)} -> ${String(o.expectedStreak).padStart(3)} | shields ${o.storedShields} -> ${o.expectedShields} | ${o.checkpoint || 'no checkpoint'} | corr=${o.adminCorrections} | last=${o.lastValidDailyScore}`
    );
    if (o.status !== 'OK' || o.ledgerConsume.length || o.ledgerEarn.length) {
      console.log(`    misses: ${o.replayMisses.join(', ') || '-'}`);
      console.log(`    earn expected ${JSON.stringify(o.expectedEarn)} ledger ${JSON.stringify(o.ledgerEarn)} | consume expected ${JSON.stringify(o.expectedConsume)} ledger ${JSON.stringify(o.ledgerConsume)}`);
    }
  }
  const counts = out.reduce((m, o) => ({ ...m, [o.status]: (m[o.status] || 0) + 1 }), {});
  console.log('summary:', counts);
}
process.exit(0);

async function hasColumn(table, column) {
  const { rows } = await query(
    'select 1 from information_schema.columns where table_name = $1 and column_name = $2',
    [table, column]
  );
  return rows.length > 0;
}
