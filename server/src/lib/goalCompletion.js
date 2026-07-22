import { ptDateString } from '../config/pacificTime.js';

/**
 * Server-side auto-completion rule per goal type. Called immediately after
 * any log/progress-update action, and swept periodically by the Goals
 * background agent as a self-healing safety net against missed triggers.
 * Returns true if the goal should now be marked completed.
 */
export function isGoalComplete(goal, { books = [], logs = [] } = {}) {
  if (goal.completed) return false;

  switch (goal.type) {
    case 'reading':
      return books.length > 0 && books.every((b) => b.completed);

    case 'learning': {
      const totalMinutes = logs
        .filter((l) => l.log_type === 'session')
        .reduce((sum, l) => sum + Number(l.value || 0), 0);
      return totalMinutes >= (goal.details.targetMinutes || Infinity);
    }

    case 'meditation': {
      const days = new Set(logs.filter((l) => l.log_type === 'completed').map((l) => l.date));
      return days.size >= (goal.details.totalDurationDays || Infinity);
    }

    case 'fitness_daily': {
      const days = new Set(logs.filter((l) => l.log_type === 'completed').map((l) => l.date));
      return days.size >= (goal.details.totalDays || Infinity);
    }

    case 'custom': {
      if (goal.details.measureType === 'yesno') return false; // manual completion only
      return Number(goal.details.current || 0) >= Number(goal.details.target || Infinity);
    }

    case 'fitness_weekly':
    default:
      return false; // ongoing / manual completion only
  }
}

export const today = () => ptDateString();
