import crypto from 'node:crypto';

/** Secure random hex token, used for parental-consent confirmation links. */
export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Whole years of age as of `onDateStr` ('YYYY-MM-DD'), given a birthday date string. */
export function ageInYears(birthdayStr, onDateStr) {
  const birthday = new Date(`${birthdayStr}T00:00:00Z`);
  const on = new Date(`${onDateStr}T00:00:00Z`);
  let age = on.getUTCFullYear() - birthday.getUTCFullYear();
  const monthDiff = on.getUTCMonth() - birthday.getUTCMonth();
  const dayDiff = on.getUTCDate() - birthday.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}
