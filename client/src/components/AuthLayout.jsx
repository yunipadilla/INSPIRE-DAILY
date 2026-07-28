import InspireLogo from './InspireLogo';
import ThemeToggle from './ui/ThemeToggle';

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-appbg flex flex-col items-center justify-center px-4 py-10 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="mb-8">
        <InspireLogo size={44} />
      </div>
      <div className="card w-full max-w-md p-6 sm:p-8 shadow-sm">{children}</div>
    </div>
  );
}
