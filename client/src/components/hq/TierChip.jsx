// Tier Lab display chip. Colors are theme tokens only (never literals).
const STYLE = {
  1: '--color-yellow',
  2: '--color-blue',
  3: '--color-peach',
  building: '--color-lavender',
  insufficient: '--color-text-muted',
};

/** Pre-launch wording only — always "Projected", never "earned"/"awarded". */
export default function TierChip({ tier, status = 'ok', label, size = 'md' }) {
  const key = status === 'insufficient' ? 'insufficient' : tier ? tier : 'building';
  const text = label || (status === 'insufficient' ? 'Insufficient Data' : tier ? `Projected Tier ${tier}` : 'Building Toward Tier 3');
  const v = STYLE[key];
  return (
    <span
      className={`inline-block rounded-full font-bold text-navy whitespace-nowrap ${size === 'lg' ? 'px-4 py-1.5 text-base' : 'px-2.5 py-0.5 text-xs'}`}
      style={{ background: `rgb(var(${v}) / ${key === 'insufficient' ? 0.15 : 0.35})`, border: `1px solid rgb(var(${v}) / 0.7)` }}
    >
      {text}
    </span>
  );
}
