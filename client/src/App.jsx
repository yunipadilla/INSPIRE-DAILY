import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/AppShell';
import ThemeAccountSync from './components/ThemeAccountSync';
import Signup from './pages/Signup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ParentalConsent from './pages/ParentalConsent';
import Home from './pages/app/Home';
import DailyScores from './pages/app/DailyScores';
import InspireChallenge from './pages/app/InspireChallenge';
import Profile from './pages/app/Profile';
import InternshipTasks from './pages/app/InternshipTasks';
import Goals from './pages/app/Goals';
import GoalTemplateSelector from './pages/app/goals/GoalTemplateSelector';
import NewReadingGoal from './pages/app/goals/NewReadingGoal';
import NewFitnessGoal from './pages/app/goals/NewFitnessGoal';
import NewLearningGoal from './pages/app/goals/NewLearningGoal';
import NewMeditationGoal from './pages/app/goals/NewMeditationGoal';
import NewCustomGoal from './pages/app/goals/NewCustomGoal';
import RequireHQAccess from './components/hq/RequireHQAccess';
import HQShell from './components/hq/HQShell';

// Inspire HQ is staff/admin-only and adds a meaningfully larger surface
// (charts, tables, exports) than the participant app — lazy-loaded so
// participants never pay for HQ's JS on first load.
const HQOverview = lazy(() => import('./pages/hq/Overview'));
const HQMembers = lazy(() => import('./pages/hq/Members'));
const HQMemberProfile = lazy(() => import('./pages/hq/MemberProfile'));
const HQCohorts = lazy(() => import('./pages/hq/Cohorts'));
const HQDailyScores = lazy(() => import('./pages/hq/DailyScoresHQ'));
const HQGoals = lazy(() => import('./pages/hq/GoalsHQ'));
const HQChallenge = lazy(() => import('./pages/hq/ChallengeHQ'));
const HQVolunteerHours = lazy(() => import('./pages/hq/VolunteerHoursHQ'));
const HQTasks = lazy(() => import('./pages/hq/TasksHQ'));
const HQReports = lazy(() => import('./pages/hq/Reports'));
const HQAnalytics = lazy(() => import('./pages/hq/Analytics'));
const HQSettings = lazy(() => import('./pages/hq/Settings'));

function HQLoading() {
  return <div className="py-16 text-center text-ink-muted text-sm">Loading…</div>;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? '/app' : '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeAccountSync />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/parental-consent" element={<ParentalConsent />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="daily-scores" element={<DailyScores />} />
            <Route path="inspire-challenge" element={<InspireChallenge />} />
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

        <Route element={<RequireHQAccess />}>
          <Route
            path="/hq"
            element={
              <Suspense fallback={<HQLoading />}>
                <HQShell />
              </Suspense>
            }
          >
            <Route index element={<HQOverview />} />
            <Route path="members" element={<HQMembers />} />
            <Route path="members/:id" element={<HQMemberProfile />} />
            <Route path="people/cohorts" element={<HQCohorts />} />
            <Route path="daily-scores" element={<HQDailyScores />} />
            <Route path="goals" element={<HQGoals />} />
            <Route path="challenge" element={<HQChallenge />} />
            <Route path="volunteer-hours" element={<HQVolunteerHours />} />
            <Route path="tasks" element={<HQTasks />} />
            <Route path="reports" element={<HQReports />} />
            <Route path="analytics" element={<HQAnalytics />} />
            <Route path="settings" element={<HQSettings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
