import { useEffect, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import TaskBoardCard from '../../components/tasks/TaskBoardCard';
import MyTaskCard from '../../components/tasks/MyTaskCard';
import StaffPostTask from '../../components/tasks/StaffPostTask';
import StaffTaskHub from '../../components/tasks/StaffTaskHub';
import SectionHeader from '../../components/SectionHeader';
import GoalCelebration from '../../components/goals/GoalCelebration';

function WeeklyHoursChart({ weeks }) {
  if (!weeks || weeks.every((w) => w.hours === 0)) return null;
  const data = weeks.map((w) => ({
    label: new Date(`${w.weekStart}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    hours: w.hours,
  }));
  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-navy/50 mb-2">Hours logged — last 6 weeks</p>
      <div style={{ width: '100%', height: 120 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'rgb(var(--color-text-muted))' }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'rgb(var(--color-surface-soft))' }}
              contentStyle={{
                background: 'rgb(var(--color-surface-elevated))',
                border: '1px solid rgb(var(--color-border) / 0.12)',
                borderRadius: 10,
                fontSize: 12,
              }}
            />
            <Bar dataKey="hours" fill="rgb(var(--color-success))" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function InternshipTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState(null);
  const [mySignups, setMySignups] = useState(null);
  const [hub, setHub] = useState(null);
  const [weeklyHours, setWeeklyHours] = useState(null);
  const [signingUpId, setSigningUpId] = useState(null);
  const [celebration, setCelebration] = useState(null);

  const isStaff = user?.appRole === 'staff';

  async function refreshAll() {
    const [board, mine, hours] = await Promise.all([
      apiFetch('/tasks/board'),
      apiFetch('/tasks/my-tasks'),
      apiFetch('/tasks/weekly-hours'),
    ]);
    setTasks(board.tasks);
    setMySignups(mine.signups);
    setWeeklyHours(hours.weeks);
    if (isStaff) {
      const hubData = await apiFetch('/tasks/hub');
      setHub(hubData.signups);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignUp(taskId) {
    setSigningUpId(taskId);
    try {
      await apiFetch(`/tasks/${taskId}/signup`, { method: 'POST' });
      await refreshAll();
    } finally {
      setSigningUpId(null);
    }
  }

  async function handleComplete(signupId, { hoursSpent, notes }) {
    await apiFetch(`/tasks/signups/${signupId}`, {
      method: 'PATCH',
      body: { status: 'completed', hoursSpent, notes },
    });
    await refreshAll();
    setCelebration('Task completed — nice work! 🏆');
  }

  async function handlePostTask(payload) {
    await apiFetch('/tasks', { method: 'POST', body: payload });
    await refreshAll();
  }

  if (!tasks || !mySignups) return <div className="py-10 text-center text-navy/50">Loading…</div>;

  const availableTasks = tasks.filter((t) => !t.mySignup);
  const inProgress = mySignups.filter((s) => s.status === 'in_progress');
  const completed = mySignups.filter((s) => s.status === 'completed');

  return (
    <div className="py-4 space-y-6">
      <h1 className="text-xl font-bold text-navy">Internship Tasks</h1>

      {isStaff && <StaffPostTask onPost={handlePostTask} />}

      <WeeklyHoursChart weeks={weeklyHours} />

      <section>
        <SectionHeader icon="✅" iconBg="rgb(var(--color-success) / 0.16)" title="Today's Checklist" />
        {inProgress.length === 0 && completed.length === 0 && (
          <p className="text-sm text-navy/50">You haven't signed up for any tasks yet.</p>
        )}
        <div className="space-y-2">
          {inProgress.map((s) => (
            <MyTaskCard key={s.id} signup={s} onComplete={handleComplete} />
          ))}
          {completed.map((s) => (
            <MyTaskCard key={s.id} signup={s} onComplete={handleComplete} />
          ))}
        </div>
      </section>

      <section>
        <SectionHeader icon="🗂️" iconBg="rgb(var(--color-mint) / 0.25)" title="Available Tasks" />
        {availableTasks.length === 0 && <p className="text-sm text-navy/50">No open tasks right now.</p>}
        <div className="space-y-2">
          {availableTasks.map((t) => (
            <TaskBoardCard key={t.id} task={t} onSignUp={handleSignUp} signingUp={signingUpId === t.id} />
          ))}
        </div>
      </section>

      {isStaff && hub && (
        <section>
          <SectionHeader icon="🧑‍💼" iconBg="rgb(var(--color-primary) / 0.16)" title="Staff Hub — Who's Handling What" />
          <StaffTaskHub signups={hub} />
        </section>
      )}

      {celebration && <GoalCelebration message={celebration} theme="tasks" onClose={() => setCelebration(null)} />}
    </div>
  );
}
