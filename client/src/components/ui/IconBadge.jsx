/** Formalizes the existing icon-badge pattern (colorful circular icon slot) as a component. */
export default function IconBadge({ icon, emoji, bg, size = 36, className = '' }) {
  return (
    <span className={`icon-badge ${className}`} style={{ background: bg, width: size, height: size }}>
      {emoji || icon}
    </span>
  );
}
