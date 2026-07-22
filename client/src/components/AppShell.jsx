import { Outlet } from 'react-router-dom';
import InspireLogo from './InspireLogo';
import BottomNav from './BottomNav';
import { useAuth } from '../context/AuthContext';

export default function AppShell() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-appbg flex flex-col">
      <header className="flex justify-center py-4 bg-appbg sticky top-0 z-30">
        <InspireLogo size={32} />
      </header>
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 pb-24">
        <Outlet />
      </main>
      <BottomNav appRole={user?.appRole} />
    </div>
  );
}
