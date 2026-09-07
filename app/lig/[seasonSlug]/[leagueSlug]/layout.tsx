import { notFound } from "next/navigation";
import LeagueTabs from "./LeagueTabs";
import { getLeagueBySlugs } from "../../utils";

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ seasonSlug: string; leagueSlug: string }>;
}) {
  const resolvedParams = await params;
  const league = await getLeagueBySlugs(resolvedParams.seasonSlug, resolvedParams.leagueSlug);

  if (!league) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-8">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-white/10 pb-6 mb-8 gap-4">
        <div>
          <h1 className="text-5xl md:text-[64px] leading-[1.1] font-[900] tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] text-white tracking-widest uppercase">
            LİG <span className="text-[#00e5ff]">MERKEZİ</span>
          </h1>
        </div>
        <div className="text-right">
          <p className="text-3xl md:text-[40px] font-[800] text-[#00E5FF] tracking-tight drop-shadow-[0_0_15px_rgba(0,229,255,0.3)]">
            {league.name}
          </p>
          <p className="text-[14px] font-[700] text-[#00e5ff] tracking-widest uppercase mt-1">
            {(league.seasons as any)?.name}
          </p>
        </div>
      </div>

      {/* TABS */}
      <LeagueTabs seasonSlug={resolvedParams.seasonSlug} leagueSlug={resolvedParams.leagueSlug} />

      {/* CONTENT */}
      <div>
        {children}
      </div>
    </div>
  );
}

