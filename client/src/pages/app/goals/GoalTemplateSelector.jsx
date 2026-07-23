import { useNavigate } from 'react-router-dom';
import FullScreenPage from '../../../components/FullScreenPage';

const TEMPLATES = [
  { path: 'reading', emoji: '📚', name: 'Reading Goal', desc: 'Track books and pages read' },
  { path: 'fitness', emoji: '💪', name: 'Fitness Goal', desc: 'Daily target or weekly schedule' },
  { path: 'learning', emoji: '🧠', name: 'Learning Goal', desc: 'Track minutes practiced toward a subject' },
  { path: 'meditation', emoji: '🧘', name: 'Meditation Goal', desc: 'Build a daily mindfulness practice' },
  { path: 'custom', emoji: '⭐', name: 'Custom Goal', desc: 'Yes/No check-in, counter, or timer' },
];

export default function GoalTemplateSelector() {
  const navigate = useNavigate();
  return (
    <FullScreenPage title="New Goal">
      <div className="space-y-3 pt-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.path}
            onClick={() => navigate(`/app/goals/new/${t.path}`)}
            className="pressable card card-lift w-full p-4 flex items-center gap-3 text-left"
          >
            <span className="icon-badge w-12 h-12 text-2xl" style={{ background: '#fae8ff' }}>
              {t.emoji}
            </span>
            <div>
              <div className="font-semibold text-navy">{t.name}</div>
              <div className="text-sm text-navy/50">{t.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </FullScreenPage>
  );
}
