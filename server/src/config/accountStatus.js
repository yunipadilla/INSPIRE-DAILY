// Central definition of account_status values and what they mean. The DB
// check constraint today only allows these three values. 'denied' currently
// does double duty for both "signup application rejected" (a state public
// signup can no longer produce — see routes/auth.js) and "active account
// suspended by staff" (its current real use going forward). A future
// migration may split this into a distinct 'suspended' value — when it
// does, only this file needs to change: add SUSPENDED to ACCOUNT_STATUS and
// update isBlocked() below. Every other module should go through the
// predicates here rather than comparing raw strings, so that migration
// doesn't require touching auth middleware, login, or the account-lifecycle
// routes.
export const ACCOUNT_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
});

export function isActive(accountStatus) {
  return accountStatus === ACCOUNT_STATUS.APPROVED;
}

export function isPending(accountStatus) {
  return accountStatus === ACCOUNT_STATUS.PENDING;
}

/** Covers both meanings 'denied' carries today — add 'suspended' here once it exists as its own value. */
export function isBlocked(accountStatus) {
  return accountStatus === ACCOUNT_STATUS.DENIED;
}
