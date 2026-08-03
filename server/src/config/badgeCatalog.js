// The controlled set of badges staff can manually award from Inspire HQ.
// Deliberately a static, versioned list rather than a database table — it
// keeps "what badges exist" reviewable in code review like any other
// business rule, and the award endpoint validates every request against
// this exact list, so an arbitrary badge name can never reach the database.
// `badgeType` must be one of the four values the `badges.badge_type` CHECK
// constraint already allows: event | staff | skills | milestone.
export const BADGE_CATALOG = [
  {
    key: 'welcome-bash',
    badgeType: 'event',
    name: 'Welcome Bash',
    description: 'Attended the program welcome event.',
    iconEmoji: '🎉',
  },
  {
    key: 'community-day',
    badgeType: 'event',
    name: 'Community Day',
    description: 'Participated in a community service event.',
    iconEmoji: '🤝',
  },
  {
    key: 'showcase-presenter',
    badgeType: 'event',
    name: 'Showcase Presenter',
    description: 'Presented at a program showcase.',
    iconEmoji: '🎤',
  },
  {
    key: 'team-player',
    badgeType: 'staff',
    name: 'Team Player',
    description: 'Recognized by staff for exceptional teamwork.',
    iconEmoji: '⭐',
  },
  {
    key: 'above-and-beyond',
    badgeType: 'staff',
    name: 'Above & Beyond',
    description: "Recognized by staff for going above and beyond expectations.",
    iconEmoji: '🌟',
  },
  {
    key: 'leadership',
    badgeType: 'staff',
    name: 'Leadership',
    description: 'Recognized by staff for demonstrating leadership.',
    iconEmoji: '🧭',
  },
  {
    key: 'public-speaking',
    badgeType: 'skills',
    name: 'Public Speaking',
    description: 'Demonstrated strong public speaking skills.',
    iconEmoji: '🗣️',
  },
  {
    key: 'writing',
    badgeType: 'skills',
    name: 'Writing',
    description: 'Demonstrated strong written communication skills.',
    iconEmoji: '✍️',
  },
  {
    key: 'problem-solver',
    badgeType: 'skills',
    name: 'Problem Solver',
    description: 'Demonstrated strong problem-solving skills.',
    iconEmoji: '🧩',
  },
  {
    key: 'thirty-day-streak',
    badgeType: 'milestone',
    name: '30-Day Streak',
    description: 'Reached a 30-day Daily Scores streak.',
    iconEmoji: '🔥',
  },
  {
    key: 'goal-crusher',
    badgeType: 'milestone',
    name: 'Goal Crusher',
    description: 'Completed five or more goals.',
    iconEmoji: '🏁',
  },
  {
    key: 'program-graduate',
    badgeType: 'milestone',
    name: 'Program Graduate',
    description: 'Completed the full program.',
    iconEmoji: '🎓',
  },
];

export function findBadgeCatalogEntry(key) {
  return BADGE_CATALOG.find((b) => b.key === key) || null;
}
