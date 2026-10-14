import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { slugify, compareTeamStats } from '@/app/lig/utils';
import StandingsClient, { StandingsLeagueInfo, StandingsTeamRow } from './StandingsClient';

import { getActiveSeason, getAllTeams, getActiveLeagues } from '@/lib/fetchers';

interface StandingsProps {
  compact?: boolean;
}

export default async function Standings({ compact = false }: StandingsProps) {
  const currentSeason = await getActiveSeason();

  if (!currentSeason) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-[#00e5ff] rounded-full shadow-[0_0_12px_#00e5ff]" />
          <h2 className="text-[26px] sm:text-[28px] font-[900] tracking-wide text-white uppercase">
            PUAN <span className="text-[#00e5ff]">DURUMU</span>
          </h2>
        </div>
        <div className="empty-state !py-8">
          <span className="empty-state-title">Sezon Yok</span>
          <span className="empty-state-desc">Henüz aktif sezon bulunmuyor.</span>
        </div>
      </div>
    );
  }

  const seasonId = currentSeason.id;
  const seasonSlug = currentSeason.slug || 'sezon-1';
  const seasonName = currentSeason.name || 'Sezon 1';

  // 2. Aktif sezondaki ligleri çek (memoized - UpcomingMatches ile paylaşılır)
  const leagues = await getActiveLeagues(seasonId);

  if (!leagues || leagues.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-[#00e5ff] rounded-full shadow-[0_0_12px_#00e5ff]" />
          <h2 className="text-[26px] sm:text-[28px] font-[900] tracking-wide text-white uppercase">
            PUAN <span className="text-[#00e5ff]">DURUMU</span>
          </h2>
        </div>
        <div className="empty-state !py-8">
          <span className="empty-state-title">Lig Bulunamadı</span>
          <span className="empty-state-desc">Bu sezona ait aktif lig bulunamadı.</span>
        </div>
      </div>
    );
  }

  // 3. Süperlig ve ECL liglerini belirle
  const superLigLeague = leagues.find(
    (l) => l.level === 1 || l.name.toLowerCase().includes('süper') || l.name.toLowerCase().includes('super')
  ) || leagues[0];

  const eclLeague = leagues.find(
    (l) => l.level === 2 || l.name.toLowerCase().includes('ecl')
  ) || leagues.find((l) => l.id !== superLigLeague?.id) || null;

  const targetLeagues = [superLigLeague, eclLeague].filter(Boolean) as any[];
  const targetLeagueIds = targetLeagues.map((l) => l.id);

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 4. Tüm takımları, aktif takım eşleşmelerini ve istatistikleri paralel ve tek seferde çek
  const [allTeams, { data: allLeagueTeams }, { data: allStats }] = await Promise.all([
    getAllTeams(),
    supabase
      .from('league_teams')
      .select('league_id, team_id')
      .in('league_id', targetLeagueIds)
      .eq('season_id', seasonId)
      .eq('is_active', true),
    supabase
      .from('team_season_stats')
      .select('league_id, team_id, matches_played, wins, draws, losses, goals_for, goals_against, points')
      .in('league_id', targetLeagueIds)
      .eq('season_id', seasonId),
  ]);

  const teamMap = new Map((allTeams || []).map((t: any) => [t.id, t]));
  const leagueTeamsData = allLeagueTeams || [];
  const statsData = allStats || [];

  // 5. Bellekte lig bazında puan durumu hesaplama
  function formatLeagueStandings(league: any): StandingsLeagueInfo {
    const leagueSlug = (league as any).slug || slugify(league.name);
    const leagueTeams = leagueTeamsData.filter((lt) => lt.league_id === league.id);
    const stats = statsData.filter((s) => s.league_id === league.id);

    const combinedStats = leagueTeams.map((lt) => {
      const team = teamMap.get(lt.team_id);
      const teamName = team?.name || '';
      const existing = stats.find((s) => s.team_id === lt.team_id);
      if (existing) return { ...existing, team_name: teamName };
      return {
        league_id: league.id,
        season_id: seasonId,
        team_id: lt.team_id,
        team_name: teamName,
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        points: 0,
      };
    });

    const sortedStats = [...combinedStats].sort(compareTeamStats);

    const formattedTeams: StandingsTeamRow[] = sortedStats.map((s) => {
      const team = teamMap.get(s.team_id);
      return {
        team_id: s.team_id,
        team_name: team?.name || 'Bilinmeyen Takım',
        team_slug: team?.slug || '',
        team_logo_url: team?.logo_url || null,
        matches_played: s.matches_played || 0,
        wins: s.wins || 0,
        draws: s.draws || 0,
        losses: s.losses || 0,
        goals_for: s.goals_for || 0,
        goals_against: s.goals_against || 0,
        goal_diff: (s.goals_for || 0) - (s.goals_against || 0),
        points: s.points || 0,
      };
    });

    return {
      id: league.id,
      name: league.name,
      slug: leagueSlug,
      level: league.level,
      seasonSlug: seasonSlug,
      seasonName: seasonName,
      teams: formattedTeams,
    };
  }

  const superLigData = superLigLeague ? formatLeagueStandings(superLigLeague) : null;
  const eclData = eclLeague ? formatLeagueStandings(eclLeague) : null;

  return (
    <StandingsClient
      superLig={superLigData}
      ecl={eclData}
    />
  );
}
