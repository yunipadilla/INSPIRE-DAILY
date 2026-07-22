const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  // Absolute paths: Tailwind resolves relative `content` globs against
  // process.cwd(), not this config file's directory — and this app can be
  // launched with a different cwd (see .claude/launch.json), so relative
  // globs would silently match zero files.
  content: [path.join(__dirname, 'index.html'), path.join(__dirname, 'src/**/*.{js,jsx}')],
  theme: {
    extend: {
      colors: {
        navy: '#1a1a2e',
        appbg: '#fafafa',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
