import { AnimatePresence, motion } from 'framer-motion';

export default function ScoreSlider({ label, question, lowLabel, highLabel, value, onChange }) {
  const pct = ((value - 1) / 9) * 100;

  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-navy/50">{label}</p>
      <p className="text-sm font-medium text-navy mt-1 mb-6">{question}</p>

      <div className="relative">
        <div className="absolute -top-9 flex justify-center" style={{ left: `calc(${pct}% - 20px)`, width: 40 }}>
          <AnimatePresence mode="popLayout">
            <motion.div
              key={value}
              initial={{ scale: 0.6, opacity: 0, y: 6 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.6, opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="w-10 h-10 rounded-full bg-[#60a5fa] text-white font-bold flex items-center justify-center shadow-sm"
            >
              {value}
            </motion.div>
          </AnimatePresence>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-[#60a5fa]"
        />
      </div>

      <div className="flex justify-between text-xs text-navy/40 mt-1">
        <span>1 — {lowLabel}</span>
        <span>10 — {highLabel}</span>
      </div>
    </div>
  );
}
