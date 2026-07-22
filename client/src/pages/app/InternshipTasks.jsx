import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import TaskBoardCard from '../../components/tasks/TaskBoardCard';
import MyTaskCard from '../../components/tasks/MyTaskCard';
import StaffPostTask from '../../components/tasks/StaffPostTask';
import StaffTaskHub from '../../components/tasks/StaffTaskHub';
import SectionHeader from '../../components/SectionHeader';

export default function InternshipTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState(null);
  const [mySignups, setMySignups] = useState(null);
  const [hub, setHub] = useState(null);
  const [signingUpId, setSigningUpId] = useState(null);

  const isStaff = user?.appRole === 'staff';

  async function refreshAll() {
    const [board, mine] = await Promise.all([apiFetch('/tasks/board'), apiFetch('/tasks/my-tasks')]);
    setTasks(board.tasks);
    setMySignups(mine.signups);
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

      <section>
        <SectionHeader icon="📌" iconBg="#d1fae5" title="My Tasks" />
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
        <SectionHeader icon="🗂️" iconBg="#dcfce7" title="Available Tasks" />
        {availableTasks.length === 0 && <p className="text-sm text-navy/50">No open tasks right now.</p>}
        <div className="space-y-2">
          {availableTasks.map((t) => (
            <TaskBoardCard key={t.id} task={t} onSignUp={handleSignUp} signingUp={signingUpId === t.id} />
          ))}
        </div>
      </section>

      {isStaff && hub && (
        <section>
          <SectionHeader icon="🧑‍💼" iconBg="#e0e7ff" title="Staff Hub — Who's Handling What" />
          <StaffTaskHub signups={hub} />
        </section>
      )}
    </div>
  );
}
