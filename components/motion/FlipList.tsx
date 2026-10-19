'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { MOTION, prefersReducedMotion } from '@/lib/motion';

type FlipTag = 'div' | 'tbody' | 'ul' | 'ol';

/**
 * Animates direct children marked with `data-flip-key` to their new position when their
 * order changes between renders (FLIP via the Web Animations API).
 *
 * - Purely visual: it never reorders or touches data; the parent decides the order.
 * - First render only records positions, so initial load causes no movement.
 * - Items without a previous position (new keys, tab switches) simply appear.
 * - Positions are measured relative to the container, so scrolling never triggers motion.
 */
export default function FlipList({
  as = 'div',
  className,
  children,
}: {
  as?: FlipTag;
  className?: string;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLElement | null>(null);
  const prev = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const base = container.getBoundingClientRect().top;
    const items = Array.from(container.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.flipKey
    );

    const next = new Map<string, number>();
    for (const el of items) next.set(el.dataset.flipKey!, el.getBoundingClientRect().top - base);

    const old = prev.current;
    prev.current = next;
    if (old.size === 0 || prefersReducedMotion() || typeof Element.prototype.animate !== 'function') return;

    let enterIndex = 0;
    for (const el of items) {
      const before = old.get(el.dataset.flipKey!);
      const after = next.get(el.dataset.flipKey!);
      if (before !== undefined && after !== undefined) {
        const dy = before - after;
        if (Math.abs(dy) >= 1) {
          el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], {
            duration: MOTION.reorderMs,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
          });
        }
      } else if (old.size > 0 && before === undefined) {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: 240,
            delay: enterIndex * 35,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'both',
          }
        );
        enterIndex++;
      }
    }
  });

  const setRef = (el: HTMLElement | null) => {
    containerRef.current = el;
  };

  if (as === 'tbody') {
    return <tbody ref={setRef} className={className}>{children}</tbody>;
  }
  if (as === 'ul') {
    return <ul ref={setRef} className={className}>{children}</ul>;
  }
  if (as === 'ol') {
    return <ol ref={setRef} className={className}>{children}</ol>;
  }
  return <div ref={setRef} className={className}>{children}</div>;
}
