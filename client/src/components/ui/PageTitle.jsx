const ACCENT_CLASS = {
  primary: '',
  mint: 'bubble-heading--accent-mint',
  blue: 'bubble-heading--accent-blue',
  peach: 'bubble-heading--accent-peach',
  lavender: 'bubble-heading--accent-lavender',
};

/**
 * The app's bubble-style page title — dimensional (layered text-shadow, not
 * a flat color) rather than cartoonish, theme-aware via tokens, and
 * degrades to a plain heading under prefers-reduced-motion (the shadow
 * itself isn't animated, so nothing needs to change there — only the
 * page-entrance animation wrapping it, handled by rise-in elsewhere, turns
 * off).
 */
export default function PageTitle({ children, accent = 'primary', as: Tag = 'h1', className = '' }) {
  const accentClass = ACCENT_CLASS[accent] || '';
  return <Tag className={`bubble-heading text-2xl sm:text-3xl ${accentClass} ${className}`}>{children}</Tag>;
}
