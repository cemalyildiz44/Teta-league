// Building blocks for route loading.tsx skeletons. Skeletons mirror each page's real layout and render the page's
// static header text as-is, so content settles into place instead of replacing a generic placeholder.
import type { ReactNode } from 'react';

/** Placeholder block (a line of text, an avatar, an image). */
export function Sk({ className = '' }: { className?: string }) {
  return <div className={`rounded bg-white/[0.06] ${className}`} />;
}

/** Card surface matching the site's client-glass cards. */
export function SkCard({ className = '', children }: { className?: string; children?: ReactNode }) {
  return <div className={`client-glass rounded-xl border border-white/5 bg-[#01060b] ${className}`}>{children}</div>;
}

/** Root wrapper: announces loading to screen readers and pulses only the placeholders. */
export function SkeletonPage({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className} role="status" aria-live="polite">
      <span className="sr-only">{label} yükleniyor…</span>
      {children}
    </div>
  );
}

/** Centered page hero (badge, title, subtitle) with the real static text, as used on list pages. */
export function SkHero({ badge, title, subtitle }: { badge: string; title: ReactNode; subtitle: string }) {
  return (
    <div className="mb-10 md:mb-14 text-center flex flex-col items-center">
      <span className="text-[#00e5ff] text-[11px] font-[900] tracking-[0.3em] uppercase bg-[#00e5ff]/10 px-4 py-1.5 rounded-full border border-[#00e5ff]/30 mb-5 shadow-[0_0_20px_rgba(0,229,255,0.2)]">
        {badge}
      </span>
      <h1 className="text-[38px] sm:text-[46px] md:text-[60px] font-[900] text-white tracking-widest uppercase mb-4 drop-shadow-[0_0_15px_rgba(0,229,255,0.4)] leading-tight">
        {title}
      </h1>
      <p className="text-[#a0b0c0] font-medium max-w-2xl mx-auto text-[15px] md:text-[16px] leading-relaxed">{subtitle}</p>
    </div>
  );
}
