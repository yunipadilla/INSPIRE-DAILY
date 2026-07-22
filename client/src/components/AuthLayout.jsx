import InspireLogo from './InspireLogo';

export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen bg-appbg flex flex-col items-center justify-center px-4 py-10">
      <div className="mb-8">
        <InspireLogo size={44} />
      </div>
      <div className="card w-full max-w-md p-6 sm:p-8 shadow-sm">{children}</div>
    </div>
  );
}
