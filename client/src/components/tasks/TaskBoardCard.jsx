const LEVEL_LABELS = { intern: 'Intern', postgrad: 'Postgrad', alumni: 'Alumni', staff: 'Staff' };

export default function TaskBoardCard({ task, onSignUp, signingUp }) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-navy">{task.title}</h3>
        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-mint/30 text-ink-secondary whitespace-nowrap">
          {LEVEL_LABELS[task.level]}
        </span>
      </div>
      {task.description && <p className="text-sm text-ink-secondary">{task.description}</p>}
      <p className="text-xs text-ink-secondary">Posted by {task.postedByName}</p>
      {task.mySignup ? (
        <div className="text-xs font-semibold text-ink-secondary">Already signed up</div>
      ) : (
        <button
          onClick={() => onSignUp(task.id)}
          disabled={signingUp}
          className="btn-bubble w-full mt-1 py-2 text-sm text-navy gradient-internship-tasks"
        >
          {signingUp ? 'Signing up…' : 'Sign Up'}
        </button>
      )}
    </div>
  );
}
