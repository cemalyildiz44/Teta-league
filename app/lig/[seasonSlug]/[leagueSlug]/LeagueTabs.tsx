"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function LeagueTabs({ seasonSlug, leagueSlug }: { seasonSlug: string, leagueSlug: string }) {
  const pathname = usePathname();

  const baseUrl = `/lig/${seasonSlug}/${leagueSlug}`;

  const tabs = [
    { label: "PUAN DURUMU", href: `${baseUrl}` },
    { label: "İSTATİSTİKLER", href: `${baseUrl}/istatistikler` },
    { label: "FİKSTÜR & SONUÇLAR", href: `${baseUrl}/fikstur` },
  ];

  return (
    <div className="w-full border-b border-white/5 mb-8">
      <div className="flex items-center gap-10 overflow-x-auto custom-scrollbar">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
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
    </div>
  );
}