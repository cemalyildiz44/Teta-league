import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { MiniStatsClient } from './MiniStatsClient';

export default async function MiniStats() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Get active season
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id')
    .eq('status', 'ACTIVE')
    .single();

  let topScorers: any[] = [];
  let topAssisters: any[] = [];
  let cleanSheetPlayers: any[] = [];
  let topRatedPlayers: any[] = [];

  if (activeSeason) {
    // Fetch stats and teams concurrently
    const [ { data: stats }, { data: teams } ] = await Promise.all([
      supabase.from('player_team_season_stats').select('goals, assists, cleansheets_gk, cleansheets_def, rating_sum, rating_count, matches_played, player_id, team_id, profiles(username)').eq('season_id', activeSeason.id),
      supabase.from('teams').select('id, name, logo_url')
    ]);
    const teamMap = new Map((teams || []).map(t => [t.id, t]));

    if (stats && stats.length > 0) {
      // Format data
      const formattedStats = stats.map((s: any) => {
        const teamInfo = teamMap.get(s.team_id) as any;
        const ratingCount = Number(s.rating_count) || 0;
        const ratingSum = parseFloat(s.rating_sum) || 0;
        const avgRating = ratingCount > 0 && !isNaN(ratingSum) ? (ratingSum / ratingCount) : 0;
        return {
          playerId: s.player_id,
          playerName: (s.profiles as any)?.username || 'Bilinmiyor',
          teamId: s.team_id,
          teamName: teamInfo?.name || 'Bilinmiyor',
          teamLogo: teamInfo?.logo_url || null,
          goals: s.goals || 0,
          assists: s.assists || 0,
          cleanSheets: (s.cleansheets_gk || 0) + (s.cleansheets_def || 0),
          ratingCount: ratingCount,
          rating: avgRating,
          ratingFormatted: avgRating > 0 ? avgRating.toFixed(2) : '0.00'
        };
      });

      topScorers = [...formattedStats]
        .filter(s => s.goals > 0)
        .sort((a, b) => b.goals - a.goals)
        .slice(0, 5);

      topAssisters = [...formattedStats]
        .filter(s => s.assists > 0)
        .sort((a, b) => b.assists - a.assists)
        .slice(0, 5);

      cleanSheetPlayers = [...formattedStats]
        .filter(s => s.cleanSheets > 0)
        .sort((a, b) => b.cleanSheets - a.cleanSheets)
        .slice(0, 5);

      topRatedPlayers = [...formattedStats]
        .filter(s => s.ratingCount > 0 && s.rating > 0)
        .sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount)
        .slice(0, 5);
    }
  }

  return (
    <MiniStatsClient 
      topScorers={topScorers} 
      topAssisters={topAssisters} 
      cleanSheetPlayers={cleanSheetPlayers} 
      topRatedPlayers={topRatedPlayers}
    />
  );
}
