import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { Metadata } from 'next';
import TeamRankingsClient, { TeamRanking } from './TeamRankingsClient';

export const metadata: Metadata = {
  title: 'Takımlar Sıralaması | Teta League',
  description: 'Teta League tarihindeki en başarılı takımlar. Tüm zamanlar başarı sıralaması.',
};

export const revalidate = 60; // Cache for 1 min

export default async function TeamsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1 & 2. Fetch ALL teams and ALL approved matches concurrently
  const [ { data: teamsData }, { data: matches } ] = await Promise.all([
    supabase.from('teams').select('id, name, slug, logo_url, is_active, league_teams!inner(id)'),
    supabase.from('matches').select('home_team_id, away_team_id, home_score, away_score').eq('status', 'APPROVED')
  ]);

  // 3. Aggregate logic
  const teamsMap = new Map<string, TeamRanking>();

  // Initialize map with all active teams (or all teams)
  if (teamsData) {
    teamsData.forEach(team => {
      teamsMap.set(team.id, {
        id: team.id,
        name: team.name,
        slug: team.slug,
        logoUrl: team.logo_url,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        played: 0,
      });
    });
  }

  // Calculate stats from matches
  if (matches) {
    matches.forEach(match => {
      const homeId = match.home_team_id;
      const awayId = match.away_team_id;
      const homeScore = match.home_score;
      const awayScore = match.away_score;

      // Skip if either score is null/undefined
      if (homeScore === null || awayScore === null) return;
      if (homeScore === undefined || awayScore === undefined) return;

      const homeTeam = teamsMap.get(homeId);
      const awayTeam = teamsMap.get(awayId);

      // Home Team Logic
      if (homeTeam) {
        homeTeam.played += 1;
        if (homeScore > awayScore) {
          homeTeam.wins += 1;
          homeTeam.points += 3;
        } else if (homeScore === awayScore) {
          homeTeam.draws += 1;
          homeTeam.points += 1;
        } else {
          homeTeam.losses += 1;
        }
      }

      // Away Team Logic
      if (awayTeam) {
        awayTeam.played += 1;
        if (awayScore > homeScore) {
          awayTeam.wins += 1;
          awayTeam.points += 3;
        } else if (awayScore === homeScore) {
          awayTeam.draws += 1;
          awayTeam.points += 1;
        } else {
          awayTeam.losses += 1;
        }
      }
    });
  }

  // Convert map to array (all teams in active leagues will be shown even with 0 matches)
  const rankingsArray = Array.from(teamsMap.values());

  // 4. Sort Rankings
  // Primary: Points (DESC)
  // Secondary: Wins (DESC)
  // Tertiary: Losses (ASC)
  // Quaternary: Draws (DESC)
  // Quinary: Name (ASC)
  rankingsArray.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses; // ASC for losses
    if (b.draws !== a.draws) return b.draws - a.draws;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-12 md:py-16">
      {/* PAGE HEADER */}
      <div className="mb-12 md:mb-16 text-center fade-in-up flex flex-col items-center">
        <span className="text-[#00e5ff] text-[11px] font-[900] tracking-[0.3em] uppercase bg-[#00e5ff]/10 px-4 py-1.5 rounded-full border border-[#00e5ff]/30 mb-6 glow-cyan-strong shadow-[0_0_20px_rgba(0,229,255,0.2)]">
          All-Time Leaderboard
        </span>
        <h1 className="text-[42px] md:text-[64px] font-[900] text-white tracking-widest uppercase mb-4 drop-shadow-[0_0_15px_rgba(0,229,255,0.4)] leading-tight">
          TAKIMLAR
        </h1>
        <p className="text-[#a0b0c0] font-medium max-w-2xl mx-auto text-[15px] md:text-[17px] leading-relaxed">
          Teta League tarihindeki en başarılı takımlar.
        </p>
      </div>

      <div className="fade-in-up" style={{ animationDelay: '0.2s' }}>
        <TeamRankingsClient rankings={rankingsArray} />
      </div>
    </div>
  );
}
