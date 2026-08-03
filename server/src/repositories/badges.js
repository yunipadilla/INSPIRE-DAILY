import { query } from '../db.js';

export async function findByUserAndTypeAndName(userId, badgeType, name) {
  const { rows } = await query(
    'select id from badges where user_id = $1 and badge_type = $2 and name = $3',
    [userId, badgeType, name]
  );
  return rows[0] || null;
}

export async function insertBadge(userId, { badgeType, name, description, iconEmoji, earnedDate, awardedBy, reason, source }) {
  const { rows } = await query(
    `insert into badges
      (user_id, badge_type, name, description, icon_emoji, earned_date, awarded_by, reason, source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning *`,
    [userId, badgeType, name, description || null, iconEmoji || null, earnedDate, awardedBy, reason || null, source]
  );
  return rows[0];
}
