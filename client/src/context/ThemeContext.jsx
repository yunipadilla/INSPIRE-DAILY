import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'inspire-theme-preference';
const VALID = ['light', 'dark', 'system'];
const ThemeContext = createContext(null);

function readStoredPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID.includes(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function getSystemPrefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function resolveTheme(preference, systemDark) {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

/** Keeps <html class="dark">/color-scheme in sync — mirrors the pre-paint script in index.html. */
function applyResolvedTheme(resolved) {
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

/** Collapses to a single authoritative <meta name="theme-color"> once JS is in control. */
function setThemeColorMeta(resolved) {
  const color = resolved === 'dark' ? '#12121c' : '#faf7f2';
  const tags = document.querySelectorAll('meta[name="theme-color"]');
  tags.forEach((tag, i) => {
    tag.removeAttribute('media');
    if (i === 0) tag.setAttribute('content', color);
    else tag.remove();
  });
}

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(readStoredPreference);
  const [systemDark, setSystemDark] = useState(getSystemPrefersDark);

  const resolvedTheme = resolveTheme(preference, systemDark);

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
    setThemeColorMeta(resolvedTheme);
  }, [resolvedTheme]);

  // React to OS theme changes live while 'system' is selected — resolveTheme
  // above only re-runs when systemDark changes, so this has no effect at all
  // when the user has explicitly chosen 'light' or 'dark'.
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return undefined;
    }
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setPreference = useCallback((next) => {
    if (!VALID.includes(next)) return;
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — theme still applies for this
      // page load via React state, it just won't persist across reloads.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
