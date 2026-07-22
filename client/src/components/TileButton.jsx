export default function TileButton({ label, sublabel, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`pressable flex-1 rounded-xl border px-3 py-3 text-center transition ${
        active ? 'border-[#f59e0b] bg-[#fef9c3] font-semibold shadow-sm' : 'border-[#e5e5e5] bg-white'
      }`}
    >
      <div className="text-sm text-navy">{label}</div>
      {sublabel && <div className="text-xs text-navy/50 mt-0.5">{sublabel}</div>}
    </button>
  );
}
