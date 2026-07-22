export default function ComingSoon({ title, gradientClass }) {
  return (
    <div className="py-16 text-center space-y-3">
      <div className={`w-16 h-16 rounded-2xl mx-auto ${gradientClass}`} />
      <h1 className="text-xl font-bold text-navy">{title}</h1>
      <p className="text-navy/50 text-sm">This section is coming soon in the next build phase.</p>
    </div>
  );
}
