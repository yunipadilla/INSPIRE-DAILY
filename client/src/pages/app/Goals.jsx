import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import GoalsOverview from '../../components/goals/GoalsOverview';
import ReadingGoalCard from '../../components/goals/ReadingGoalCard';
import FitnessDailyGoalCard from '../../components/goals/FitnessDailyGoalCard';
import FitnessWeeklyGoalCard from '../../components/goals/FitnessWeeklyGoalCard';
import LearningGoalCard from '../../components/goals/LearningGoalCard';
import MeditationGoalCard from '../../components/goals/MeditationGoalCard';
import CustomGoalCard from '../../components/goals/CustomGoalCard';
import GoalCelebration from '../../components/goals/GoalCelebration';
import SectionHeader from '../../components/SectionHeader';

const CARD_BY_TYPE = {
  reading: ReadingGoalCard,
  fitness_daily: FitnessDailyGoalCard,
  fitness_weekly: FitnessWeeklyGoalCard,
  learning: LearningGoalCard,
  meditation: MeditationGoalCard,
  custom: CustomGoalCard,
};

export default function Goals() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [celebration, setCelebration] = useState(null);

  async function refresh() {
    const d = await apiFetch('/goals');
    setData(d);
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!data) return <div className="py-10 text-center text-navy/50">Loading…</div>;

  return (
    <div className="py-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Goals</h1>
        <button
          onClick={() => navigate('/app/goals/new')}
          className="pressable rounded-lg px-4 py-2 text-sm font-semibold text-navy gradient-goals shadow-sm"
        >
          + New Goal
        </button>
      </div>

      <GoalsOverview overview={data.overview} />

      <section className="space-y-3">
        {data.active.length === 0 && <p className="text-sm text-navy/50">No active goals yet — create one to get started!</p>}
        {data.active.map((goal) => {
          const Card = CARD_BY_TYPE[goal.type];
          return Card ? (
            <Card key={goal.id} goal={goal} onRefresh={refresh} onCelebrate={setCelebration} />
          ) : null;
        })}
      </section>

      {data.completed.length > 0 && (
        <section>
          <SectionHeader icon="✅" iconBg="#d1fae5" title="Completed Goals" />
          <div className="space-y-2">
            {data.completed.map((g) => (
              <div key={g.id} className="card p-3 flex items-center justify-between">
                <span className="text-sm font-medium text-navy">{g.name}</span>
                <span className="text-xs text-navy/40">✅ {g.completedDate}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {celebration && <GoalCelebration message={celebration} onClose={() => setCelebration(null)} />}
    </div>
  );
}
