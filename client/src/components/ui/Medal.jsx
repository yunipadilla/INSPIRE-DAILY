const TONE_BY_CATEGORY = {
  icf_events: 'medal-gold',
  event: 'medal-gold',
  staff_awards: 'medal-silver',
  staff: 'medal-silver',
  skills: 'medal-bronze',
  milestones: 'medal-platinum',
  milestone: 'medal-platinum',
};

/**
 * A "physical" medal — metallic gradient ring, embossed bevel, ribbon notch —
 * built entirely in CSS (see `.medal`/`.medal-*` in index.css). No image
 * assets: tone is picked from badge category, not artwork.
 */
export default function Medal({ icon = '🏅', category, locked = false, size = 44, title }) {
  const tone = locked ? 'medal-locked' : TONE_BY_CATEGORY[category] || 'medal-gold';
  return (
    <div
      className={`medal ${tone}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      title={title}
    >
      <span className="relative z-10">{locked ? '🔒' : icon}</span>
    </div>
  );
}
