export default function InspireLogo({ size = 40, showTagline = true, className = '' }) {
  const width = size * (220 / 64);
  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <svg width={width} height={size} viewBox="0 0 220 64" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="inspire-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="25%" stopColor="#38bdf8" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="75%" stopColor="#e879f9" />
            <stop offset="100%" stopColor="#fb7185" />
          </linearGradient>
        </defs>
        <text
          x="110"
          y="50"
          textAnchor="middle"
          fill="url(#inspire-grad)"
          fontWeight="900"
          fontSize="52"
          fontFamily="Inter, system-ui, sans-serif"
          letterSpacing="2"
        >
          INSPIRE
        </text>
      </svg>
      {showTagline && (
        <div
          className="text-[#1a1a2e] font-semibold tracking-widest -mt-1"
          style={{ fontSize: Math.max(9, size * 0.22) }}
        >
          DAILY
        </div>
      )}
    </div>
  );
}
