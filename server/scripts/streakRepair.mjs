// One-time audited streak/shield repair (2026-10-04 stability rebuild).
// Runs every approved user through the canonical service with
// allowRebaseline (first adoption of the replay engine) and records an
// audit row in streak_admin_corrections for every user whose streak or
// shield count actually changed. Dry-run by default.
//
//   node scripts/streakRepair.mjs [--snapshot=<file>]           # preview only
//   node scripts/streakRepair.mjs --apply --snapshot=<file>     # perform the repair
//
// Audit rows compare against the PRE-CHANGE snapshot (taken before any
// schema/data change), not the live values at run time — the deployed app
// may already have reconciled some users on their first visit — and are
// never written twice for the same user.
import { readFileSync } from 'fs';
import { query, pool } from '../src/db.js';
import { reconcileUser } from '../src/services/streakService.js';
import { ptDateString } from '../src/config/pacificTime.js';

const APPLY = process.argv.includes('--apply');
const SOURCE = 'repair-2026-10-04';
const APPLIED_BY = '1dadaaa0-42d6-4e37-8afc-7dff5628b86f'; // ma@inspiringchildren.org
const snapArg = process.argv.find((a) => a.startsWith('--snapshot='));
const snapshot = snapArg ? JSON.parse(readFileSync(snapArg.slice(11), 'utf8')) : null;
if (APPLY && !snapshot) throw new Error('--apply requires --snapshot=<pre-change snapshot file>');
const snapByUser = new Map((snapshot?.users || []).map((u) => [u.id, u]));

const { rows: users } = await query(
  "select id, first_name, last_name, email from users where account_status = 'approved' order by first_name, last_name"
);
let changedCount = 0;
for (const u of users) {
  const r = await reconcileUser(u.id, { allowRebaseline: true, source: SOURCE, dryRun: !APPLY });
  if (r.anomaly) console.log(`ANOMALY ${u.email}: ${r.anomaly}`);
  const snap = snapByUser.get(u.id);
  const pre = snap ? { streak: snap.streak_count, shields: snap.streak_shields } : r.before;
  const moved = pre.streak !== r.after.streak || pre.shields !== r.after.shields;
  if (!r.changed && !moved) continue;
  changedCount += 1;
  console.log(
    `${APPLY ? 'REPAIRED' : 'WOULD REPAIR'} ${u.first_name} ${u.last_name} <${u.email}>: ` +
      `streak ${pre.streak} -> ${r.after.streak}, shields ${pre.shields} -> ${r.after.shields}`
  );
  if (r.insertedEvents.length) console.log(`    + ledger: ${r.insertedEvents.map((e) => `${e.type}@${e.date}`).join(', ')}`);
  if (r.voidedEvents.length) console.log(`    - voided: ${r.voidedEvents.map((e) => `${e.type}@${e.date}`).join(', ')}`);
  if (APPLY && moved) {
    const { rows: existing } = await query(
      'select 1 from streak_admin_corrections where user_id = $1 and reason like $2',
      [u.id, `${SOURCE}:%`]
    );
    if (existing.length) continue;
    await query(
      `insert into streak_admin_corrections (user_id, correction_date, pre_correction_streak, corrected_streak, reason, applied_by)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        u.id,
        ptDateString(),
        pre.streak,
        r.after.streak,
        `${SOURCE}: canonical chronological replay (shields ${pre.shields} -> ${r.after.shields})`,
        APPLIED_BY,
      ]
    );
  }
}
console.log(`${APPLY ? 'applied' : 'dry run'}: ${changedCount} of ${users.length} users ${APPLY ? 'changed' : 'would change'}`);
await pool.end();
