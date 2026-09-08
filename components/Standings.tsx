import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { slugify, compareTeamStats } from '@/app/lig/utils';
import StandingsClient, { StandingsLeagueInfo, StandingsTeamRow } from './StandingsClient';

interface StandingsProps {
  compact?: boolean;
}

export default async function Standings({ compact = false }: StandingsProps) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Aktif sezonu bul (veya en son sezon)
  const { data: activeSeason, error: seasonError } = await supabase
    .from('seasons')
    .select('id, name, slug, status')
    .eq('status', 'ACTIVE')
    .maybeSingle();

  let season = activeSeason;
  if (!season) {
    const { data: latestSeason } = await supabase
      .from('seasons')
      .select('id, name, slug, status')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    season = latestSeason;
  }

  if (seasonError || !season) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-[#00e5ff] rounded-full shadow-[0_0_12px_#00e5ff]" />
          <h2 className="text-[26px] sm:text-[28px] font-[900] tracking-wide text-white uppercase">
            PUAN <span className="text-[#00e5ff]">DURUMU</span>
          </h2>
        </div>
        <div className="empty-state !py-8">
          <span className="empty-state-title">
            {seasonError ? 'Veri Alınamadı' : 'Sezon Yok'}
          </span>
          <span className="empty-state-desc">
            {seasonError ? 'Puan durumu yüklenirken bir sorun oluştu.' : 'Henüz aktif sezon bulunmuyor.'}
          </span>
        </div>
      </div>
    );
  }

  const currentSeason = season;

  // 2. Aktif sezondaki ligleri çek
  const { data: leagues, error: leaguesError } = await supabase
    .from('leagues')
    .select('*')
    .eq('season_id', currentSeason.id)
    .order('level', { ascending: true });

  if (leaguesError || !leagues || leagues.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-[#00e5ff] rounded-full shadow-[0_0_12px_#00e5ff]" />
          <h2 className="text-[26px] sm:text-[28px] font-[900] tracking-wide text-white uppercase">
            PUAN <span className="text-[#00e5ff]">DURUMU</span>
          </h2>
        </div>
        <div className="empty-state !py-8">
          <span className="empty-state-title">
            {leaguesError ? 'Veri Alınamadı' : 'Lig Yok'}
          </span>
          <span className="empty-state-desc">
            {leaguesError ? 'Lig bilgileri alınırken bir sorun oluştu.' : 'Henüz aktif lig bulunmuyor.'}
          </span>
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

  // 4. Takım bilgilerini toplu çek (N+1 engellemek için)
  const { data: allTeams } = await supabase
    .from('teams')
    .select('id, name, slug, logo_url');
  const teamMap = new Map((allTeams || []).map((t) => [t.id, t]));

  // 5. Lig bazında puan durumu hesaplama yardımcısı
  async function fetchLeagueStandings(league: any): Promise<StandingsLeagueInfo> {
    const leagueSlug = (league as any).slug || slugify(league.name);

    // Aktif takım eşleşmelerini çek
    const { data: ltData } = await supabase
      .from('league_teams')
      .select('team_id')
      .eq('league_id', league.id)
      .eq('season_id', currentSeason.id)
      .eq('is_active', true);

    const leagueTeams = ltData || [];

    // İlgili sezon ve lige ait istatistikleri çek
    const { data: statsData } = await supabase
      .from('team_season_stats')
      .select('*')
      .eq('league_id', league.id)
      .eq('season_id', currentSeason.id);

    const stats = statsData || [];

    // league_teams'teki ancak henüz istatistiği oluşmamış takımlar için 0 varsayılanı
    const combinedStats = leagueTeams.map((lt) => {
      const existing = stats.find((s) => s.team_id === lt.team_id);
      if (existing) return existing;
      return {
        league_id: league.id,
        season_id: currentSeason.id,
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

    // Ortak tiebreaker comparator ile birebir sırala
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
      seasonSlug: currentSeason.slug,
      seasonName: currentSeason.name,
      teams: formattedTeams,
    };
  }

  // 6. Her iki ligi paralel çek
  const [superLigData, eclData] = await Promise.all([
    superLigLeague ? fetchLeagueStandings(superLigLeague) : Promise.resolve(null),
    eclLeague ? fetchLeagueStandings(eclLeague) : Promise.resolve(null),
  ]);

  return (
    <StandingsClient
      superLig={superLigData}
      ecl={eclData}
    />
  );
}
