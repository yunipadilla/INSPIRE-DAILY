import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

/**
 * Full-screen sub-page with a back button — no bottom nav, no modal/sheet.
 * Used for all goal-creation flows per spec ("never as half screen pop ups
 * or bottom sheets").
 */
export default function FullScreenPage({ title, backTo = '/app/goals', children }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-appbg">
      <header className="flex items-center gap-2 px-4 py-4 sticky top-0 bg-appbg z-10">
        <button
          onClick={() => navigate(backTo)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5"
          aria-label="Back"
        >
          <ChevronLeft size={22} color="#1a1a2e" />
        </button>
        <h1 className="text-lg font-bold text-navy">{title}</h1>
      </header>
      <main className="max-w-2xl mx-auto px-4 pb-10">{children}</main>
    </div>
  );
}
