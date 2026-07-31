export default function SessionSelector({ max, value, onChange }) {
  const options = Array.from({ length: max + 1 }, (_, i) => i);
  return (
    <div className="flex gap-2">
      {options.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`pressable w-10 h-10 rounded-full border font-semibold text-sm ${
            value === n ? 'border-warning bg-yellow/40 text-navy shadow-sm' : 'border-border/16 text-navy/60'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
