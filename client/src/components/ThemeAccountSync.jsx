import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiFetch } from '../lib/api';

/**
 * Bridges the local theme preference with the signed-in user's account, so
 * the setting can follow them across devices once server support exists
 * (users.theme_preference — see the reviewed-but-not-yet-applied migration).
 * Every call here fails silently: until that column exists, the PATCH just
 * 404s and is ignored. localStorage remains the source of truth for the
 * current device regardless of server state.
 */
export default function ThemeAccountSync() {
  const { user } = useAuth();
  const { preference, setPreference } = useTheme();
  const adoptedForUserId = useRef(null);

  // On login, adopt the account's saved preference once per session per
  // user — lets switching devices pick up where you left off, without
  // fighting a preference you deliberately change afterward on this device.
  useEffect(() => {
    if (!user || adoptedForUserId.current === user.id) return;
    adoptedForUserId.current = user.id;
    if (user.themePreference) setPreference(user.themePreference);
  }, [user, setPreference]);

  // Push local changes up to the account, best-effort.
  useEffect(() => {
    if (!user) return;
    apiFetch('/profile/theme', { method: 'PATCH', body: { themePreference: preference } }).catch(() => {});
  }, [user, preference]);

  return null;
}
