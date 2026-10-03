import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import AchievementsClient from './AchievementsClient';

export const metadata = {
  title: 'Başarı Yönetimi | TETA League Admin',
};

export default async function AchievementsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div>Yetkisiz erişim.</div>;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .single();

  if (!roleData) return <div>Bu sayfayı görüntüleme yetkiniz yok.</div>;

  // Tüm oyuncuları getir
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, username, full_name')
    .order('username', { ascending: true });

  // Tarihsel sezonlar (Season 1–4 gerçek seasons tablosuna kayıt oluşturmadan başarı etiketi olarak kullanılır)
  const HISTORICAL_SEASONS = [
    { id: 'HISTORICAL:TETA SEASON 1', name: 'TETA SEASON 1' },
    { id: 'HISTORICAL:TETA SEASON 2', name: 'TETA SEASON 2' },
    { id: 'HISTORICAL:TETA SEASON 3', name: 'TETA SEASON 3' },
    { id: 'HISTORICAL:TETA SEASON 4', name: 'TETA SEASON 4' },
  ];

  // Sezonları getir (COMPLETED, ACTIVE vb. tüm durumlar dahil)
  const { data: seasonsData } = await supabase
    .from('seasons')
    .select('id, name');

  // Tarihsel ve gerçek sezonları birleştirip mantıklı kronolojik sırada listele:
  // Season 1 → Season 2 → Season 3 → Season 4 → Season 5 → Season 6 ...
  const combinedSeasons = [...HISTORICAL_SEASONS, ...(seasonsData || [])];

  const sortedSeasons = combinedSeasons.sort((a, b) => {
    const nameA = a.name || '';
    const nameB = b.name || '';

    const matchA = nameA.match(/(?:sezon|season|s)\s*(\d+)/i) || nameA.match(/(\d+)\s*\.?\s*sezon/i) || nameA.match(/(\d+)/);
    const matchB = nameB.match(/(?:sezon|season|s)\s*(\d+)/i) || nameB.match(/(\d+)\s*\.?\s*sezon/i) || nameB.match(/(\d+)/);

    const numA = matchA ? parseInt(matchA[1], 10) : null;
    const numB = matchB ? parseInt(matchB[1], 10) : null;

    if (numA !== null && numB !== null && numA !== numB) {
      return numA - numB;
    }

    return nameA.localeCompare(nameB, 'tr', { numeric: true, sensitivity: 'base' });
  });

  // Maçları getir (opsiyonel, maçın oyuncusu için) - Sadece son 50 maçı alalım performans için
  const { data: matchesData } = await supabase
    .from('matches')
    .select(`
      id,
      played_at,
      home_team:league_teams!matches_league_id_season_id_home_team_id_fkey(teams(name)),
      away_team:league_teams!matches_league_id_season_id_away_team_id_fkey(teams(name))
    `)
    .order('played_at', { ascending: false })
    .limit(50);

  // Verilen başarıları listele (season_name dahil)
  const { data: achievementsData } = await supabase
    .from('player_achievements')
    .select(`
      id,
      achievement_type,
      week_number,
      month_number,
      awarded_at,
      season_name,
      profile:player_id(username, full_name),
      season:season_id(name),
      match:match_id(
        id,
        played_at,
        home_team:league_teams!matches_league_id_season_id_home_team_id_fkey(teams(name)),
        away_team:league_teams!matches_league_id_season_id_away_team_id_fkey(teams(name))
      )
    `)
    .order('awarded_at', { ascending: false })
    .limit(100);

  const formatTeam = (leagueTeam: any) => {
    if (!leagueTeam) return null;
    const teamObj = Array.isArray(leagueTeam.teams) ? leagueTeam.teams[0] : leagueTeam.teams;
    return { name: teamObj?.name || leagueTeam.name || '' };
  };

  const formattedMatches = (matchesData || []).map((m: any) => ({
    ...m,
    home_team: formatTeam(m.home_team),
    away_team: formatTeam(m.away_team),
  }));

  const formattedAchievements = (achievementsData || []).map((a: any) => ({
    ...a,
    match: a.match
      ? {
          ...a.match,
          home_team: formatTeam(a.match.home_team),
          away_team: formatTeam(a.match.away_team),
        }
      : null,
  }));

  return (
    <div>
      <AchievementsClient 
        profiles={profilesData || []} 
        seasons={sortedSeasons} 
        matches={formattedMatches} 
        achievements={formattedAchievements} 
      />
    </div>
  );
}
