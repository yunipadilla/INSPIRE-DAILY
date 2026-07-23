/**
 * Purely decorative background — a few blurred gradient blobs (CSS only, no
 * images) plus a couple of sparkles. Entirely aria-hidden and
 * pointer-events-none so it never interferes with the form/content or
 * screen readers; animations are defined in index.css and are disabled
 * globally under prefers-reduced-motion.
 *
 * variant="full" (Login, other full-page templates): 4 blobs + 3 sparkles.
 * variant="light" (Home, content-heavy pages): 2 blobs, no sparkles — enough
 * ambiance to feel alive without competing with dense foreground content.
 */
export default function BubbleBackground({ variant = 'full' }) {
  const light = variant === 'light';
  return (
    <div aria-hidden="true" className="absolute inset-0 pointer-events-none select-none overflow-hidden">
      <div className="bubble-blob bubble-blob--1" />
      <div className="bubble-blob bubble-blob--2" />
      {!light && (
        <>
          <div className="bubble-blob bubble-blob--3" />
          <div className="bubble-blob bubble-blob--4" />
          <span className="bubble-sparkle text-2xl" style={{ top: '18%', left: '12%' }}>
            ✦
          </span>
          <span className="bubble-sparkle text-lg" style={{ top: '68%', right: '14%', animationDelay: '1.2s' }}>
            ✧
          </span>
          <span className="bubble-sparkle text-xl" style={{ top: '40%', right: '22%', animationDelay: '2s' }}>
            ✦
          </span>
        </>
      )}
    </div>
  );
}
