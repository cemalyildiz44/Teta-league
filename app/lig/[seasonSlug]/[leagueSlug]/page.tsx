import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import Link from "next/link";
import { getLeagueBySlugs, compareTeamStats } from "../../utils";
import { notFound } from "next/navigation";
import TeamLogo from "@/components/TeamLogo";
import { getStandingsZone } from "@/lib/standingsZones";

export default async function LeagueStandingsPage({
  params,
}: {
  params: Promise<{ seasonSlug: string; leagueSlug: string }>;
}) {
  const resolvedParams = await params;
  const league = await getLeagueBySlugs(resolvedParams.seasonSlug, resolvedParams.leagueSlug);

  if (!league) {
    notFound();
  }

  const isLevel1 = league.level === 1 || resolvedParams.leagueSlug.includes("super") || league.name.toLowerCase().includes("süper");

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Fetch assigned teams from league_teams
  const { data: leagueTeamsData } = await supabase
    .from("league_teams")
    .select("team_id")
    .eq("league_id", league.id)
    .eq("is_active", true);
    
  const leagueTeams = leagueTeamsData || [];

  // 2. Fetch existing stats
  const { data: statsData } = await supabase
    .from("team_season_stats")
    .select("*")
    .eq("league_id", league.id);
    
  const stats = statsData || [];

  // 3. Fetch active penalties for this league + season
  const { data: penaltiesData } = await supabase
    .from("team_penalties")
    .select("team_id, penalty_type, points_deducted")
    .eq("league_id", league.id)
    .eq("season_id", league.season_id)
    .eq("is_revoked", false);

  const penalties = penaltiesData || [];

  // Build penalty maps: total points deducted per team, and expelled teams
  const penaltyPointsMap = new Map<string, number>();
  const expelledTeams = new Set<string>();

  for (const p of penalties) {
    if (p.penalty_type === 'EXPULSION') {
      expelledTeams.add(p.team_id);
    }
    const current = penaltyPointsMap.get(p.team_id) || 0;
    penaltyPointsMap.set(p.team_id, current + (p.points_deducted || 0));
  }

  // 4. Merge stats. If a team is in league_teams but has no stats, fallback to 0.
  const combinedStats = leagueTeams.map((lt) => {
    const existingStat = stats.find((s) => s.team_id === lt.team_id);
    if (existingStat) {
      return existingStat;
    }
    return {
      league_id: league.id,
      team_id: lt.team_id,
      matches_played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals_for: 0,
      goals_against: 0,
      points: 0,
    };
  });

  // 5. Fetch team details for display
  const { data: teams } = await supabase.from("teams").select("id, name, slug, logo_url");
  const teamMap = new Map((teams || []).map(t => [t.id, t]));

  // 6. Split into normal teams and expelled teams, then sort separately
  const normalStats = combinedStats.filter(s => !expelledTeams.has(s.team_id));
  const expelledStats = combinedStats.filter(s => expelledTeams.has(s.team_id));

  // Sort normal teams by effective points (DB points - penalty deduction)
  const sortedNormal = [...normalStats].sort((a, b) => {
    const effectiveA = Math.max(0, (a.points || 0) - (penaltyPointsMap.get(a.team_id) || 0));
    const effectiveB = Math.max(0, (b.points || 0) - (penaltyPointsMap.get(b.team_id) || 0));

    // Primary: effective points desc
    if (effectiveB !== effectiveA) return effectiveB - effectiveA;

    // Fallback: existing tiebreaker logic
    return compareTeamStats(a, b);
  });

  // Expelled teams at bottom, sorted among themselves by compareTeamStats
  const sortedExpelled = [...expelledStats].sort(compareTeamStats);

  const sortedStats = [...sortedNormal, ...sortedExpelled];

  // Check if any team has penalties (to show CEZA column)
  const hasPenalties = penaltyPointsMap.size > 0 || expelledTeams.size > 0;

  return (
    <div className="space-y-4">
      {/* ÜST BÖLÜM: BAŞLIK & METADATA (KUTUSUZ) */}
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pb-2 border-b border-white/[0.08]">
        <div>
          <h2 className="text-xl sm:text-2xl font-[800] tracking-wide text-white uppercase">
            PUAN <span className="text-[#00e5ff]">DURUMU</span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            {league.name} — Sezonun güncel puan durumu
          </p>
        </div>

        {/* SAĞ: SADE METADATA */}
        <div className="text-xs text-zinc-500 font-medium font-mono self-start sm:self-auto">
          <span>{sortedStats.length} Takım</span>
          <span className="mx-2">•</span>
          <span>{(league.seasons as any)?.name || 'Aktif Sezon'}</span>
        </div>
      </div>

      {/* FLAT TABLO (DIŞ PANEL / KUTU YOK, SAYFA YÜZEYİNDE DOĞRUDAN AKAR) */}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[700px] text-left border-collapse">
          {/* KOLON BAŞLIKLARI */}
          <thead>
            <tr className="border-b border-white/[0.08] text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              <th className="py-2.5 px-2 w-12 text-center">#</th>
              <th className="py-2.5 px-3">TAKIM</th>
              <th className="py-2.5 px-2.5 w-12 text-center" title="Oynanan Maç">O</th>
              <th className="py-2.5 px-2.5 w-12 text-center" title="Galibiyet">G</th>
              <th className="py-2.5 px-2.5 w-12 text-center" title="Beraberlik">B</th>
              <th className="py-2.5 px-2.5 w-12 text-center" title="Mağlubiyet">M</th>
              <th className="py-2.5 px-2.5 w-12 text-center hidden md:table-cell" title="Atılan Gol">AG</th>
              <th className="py-2.5 px-2.5 w-12 text-center hidden md:table-cell" title="Yenilen Gol">YG</th>
              <th className="py-2.5 px-2.5 w-12 text-center" title="Averaj">AV</th>
              {hasPenalties && (
                <th className="py-2.5 px-2.5 w-12 text-center text-rose-400" title="Ceza Puanı">CEZA</th>
              )}
              <th className="py-2.5 px-3 w-14 text-center font-bold text-zinc-300" title="Puan">P</th>
            </tr>
          </thead>

          {/* TAKIM SATIRLARI (56-64px, TRANSPARENT BG, INCE DIVIDER) */}
          <tbody className="divide-y divide-white/[0.05]">
            {sortedStats.map((stat, idx) => {
              const team = teamMap.get(stat.team_id);
              const gd = (stat.goals_for || 0) - (stat.goals_against || 0);
              const isExpelled = expelledTeams.has(stat.team_id);
              const penaltyPoints = penaltyPointsMap.get(stat.team_id) || 0;
              const effectivePoints = Math.max(0, (stat.points || 0) - penaltyPoints);
              const rank = idx + 1;
              const zone = getStandingsZone(rank, isLevel1, isExpelled);

              return (
                <tr
                  key={stat.team_id || idx}
                  className="h-14 sm:h-[58px] hover:bg-white/[0.02] transition-colors"
                >
                  {/* SIRA & SOL INCE ZONE INDICATOR */}
                  <td className="py-3 px-2 text-center">
                    <div className="flex items-center gap-1.5 justify-center">
                      <span
                        className={`w-[3px] h-5 rounded-full shrink-0 ${zone.barClass}`}
                        title={zone.label}
                      />
                      <span className="w-5 text-center text-xs sm:text-sm font-bold text-zinc-400 font-mono">
                        {isExpelled ? '—' : rank}
                      </span>
                    </div>
                  </td>

                  {/* TAKIM (LOGO + AD) */}
                  <td className="py-3 px-3">
                    <Link
                      href={`/takim/${team?.slug || ''}`}
                      className="flex items-center gap-3.5 min-w-0 group/team"
                    >
                      <TeamLogo
                        src={team?.logo_url}
                        name={team?.name}
                        size="md"
                        className="w-9 h-9 sm:w-10 sm:h-10 shrink-0"
                      />
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`font-bold text-sm sm:text-[15px] uppercase tracking-wide truncate transition-colors ${
                            isExpelled
                              ? 'text-rose-400 line-through'
                              : 'text-white group-hover/team:text-[#00e5ff]'
                          }`}
                        >
                          {team?.name || 'Bilinmeyen Takım'}
                        </span>
                        {isExpelled && (
                          <span className="px-1.5 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-[9px] font-bold uppercase tracking-wider shrink-0">
                            İHRAÇ
                          </span>
                        )}
                      </div>
                    </Link>
                  </td>

                  {/* O (Oynanan) */}
                  <td className="py-3 px-2.5 text-center text-xs sm:text-sm text-zinc-400 font-medium font-mono">
                    {stat.matches_played}
                  </td>

                  {/* G (Galibiyet) */}
                  <td className="py-3 px-2.5 text-center text-xs sm:text-sm font-medium font-mono">
                    <span className={stat.wins > 0 ? 'text-zinc-200' : 'text-zinc-600'}>
                      {stat.wins}
                    </span>
                  </td>

                  {/* B (Beraberlik) */}
                  <td className="py-3 px-2.5 text-center text-xs sm:text-sm font-medium font-mono">
                    <span className={stat.draws > 0 ? 'text-zinc-200' : 'text-zinc-600'}>
                      {stat.draws}
                    </span>
                  </td>

                  {/* M (Mağlubiyet) */}
                  <td className="py-3 px-2.5 text-center text-xs sm:text-sm font-medium font-mono">
                    <span className={stat.losses > 0 ? 'text-zinc-200' : 'text-zinc-600'}>
                      {stat.losses}
                    </span>
                  </td>

                  {/* AG (Atılan Gol - Desktop) */}
                  <td className="py-3 px-2.5 text-center text-xs sm:text-sm font-medium hidden md:table-cell font-mono">
                    <span className={stat.goals_for > 0 ? 'text-zinc-300' : 'text-zinc-600'}>
                      {stat.goals_for}
                    </span>
                  </td>

                  {/* YG (Yenilen Gol - Desktop) */}
                  <td className="py-3 px-2.5 text-center text-xs sm:text-sm font-medium hidden md:table-cell font-mono">
                    <span className={stat.goals_against > 0 ? 'text-zinc-300' : 'text-zinc-600'}>
                      {stat.goals_against}
                    </span>
                  </td>

                  {/* AV (Averaj) */}
                  <td className="py-3 px-2.5 text-center text-xs sm:text-sm font-medium font-mono">
                    {gd > 0 ? (
                      <span className="text-zinc-200">+{gd}</span>
                    ) : gd < 0 ? (
                      <span className="text-zinc-400">{gd}</span>
                    ) : (
                      <span className="text-zinc-600">0</span>
                    )}
                  </td>

                  {/* CEZA (VARSAYSA) */}
                  {hasPenalties && (
                    <td className="py-3 px-2.5 text-center text-xs sm:text-sm font-bold font-mono">
                      {penaltyPoints > 0 ? (
                        <span className="text-rose-400">-{penaltyPoints}</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  )}

                  {/* P (Puan - TETA cyan, bold) */}
                  <td className="py-3 px-3 text-center font-mono">
                    {isExpelled ? (
                      <span className="text-zinc-600 font-bold text-sm">—</span>
                    ) : (
                      <span
                        className="text-base sm:text-lg font-black text-[#00e5ff]"
                        title={penaltyPoints > 0 ? `Ham Puan: ${stat.points}, Ceza: -${penaltyPoints}` : undefined}
                      >
                        {effectivePoints}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}

            {sortedStats.length === 0 && (
              <tr>
                <td
                  colSpan={hasPenalties ? 11 : 10}
                  className="py-10 text-center text-zinc-600 font-medium text-xs sm:text-sm"
                >
                  Bu lig için henüz puan durumu verisi bulunmuyor
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ALT LEGEND (KUTUSUZ, İNCE TEK SATIR) */}
      <div className="pt-3 pb-1 flex flex-wrap items-center gap-6 text-xs text-zinc-400 font-medium border-t border-white/[0.06]">
        {isLevel1 && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Şampiyonlar Ligi (1-2)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Avrupa Ligi (3-4)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Küme Düşme (11-12)</span>
            </div>
          </>
        )}

        {isLevel1 === false && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Lig Yükselme (1)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Lig Yükselme Play-Off (2-5)</span>
            </div>
          </>
        )}

        {expelledTeams.size > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-600" />
            <span>İhraç Edilmiş</span>
          </div>
        )}
      </div>
    </div>
  );
}
