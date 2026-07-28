const path = require('path');

// Every semantic color below reads a CSS custom property defined in
// src/index.css (light values under :root, dark overrides under :root.dark)
// via the `rgb(var(--x) / <alpha-value>)` pattern — this is what lets
// existing utility usage everywhere in the app (text-navy, bg-appbg,
// text-navy/50, etc.) automatically become theme-aware with zero JSX
// changes, and lets new components opt into the same tokens. Never hardcode
// a hex value directly in a className — add or reuse a token here instead.
function token(name) {
  return `rgb(var(${name}) / <alpha-value>)`;
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Absolute paths: Tailwind resolves relative `content` globs against
  // process.cwd(), not this config file's directory — and this app can be
  // launched with a different cwd (see .claude/launch.json), so relative
  // globs would silently match zero files.
  content: [path.join(__dirname, 'index.html'), path.join(__dirname, 'src/**/*.{js,jsx}')],
  // 'class' (not the default 'media'): a user-selected Light/Dark/System
  // preference must be able to override the OS setting, which requires
  // toggling a class on <html> rather than relying purely on the
  // prefers-color-scheme media query.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Legacy names, now token-backed (previously hardcoded hex) — every
        // existing text-navy / bg-appbg / text-navy/NN usage across the app
        // picks up light/dark automatically.
        navy: token('--color-text-primary'),
        appbg: token('--color-bg'),

        // Semantic surface tokens
        surface: {
          elevated: token('--color-surface-elevated'),
          soft: token('--color-surface-soft'),
          interactive: token('--color-surface-interactive'),
        },
        ink: {
          primary: token('--color-text-primary'),
          secondary: token('--color-text-secondary'),
          muted: token('--color-text-muted'),
        },
        border: token('--color-border'),
        focusring: token('--color-focus-ring'),

        // Brand + status tokens
        primary: token('--color-primary'),
        success: token('--color-success'),
        warning: token('--color-warning'),
        danger: token('--color-danger'),
        lavender: token('--color-lavender'),
        blue: token('--color-blue'),
        peach: token('--color-peach'),
        mint: token('--color-mint'),
        yellow: token('--color-yellow'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fredoka', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
