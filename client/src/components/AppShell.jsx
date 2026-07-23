import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import InspireLogo from './InspireLogo';
import BottomNav from './BottomNav';
import { useAuth } from '../context/AuthContext';

export default function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-screen bg-appbg flex flex-col">
      <header className="flex justify-center py-4 bg-appbg sticky top-0 z-30">
        <InspireLogo size={32} />
      </header>
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 pb-24">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomNav appRole={user?.appRole} />
    </div>
  );
}
