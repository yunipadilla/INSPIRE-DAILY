const VARIANT_CLASS = {
  primary: 'btn-bubble',
  secondary: 'btn-secondary',
  destructive: 'btn-destructive',
};

/**
 * The app's three button treatments, sharing one shape/motion language
 * (defined in index.css). Primary keeps the existing per-tab gradient
 * identity via the `gradient` prop (gradient-rainbow, gradient-goals, …) —
 * secondary/destructive are fixed, theme-token colored.
 */
export default function Button({
  variant = 'primary',
  gradient = 'gradient-rainbow',
  className = '',
  children,
  ...props
}) {
  const variantClass = VARIANT_CLASS[variant] || VARIANT_CLASS.primary;
  const colorClass = variant === 'primary' ? `${gradient} text-white` : '';
  return (
    <button className={`${variantClass} ${colorClass} pressable min-h-[44px] px-5 ${className}`} {...props}>
      {children}
    </button>
  );
}
