import { getLeagueBySlugs } from "@/app/lig/utils";
import { notFound } from "next/navigation";
import LeagueRulesViewer from "@/components/LeagueRulesViewer";

export default async function LeagueRulesPage({
  params,
}: {
  params: Promise<{ seasonSlug: string; leagueSlug: string }>;
}) {
  const resolvedParams = await params;
  const league = await getLeagueBySlugs(resolvedParams.seasonSlug, resolvedParams.leagueSlug);

  if (!league) {
    notFound();
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-[24px] sm:text-[28px] font-black text-white tracking-widest uppercase">
          LİG <span className="text-[#00e5ff]">KURALLARI</span>
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
      </div>

      <LeagueRulesViewer 
        rules={league.rules} 
        leagueName={league.name} 
        seasonName={(league.seasons as any)?.name} 
      />
    </div>
  );
}
