import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import PenaltiesManager from './PenaltiesManager';

export default async function AdminPenaltiesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Admin guard
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris');

  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .maybeSingle();

  if (!adminRole) redirect('/');

  // Fetch penalties with related data using Map-based joins (no N+1)
  const [
    { data: penaltiesData },
    { data: teamsData },
    { data: leaguesData },
    { data: seasonsData },
    { data: profilesData },
    { data: leagueTeamsData },
    { data: matchesData },
  ] = await Promise.all([
    supabase
      .from('team_penalties')
      .select('*')
      .order('issued_at', { ascending: false }),
    supabase.from('teams').select('id, name, slug, logo_url'),
    supabase.from('leagues').select('id, name, season_id'),
    supabase.from('seasons').select('id, name, slug, status').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, username, avatar_url'),
    supabase
      .from('league_teams')
      .select('team_id, league_id, season_id, is_active'),
    supabase
      .from('matches')
      .select('id, home_team_id, away_team_id, home_score, away_score, status, played_at'),
  ]);

  const penalties = penaltiesData || [];
  const teams = teamsData || [];
  const leagues = leaguesData || [];
  const seasons = seasonsData || [];
  const profiles = profilesData || [];
  const leagueTeams = leagueTeamsData || [];
  const matches = matchesData || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-3xl font-black text-white tracking-widest">
          CEZA <span className="text-[#00e5ff]">YÖNETİMİ</span>
        </h1>
        <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
      </div>
      <PenaltiesManager
        penalties={penalties}
        teams={teams}
        leagues={leagues}
        seasons={seasons}
        profiles={profiles}
        leagueTeams={leagueTeams}
        matches={matches}
      />
    </div>
  );
}
