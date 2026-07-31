import { useEffect } from 'react';
import confetti from 'canvas-confetti';

const THEMES = {
  reading: { emoji: '📚', gradient: 'gradient-goals', colors: ['#e9d5ff', '#f9a8d4', '#818cf8'] },
  fitness: { emoji: '💪', gradient: 'gradient-goals', colors: ['#f9a8d4', '#fb7185', '#e9d5ff'] },
  learning: { emoji: '🧠', gradient: 'gradient-goals', colors: ['#818cf8', '#e9d5ff', '#38bdf8'] },
  meditation: { emoji: '🧘', gradient: 'gradient-goals', colors: ['#fed7aa', '#fef9c3', '#e9d5ff'] },
  custom: { emoji: '✨', gradient: 'gradient-goals', colors: ['#e879f9', '#e9d5ff', '#fb7185'] },
  dailyScores: { emoji: '🔥', gradient: 'gradient-daily-scores', colors: ['#bae6fd', '#60a5fa', '#818cf8'] },
  tasks: { emoji: '🏆', gradient: 'gradient-internship-tasks', colors: ['#bbf7d0', '#6ee7b7', '#38bdf8'] },
  default: { emoji: '🎉', gradient: 'gradient-rainbow', colors: ['#6ee7b7', '#38bdf8', '#818cf8', '#e879f9', '#fb7185'] },
};

export default function GoalCelebration({ message, onClose, theme = 'default' }) {
  const { emoji, gradient, colors } = THEMES[theme] || THEMES.default;

  useEffect(() => {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-6 rise-in" onClick={onClose}>
      <div
        className={`gradient-hero ${gradient} p-8 text-center space-y-3 max-w-sm`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-5xl">{emoji}</div>
        <h2 className="text-xl font-bold text-navy">{message}</h2>
        <button
          onClick={onClose}
          className="pressable mt-2 rounded-lg px-6 py-2 bg-surface-elevated font-semibold text-navy shadow-sm"
        >
          Nice!
        </button>
      </div>
    </div>
  );
}
