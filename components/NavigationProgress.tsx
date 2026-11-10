'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Thin progress bar at the top of the page during client-side navigations. Pages without a loading.tsx keep the
// old page on screen until the new one is ready; this gives immediate feedback that the click registered.
// It starts on clicks to internal links and finishes when the URL changes. Navigations faster than SHOW_DELAY_MS
// (cached pages) never show it, so instant pages do not flicker.

const SHOW_DELAY_MS = 120;
const GIVE_UP_MS = 12000;

type Phase = 'idle' | 'loading' | 'done';

function isInternalNavigation(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.('a');
  if (!anchor || !anchor.href) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  // Same page (including hash-only links) does not navigate
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>('idle');
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giveUpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    const clearTimers = () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
    };
    const onClick = (event: MouseEvent) => {
      if (!isInternalNavigation(event)) return;
      clearTimers();
      pending.current = true;
      showTimer.current = setTimeout(() => {
        if (pending.current) setPhase('loading');
      }, SHOW_DELAY_MS);
      giveUpTimer.current = setTimeout(() => {
        pending.current = false;
        setPhase('idle');
      }, GIVE_UP_MS);
    };
    // Capture phase so the click is seen even if a handler stops propagation
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      clearTimers();
    };
  }, []);

  // The URL changed: the navigation finished
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    if (showTimer.current) clearTimeout(showTimer.current);
    if (giveUpTimer.current) clearTimeout(giveUpTimer.current);
    setPhase((current) => (current === 'loading' ? 'done' : 'idle'));
  }, [pathname, searchParams]);

  // Let the bar reach 100% and fade before resetting
  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(() => setPhase('idle'), 350);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      style={{ opacity: phase === 'idle' ? 0 : 1, transition: phase === 'done' ? 'opacity 250ms ease 100ms' : 'none' }}
    >
      <div
        className="h-full bg-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.8)]"
        style={{
          width: phase === 'idle' ? '0%' : phase === 'loading' ? '85%' : '100%',
          // Fast start, then a long slow crawl toward 85% while waiting; snaps to 100% when done
          transition:
            phase === 'loading'
              ? 'width 8s cubic-bezier(0.08, 0.82, 0.17, 1)'
              : phase === 'done'
                ? 'width 150ms ease-out'
                : 'none',
        }}
      />
    </div>
  );
}
