/** Shimmering loading placeholder — flattens to a static tone under prefers-reduced-motion (see index.css). */
export default function Skeleton({ className = '', width, height = '1rem' }) {
  return <div className={`skeleton ${className}`} style={{ width, height }} aria-hidden="true" />;
}
