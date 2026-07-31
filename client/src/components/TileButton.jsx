export default function TileButton({ label, sublabel, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable flex-1 rounded-xl border px-3 py-3 text-center transition ${
        active ? 'border-warning bg-yellow/40 font-semibold shadow-sm' : 'border-border/16 bg-surface-elevated'
      }`}
    >
      <div className="text-sm text-navy">{label}</div>
      {sublabel && <div className="text-xs text-navy/50 mt-0.5">{sublabel}</div>}
    </button>
  );
}
