export default function CircleCheck({ label, sublabel, checked, onChange, points }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="pressable w-full flex items-start gap-3 text-left"
    >
      <span
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
          checked ? 'border-[#f59e0b] bg-[#f59e0b]' : 'border-[#d1d5db]'
        }`}
      >
        {checked && <span className="w-2 h-2 rounded-full bg-white" />}
      </span>
      <span className="flex-1">
        <span className="block text-sm text-navy">{label}</span>
        {sublabel && <span className="block text-xs text-navy/50 mt-0.5">{sublabel}</span>}
      </span>
      {points && <span className="text-sm font-bold text-[#f59e0b] whitespace-nowrap">{points}</span>}
    </button>
  );
}
