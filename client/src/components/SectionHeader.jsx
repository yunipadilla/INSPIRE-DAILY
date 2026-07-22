export default function SectionHeader({ icon, iconBg = '#f3f4f6', title, action }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        {icon && (
          <span className="icon-badge" style={{ background: iconBg }}>
            {icon}
          </span>
        )}
        <h2 className="text-sm font-bold text-navy uppercase tracking-wide">{title}</h2>
      </div>
      {action}
    </div>
  );
}
