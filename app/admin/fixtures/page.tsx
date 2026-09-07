
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { FixturesManager } from './FixturesManager';

export default async function AdminFixturesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  
  const { data: seasons } = await supabase.from('seasons').select('id, name, status').order('created_at', { ascending: false });
  const { data: leagues } = await supabase.from('leagues').select('id, name, season_id, status').order('level');
  const { data: leagueTeams } = await supabase.from('league_teams').select('league_id, team_id, is_active').eq('is_active', true);
  
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('*, home:teams!fixtures_home_team_id_fkey(id, name, logo_url), away:teams!fixtures_away_team_id_fkey(id, name, logo_url), leagues(name), seasons(name)')
    .order('scheduled_at', { ascending: true });

  const { data: teams } = await supabase.from('teams').select('id, name, logo_url');

  return (
    <div className='max-w-6xl mx-auto'>
      <div className='flex items-center justify-between mb-8'>
        <div>
          <h1 className='text-2xl font-black text-white tracking-widest'>FİKSTÜR YÖNETİM MERKEZİ</h1>
          <p className='text-sm text-zinc-400 mt-1'>Liglerin karşılaşma takvimlerini yönetin</p>
        </div>
      </div>

      <FixturesManager 
        initialFixtures={fixtures || []} 
        seasons={seasons || []} 
        leagues={leagues || []}
        leagueTeams={leagueTeams || []}
        teams={teams || []}
      />
    </div>
  );
}

