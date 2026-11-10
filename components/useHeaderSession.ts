'use client';

import { useCallback, useEffect, useState } from 'react';
import { logoutAction } from '@/app/auth/actions';
import type { HeaderData } from '@/lib/fetchers';

export interface HeaderSession extends HeaderData {
  user: { id: string; email: string | null; user_metadata: { username: string | null } } | null;
}

const SIGNED_OUT: HeaderSession = { user: null, userProfile: null, activeTeam: null, unreadCount: 0 };

/**
 * Loads the signed-in user's header data from /api/session. Refetches on every navigation so the unread count and
 * the login state stay current (login and logout both end in a navigation). Keeps the previous data while
 * refetching, so only the very first load shows the loading state.
 */
export function useHeaderSession(pathname: string) {
  const [session, setSession] = useState<HeaderSession>(SIGNED_OUT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/session', { cache: 'no-store', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : SIGNED_OUT))
      .then((data: HeaderSession) => {
        setSession(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setSession(SIGNED_OUT);
        setLoading(false);
      });
    return () => controller.abort();
  }, [pathname]);

  // Clear the header immediately; logoutAction() redirects to "/", which may be the current path.
  const signOut = useCallback(async () => {
    setSession(SIGNED_OUT);
    await logoutAction();
  }, []);

  return { ...session, loading, signOut };
}
