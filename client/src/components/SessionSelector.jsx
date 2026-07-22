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
            value === n ? 'border-[#f59e0b] bg-[#fef9c3] text-navy shadow-sm' : 'border-[#e5e5e5] text-navy/60'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
