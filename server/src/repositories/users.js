import { query } from '../db.js';

const PUBLIC_COLUMNS = `
  id, email, first_name, last_name, birthday, phone, profile_photo_url,
  app_role, account_status, quote_of_day, parental_consent_required,
  parental_consent_status, streak_count, streak_shields, streak_last_date,
  streak_recovery_available_until, streak_recovery_prior_count,
  created_at, approved_at
`;

export async function findByEmail(email) {
  const { rows } = await query('select * from users where lower(email) = lower($1)', [email]);
  return rows[0] || null;
}

export async function findById(id) {
  const { rows } = await query(`select ${PUBLIC_COLUMNS} from users where id = $1`, [id]);
  return rows[0] || null;
}

export async function findByIdWithSecrets(id) {
  const { rows } = await query('select * from users where id = $1', [id]);
  return rows[0] || null;
}

export async function createUser(data) {
  const { rows } = await query(
    `insert into users
      (email, password_hash, first_name, last_name, birthday, phone, profile_photo_url,
       app_role, account_status, quote_of_day, parental_consent_required,
       parental_consent_email, parental_consent_status, parental_consent_token,
       parental_consent_token_expires, approved_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     returning ${PUBLIC_COLUMNS}`,
    [
      data.email,
      data.passwordHash,
      data.firstName,
      data.lastName,
      data.birthday,
      data.phone || null,
      data.profilePhotoUrl || null,
      data.appRole,
      data.accountStatus,
      data.quoteOfDay || false,
      data.parentalConsentRequired || false,
      data.parentalConsentEmail || null,
      data.parentalConsentStatus || 'not_required',
      data.parentalConsentToken || null,
      data.parentalConsentTokenExpires || null,
      data.approvedAt || null,
    ]
  );
  return rows[0];
}

export async function approveUser(id) {
  const { rows } = await query(
    `update users set account_status = 'approved', approved_at = now() where id = $1 returning ${PUBLIC_COLUMNS}`,
    [id]
  );
  return rows[0];
}

export async function denyUser(id) {
  const { rows } = await query(
    `update users set account_status = 'denied' where id = $1 returning ${PUBLIC_COLUMNS}`,
    [id]
  );
  return rows[0];
}

export async function listPendingUsers() {
  const { rows } = await query(
    `select ${PUBLIC_COLUMNS} from users where account_status = 'pending' order by created_at asc`
  );
  return rows;
}

export async function confirmParentalConsentByToken(token) {
  const { rows } = await query(
    `update users
       set parental_consent_status = 'confirmed', parental_consent_token = null, parental_consent_token_expires = null
     where parental_consent_token = $1 and parental_consent_token_expires > now()
     returning ${PUBLIC_COLUMNS}`,
    [token]
  );
  return rows[0] || null;
}

export async function updateStreakFields(id, fields) {
  const sets = [];
  const values = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = $${i}`);
    values.push(value);
    i += 1;
  }
  values.push(id);
  const { rows } = await query(
    `update users set ${sets.join(', ')} where id = $${i} returning ${PUBLIC_COLUMNS}`,
    values
  );
  return rows[0];
}

export function toClientUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    fullName: `${user.first_name} ${user.last_name}`,
    birthday: user.birthday,
    phone: user.phone,
    profilePhotoUrl: user.profile_photo_url,
    appRole: user.app_role,
    accountStatus: user.account_status,
    quoteOfDay: user.quote_of_day,
    streakCount: user.streak_count,
    streakShields: user.streak_shields,
    streakLastDate: user.streak_last_date,
    streakRecoveryAvailableUntil: user.streak_recovery_available_until,
    streakRecoveryPriorCount: user.streak_recovery_prior_count,
    createdAt: user.created_at,
    approvedAt: user.approved_at,
  };
}

export const ALL_APP_ROLES = ['intern', 'postgrad', 'alumni', 'staff'];
