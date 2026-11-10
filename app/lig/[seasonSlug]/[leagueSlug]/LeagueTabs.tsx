"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function LeagueTabs({ seasonSlug, leagueSlug }: { seasonSlug: string, leagueSlug: string }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  const baseUrl = `/lig/${seasonSlug}/${leagueSlug}`;

  const tabs = [
    { label: "PUAN DURUMU", href: `${baseUrl}` },
    { label: "İSTATİSTİKLER", href: `${baseUrl}/istatistikler` },
    { label: "FİKSTÜR & SONUÇLAR", href: `${baseUrl}/fikstur` },
    { label: "LİG KURALLARI", href: `${baseUrl}/kurallar` },
  ];

  // On phones the tab row scrolls sideways; keep the active tab in view (e.g. when opening Fikstür directly)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <div className="relative w-full border-b border-white/5 mb-8">
      <div className="flex items-center gap-6 sm:gap-10 overflow-x-auto custom-scrollbar pr-8 sm:pr-0">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={isActive ? activeRef : undefined}
              className={`relative pb-4 text-[15px] font-[800] tracking-widest whitespace-nowrap transition-colors duration-300 ${
                isActive
                  ? "text-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#00E5FF] shadow-[0_0_12px_rgba(0,229,255,1)] rounded-t-sm" />
              )}
            </Link>
          );
        })}
      </div>
      {/* Fade on the right edge hints that more tabs are reachable by scrolling (phones only) */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-[#050a0f] to-transparent sm:hidden" aria-hidden="true" />
    </div>
  );
}
