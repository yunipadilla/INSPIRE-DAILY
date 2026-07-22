import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import dailyScoresRoutes from './routes/dailyScores.js';
import homeRoutes from './routes/home.js';
import profileRoutes from './routes/profile.js';
import goalsRoutes from './routes/goals.js';
import summerChallengeRoutes from './routes/summerChallenge.js';
import internshipTasksRoutes from './routes/internshipTasks.js';
import { scheduleDailyScoresAgent } from './agents/dailyScoresAgent.js';
import { scheduleHomeAgent } from './agents/homeAgent.js';
import { scheduleGoalsAgent } from './agents/goalsAgent.js';
import { scheduleSummerChallengeAgent } from './agents/summerChallengeAgent.js';
import { scheduleInternshipTasksAgent } from './agents/internshipTasksAgent.js';

const app = express();

app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/daily-scores', dailyScoresRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/goals', goalsRoutes);
app.use('/api/summer-challenge', summerChallengeRoutes);
app.use('/api/tasks', internshipTasksRoutes);

// Serve the built React app (client/dist) from this same server in production,
// so the whole app lives on one origin — no separate frontend host, no CORS/
// cross-site-cookie complications, and only one free-tier service to run.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(env.port, () => {
  console.log(`Inspire Daily API listening on port ${env.port}`);
  if (env.databaseUrl) {
    scheduleDailyScoresAgent();
    scheduleHomeAgent();
    scheduleGoalsAgent();
    scheduleSummerChallengeAgent();
    scheduleInternshipTasksAgent();
  } else {
    console.warn('DATABASE_URL not set — background agents not started. Add server/.env to enable.');
  }
});
