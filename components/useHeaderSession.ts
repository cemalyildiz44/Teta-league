'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { logoutAction } from '@/app/auth/actions';
import type { HeaderData } from '@/lib/fetchers';

export interface HeaderSession extends HeaderData {
  user: { id: string; email: string | null; user_metadata: { username: string | null } } | null;
}

const SIGNED_OUT: HeaderSession = { user: null, userProfile: null, activeTeam: null, unreadCount: 0 };

// Header data is kept for up to a minute instead of being refetched on every navigation. Pages where the
// session or the unread count can change (sign-in/up, password, profile, notifications, auth callbacks) always
// refresh it when entered or left.
const MAX_AGE_MS = 60_000;
const REFRESH_PATH_PREFIXES = ['/giris', '/kayit', '/sifre', '/auth', '/profil', '/bildirimler'];
const affectsSession = (path: string | null) => !!path && REFRESH_PATH_PREFIXES.some((p) => path.startsWith(p));

/**
 * Loads the signed-in user's header data from /api/session. Only the very first load shows the loading state;
 * later refreshes keep the current data on screen.
 */
export function useHeaderSession(pathname: string) {
  const [session, setSession] = useState<HeaderSession>(SIGNED_OUT);
  const [loading, setLoading] = useState(true);
  const fetchedAt = useRef(0);
  const lastPath = useRef<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    fetch('/api/session', { cache: 'no-store', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : SIGNED_OUT))
      .then((data: HeaderSession) => {
        fetchedAt.current = Date.now();
        setSession(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setSession(SIGNED_OUT);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    const stale = Date.now() - fetchedAt.current > MAX_AGE_MS;
    const mustRefresh = stale || affectsSession(lastPath.current) || affectsSession(pathname);
    lastPath.current = pathname;
    if (mustRefresh) refresh();
  }, [pathname, refresh]);

  // Coming back to the tab after a while: refresh stale data (e.g. new notifications)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - fetchedAt.current > MAX_AGE_MS) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      inFlight.current?.abort();
    };
  }, [refresh]);

  // Clear the header immediately; logoutAction() redirects to "/", which may be the current path.
  const signOut = useCallback(async () => {
    inFlight.current?.abort();
    fetchedAt.current = 0;
    setSession(SIGNED_OUT);
    await logoutAction();
  }, []);

  return { ...session, loading, signOut };
}
