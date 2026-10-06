// Display helpers shared by the Tier Lab pages.
export const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
export const num = (x, d = 2) => (x == null ? '—' : Number(x).toFixed(d));
export const monthLabel = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};
