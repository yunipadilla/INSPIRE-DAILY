import { useEffect } from 'react';
import confetti from 'canvas-confetti';

export default function GoalCelebration({ message, onClose }) {
  useEffect(() => {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-6" onClick={onClose}>
      <div className="card p-8 text-center space-y-3 max-w-sm gradient-goals" onClick={(e) => e.stopPropagation()}>
        <div className="text-5xl">🎉</div>
        <h2 className="text-xl font-bold text-navy">{message}</h2>
        <button onClick={onClose} className="mt-2 rounded-lg px-6 py-2 bg-white font-semibold text-navy">
          Nice!
        </button>
      </div>
    </div>
  );
}
