/**
 * Client-safe motion helpers shared by micro-interaction components.
 * Never call these during render (SSR has no window); use them in effects only.
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Shared timings (ms) — keep micro-interactions short and consistent. */
export const MOTION = {
  reorderMs: 300,
} as const;
