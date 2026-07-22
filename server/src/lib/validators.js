import { z } from 'zod';
import { ALL_APP_ROLES } from '../repositories/users.js';

export const signupSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required.'),
    lastName: z.string().trim().min(1, 'Last name is required.'),
    birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Birthday is required.'),
    email: z.string().trim().email('A valid email is required.'),
    password: z.string().min(8, 'Password must be at least 8 characters.'),
    phone: z.string().trim().optional().or(z.literal('')),
    profilePhotoUrl: z.string().trim().optional().or(z.literal('')),
    appRole: z.enum(ALL_APP_ROLES, { errorMap: () => ({ message: 'A valid role is required.' }) }),
    quoteOfDay: z.boolean().optional(),
    parentGuardianEmail: z.string().trim().email().optional().or(z.literal('')),
  })
  .strict();

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const score = z.number().int().min(1).max(10);
export const dailyScoreSchema = z.object({
  displayName: z.string().trim().min(1, 'Your name is required.'),
  challenges: z.string().trim().optional().or(z.literal('')),
  earnedWay: z.boolean(),
  volunteerHours: z.number().min(0).max(12),
  bestSelf: score,
  ceoMindset: score,
  grit: score,
  happiness: score,
  sleep: score,
  goalsWorkedOn: z.string().trim().optional().or(z.literal('')),
});
