import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { Metadata } from 'next';
import PlayerRankingsClient, { PlayerRanking } from './PlayerRankingsClient';
import { calculateMarketValue, MarketValueInput } from '@/app/utils/marketValueCalculator';

export const metadata: Metadata = {
  title: 'Oyuncular Sıralaması | Teta League',
  description: 'Teta League tarihindeki en değerli oyuncular. Oyuncu piyasa değeri sıralaması.',
};

export const revalidate = 60; // 1 min cache

export default async function PlayersPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Fetch all profiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, current_ea_player_id, avatar_url, platform, primary_position, alternative_positions');

  const validProfiles = profiles || [];
  const profileIds = validProfiles.map(p => p.id);
  const eaPlayerIds = validProfiles.map(p => p.current_ea_player_id).filter(Boolean) as string[];

  // 2, 3, 4. Fetch memberships, match stats, and achievements concurrently (Bulk Queries - No N+1)
  const [ { data: memData }, { data: bulkStats }, { data: bulkAchievements } ] = await Promise.all([
    profileIds.length > 0
      ? supabase.from('team_memberships').select('player_id').in('player_id', profileIds).is('left_at', null)
      : Promise.resolve({ data: [] }),
    eaPlayerIds.length > 0
      ? supabase
          .from('match_player_stats')
          .select('ea_player_id, team_id, goals, assists, rating, cleansheets_gk, cleansheets_def, red_cards, matches!inner(home_team_id, away_team_id, home_score, away_score, status, season_id)')
          .in('ea_player_id', eaPlayerIds)
          .eq('matches.status', 'APPROVED')
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? supabase
          .from('player_achievements')
          .select('player_id, achievement_type, season_id')
          .in('player_id', profileIds)
      : Promise.resolve({ data: [] })
  ]);

  const memberships = memData || [];
  const contractedPlayerIds = new Set(memberships.map(m => m.player_id));

  // Index achievements by profile id
  const achByProfile = new Map<string, any[]>();
  if (bulkAchievements) {
    bulkAchievements.forEach(a => {
      if (!achByProfile.has(a.player_id)) achByProfile.set(a.player_id, []);
      achByProfile.get(a.player_id)!.push(a);
    });
  }

  // Index match stats by ea_player_id
  const statsByEaId = new Map<string, any[]>();
  if (bulkStats) {
    bulkStats.forEach((s: any) => {
      if (!statsByEaId.has(s.ea_player_id)) statsByEaId.set(s.ea_player_id, []);
      statsByEaId.get(s.ea_player_id)!.push(s);
    });
  }

  // Calculate Market Value for each player
  const rankingsArray: PlayerRanking[] = validProfiles.map(p => {
    const eaId = p.current_ea_player_id as string;
    const pStatsList = eaId ? statsByEaId.get(eaId) || [] : [];

    let tM = 0, tW = 0, tD = 0, tL = 0, tG = 0, tA = 0, tCGK = 0, tCDEF = 0, tRC = 0;
    const sMap = new Map<string, { season_id: string, rating_sum: number, rating_count: number }>();

    pStatsList.forEach((s: any) => {
      tM++;
      tG += s.goals || 0;
      tA += s.assists || 0;
      tRC += s.red_cards || 0;
      tCGK += s.cleansheets_gk || 0;
      tCDEF += s.cleansheets_def || 0;

      const m = s.matches;
      if (m) {
        const isHome = s.team_id === m.home_team_id;
        const my = isHome ? m.home_score : m.away_score;
        const opp = isHome ? m.away_score : m.home_score;
        if (my > opp) tW++;
        else if (my < opp) tL++;
        else tD++;

        if (m.season_id) {
          const sid = m.season_id;
          if (!sMap.has(sid)) {
            sMap.set(sid, { season_id: sid, rating_sum: 0, rating_count: 0 });
          }
          const item = sMap.get(sid)!;
          item.rating_sum += parseFloat(s.rating) || 0;
          item.rating_count++;
        }
      }
    });

    const mvInput: MarketValueInput = {
      profile: { primary_position: p.primary_position },
      careerStats: {
        matches_played: tM,
        wins: tW,
        draws: tD,
        losses: tL,
        goals: tG,
        assists: tA,
        cleansheets_gk: tCGK,
        cleansheets_def: tCDEF,
        red_cards: tRC
      },
      seasonStats: Array.from(sMap.values()),
      achievements: achByProfile.get(p.id) || []
    };

    const mvResult = calculateMarketValue(mvInput);

    return {
      id: p.id,
      username: p.username,
      avatarUrl: p.avatar_url,
      platform: p.platform || 'Bilinmiyor',
      position: p.primary_position || 'Bilinmiyor',
      alternativePositions: p.alternative_positions || [],
      status: contractedPlayerIds.has(p.id) ? 'CONTRACTED' : 'FREE',
      marketValue: mvResult.totalValue,
      wins: tW,
      draws: tD,
      losses: tL,
      played: tM,
    };
  });

  // Sort Rankings:
  // Primary: Market Value (DESC)
  // Secondary: Username (ASC, deterministic)
  rankingsArray.sort((a, b) => {
    if (b.marketValue !== a.marketValue) {
      return b.marketValue - a.marketValue;
    }
    return a.username.localeCompare(b.username, 'tr', { sensitivity: 'base' });
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
          Teta League tarihindeki en değerli oyuncular.
        </p>
      </div>

      <div className="fade-in-up" style={{ animationDelay: '0.2s' }}>
        <PlayerRankingsClient rankings={rankingsArray} />
      </div>
    </div>
  );
}
