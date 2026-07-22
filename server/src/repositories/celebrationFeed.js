import { query } from '../db.js';

export async function postCelebration({ type, userId, message }) {
  await query(
    `insert into celebration_feed (type, user_id, message) values ($1, $2, $3)`,
    [type, userId, message]
  );
}

export async function listActiveCelebrations(limit = 20) {
  const { rows } = await query(
    `select cf.id, cf.type, cf.message, cf.created_at, u.first_name, u.last_name, u.profile_photo_url
     from celebration_feed cf
     left join users u on u.id = cf.user_id
     where cf.expires_at > now()
     order by cf.created_at desc
     limit $1`,
    [limit]
  );
  return rows;
}
