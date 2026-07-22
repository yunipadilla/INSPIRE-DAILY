import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import Signup from './pages/Signup';
import Login from './pages/Login';
import ParentalConsent from './pages/ParentalConsent';
import Home from './pages/app/Home';
import DailyScores from './pages/app/DailyScores';
import SummerChallenge from './pages/app/SummerChallenge';
import Profile from './pages/app/Profile';
import InternshipTasks from './pages/app/InternshipTasks';
import Goals from './pages/app/Goals';
import GoalTemplateSelector from './pages/app/goals/GoalTemplateSelector';
import NewReadingGoal from './pages/app/goals/NewReadingGoal';
import NewFitnessGoal from './pages/app/goals/NewFitnessGoal';
import NewLearningGoal from './pages/app/goals/NewLearningGoal';
import NewMeditationGoal from './pages/app/goals/NewMeditationGoal';
import NewCustomGoal from './pages/app/goals/NewCustomGoal';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? '/app' : '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/parental-consent" element={<ParentalConsent />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="daily-scores" element={<DailyScores />} />
            <Route path="summer-challenge" element={<SummerChallenge />} />
            <Route path="goals" element={<Goals />} />
            <Route path="tasks" element={<InternshipTasks />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route path="/app/goals/new" element={<GoalTemplateSelector />} />
          <Route path="/app/goals/new/reading" element={<NewReadingGoal />} />
          <Route path="/app/goals/new/fitness" element={<NewFitnessGoal />} />
          <Route path="/app/goals/new/learning" element={<NewLearningGoal />} />
          <Route path="/app/goals/new/meditation" element={<NewMeditationGoal />} />
          <Route path="/app/goals/new/custom" element={<NewCustomGoal />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
