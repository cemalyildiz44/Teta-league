
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { TeamsManager } from './TeamsManager';

export default async function AdminTeamsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  
  // Fetch teams
  const { data: teams } = await supabase.from('teams').select('*').order('name');
  
  // Fetch active captains
  const { data: captains } = await supabase
    .from('user_roles')
    .select('team_id, user_id, profiles!user_roles_user_id_fkey(username)')
    .eq('role', 'CAPTAIN')
    .eq('is_active', true);

  // Fetch team memberships
  const { data: memberships } = await supabase
    .from('team_memberships')
    .select('id, team_id, player_id, league_id, season_id, joined_at, left_at, profiles!team_memberships_player_id_fkey(username), league_teams(leagues(name, seasons(name)))')
    .order('joined_at', { ascending: false });

  // Fetch league_teams for assignments
  const { data: leagueTeams } = await supabase
    .from('league_teams')
    .select('team_id, league_id, season_id, is_active, leagues(name, seasons(name))')
    .eq('is_active', true);

  // Fetch all profiles for assigning players/captains
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .order('username');

  return (
    <div className='max-w-6xl mx-auto'>
      <div className='flex items-center justify-between mb-8'>
        <div>
          <h1 className='text-2xl font-black text-white tracking-widest'>TAKIM YÖNETİM MERKEZİ</h1>
          <p className='text-sm text-zinc-400 mt-1'>Takımları, kaptanları ve kadroları profesyonel şekilde yönetin</p>
        </div>
      </div>

      <TeamsManager 
        initialTeams={teams || []} 
        initialCaptains={captains || []}
        initialMemberships={memberships || []}
        initialLeagueTeams={leagueTeams || []}
        allProfiles={profiles || []}
      />
    </div>
  );
}

