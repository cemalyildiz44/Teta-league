import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { Metadata } from 'next';
import PlayerRankingsClient, { PlayerRanking } from './PlayerRankingsClient';

export const metadata: Metadata = {
  title: 'Oyuncular Sıralaması | Teta League',
  description: 'Teta League tarihindeki en başarılı oyuncular. Tüm zamanlar oyuncu sıralaması.',
};

export const revalidate = 60; // 1 min cache

export default async function PlayersPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1 & 2. Fetch profiles and approved matches concurrently
  const [ { data: profiles }, { data: approvedMatches } ] = await Promise.all([
    supabase.from('profiles').select('id, username, current_ea_player_id, avatar_url, platform, primary_position'),
    supabase.from('matches').select('id, home_team_id, away_team_id, home_score, away_score').eq('status', 'APPROVED')
  ]);

  const validProfiles = profiles || [];
  const profileIds = validProfiles.map(p => p.id);
  const eaPlayerIds = validProfiles.map(p => p.current_ea_player_id).filter(Boolean);

  const matchesMap = new Map();
  const approvedMatchIds: string[] = [];
  
  if (approvedMatches) {
    approvedMatches.forEach(m => {
      approvedMatchIds.push(m.id);
      matchesMap.set(m.id, m);
    });
  }

  // 3 & 4. Fetch memberships and match_player_stats concurrently
  const [ { data: memData }, { data: statsData } ] = await Promise.all([
    profileIds.length > 0 ? supabase.from('team_memberships').select('player_id').in('player_id', profileIds).is('left_at', null) : Promise.resolve({ data: [] }),
    (approvedMatchIds.length > 0 && eaPlayerIds.length > 0) ? supabase.from('match_player_stats').select('ea_player_id, match_id, team_id').in('match_id', approvedMatchIds).in('ea_player_id', eaPlayerIds) : Promise.resolve({ data: [] })
  ]);

  const memberships = memData || [];
  const contractedPlayerIds = new Set(memberships.map(m => m.player_id));
  const rawStats = statsData || [];

  // 5. Aggregate W/D/L per ea_player_id
  const statsMap = new Map<string, { wins: number, draws: number, losses: number, played: number }>();
  
  eaPlayerIds.forEach(eaId => {
    if (eaId) {
      statsMap.set(eaId, { wins: 0, draws: 0, losses: 0, played: 0 });
    }
  });

  rawStats.forEach(stat => {
    const match = matchesMap.get(stat.match_id);
    const eaId = stat.ea_player_id;
    if (!match || !eaId || !stat.team_id) return;
    
    const ps = statsMap.get(eaId);
    if (!ps) return;

    ps.played += 1;

    // Check if player's team won, drew, or lost
    const isHome = stat.team_id === match.home_team_id;
    const isAway = stat.team_id === match.away_team_id;
    
    // Safety check just in case team_id doesn't match home/away (unlikely but possible in bad data)
    if (!isHome && !isAway) return; 

    if (match.home_score > match.away_score) {
      if (isHome) ps.wins += 1;
      if (isAway) ps.losses += 1;
    } else if (match.home_score < match.away_score) {
      if (isHome) ps.losses += 1;
      if (isAway) ps.wins += 1;
    } else {
      ps.draws += 1;
    }
  });

  // 6. Build the final array
  const rankingsArray: PlayerRanking[] = validProfiles.map(p => {
    const eaId = p.current_ea_player_id as string;
    const stats = statsMap.get(eaId) || { wins: 0, draws: 0, losses: 0, played: 0 };
    
    return {
      id: p.id,
      username: p.username,
      avatarUrl: p.avatar_url,
      platform: p.platform || 'Bilinmiyor',
      position: p.primary_position || 'Bilinmiyor',
      status: contractedPlayerIds.has(p.id) ? 'CONTRACTED' : 'FREE',
      wins: stats.wins,
      draws: stats.draws,
      losses: stats.losses,
      played: stats.played,
    };
  });

  // 7. Sort Rankings
  // Primary: Wins (DESC)
  // Secondary: Played (DESC)
  // Tertiary: Losses (ASC)
  // Quaternary: Draws (DESC)
  // Quinary: Name (ASC)
  rankingsArray.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.played !== a.played) return b.played - a.played;
    if (a.losses !== b.losses) return a.losses - b.losses; // ASC for losses
    if (b.draws !== a.draws) return b.draws - a.draws;
    return a.username.localeCompare(b.username);
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-12 md:py-16">
      {/* PAGE HEADER */}
      <div className="mb-12 md:mb-16 text-center fade-in-up flex flex-col items-center">
        <span className="text-[#00e5ff] text-[11px] font-[900] tracking-[0.3em] uppercase bg-[#00e5ff]/10 px-4 py-1.5 rounded-full border border-[#00e5ff]/30 mb-6 glow-cyan-strong shadow-[0_0_20px_rgba(0,229,255,0.2)]">
          All-Time Leaderboard
        </span>
        <h1 className="text-[42px] md:text-[64px] font-[900] text-white tracking-widest uppercase mb-4 drop-shadow-[0_0_15px_rgba(0,229,255,0.4)] leading-tight">
          OYUNCULAR
        </h1>
        <p className="text-[#a0b0c0] font-medium max-w-2xl mx-auto text-[15px] md:text-[17px] leading-relaxed">
          Teta League tarihindeki en başarılı oyuncular.
        </p>
      </div>

      <div className="fade-in-up" style={{ animationDelay: '0.2s' }}>
        <PlayerRankingsClient rankings={rankingsArray} />
      </div>
    </div>
  );
}
