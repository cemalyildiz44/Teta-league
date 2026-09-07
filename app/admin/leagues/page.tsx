
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { LeaguesManager } from './LeaguesManager';

export default async function AdminLeaguesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  
  const { data: seasons } = await supabase.from('seasons').select('id, name, status').order('created_at', { ascending: false });
  const { data: leagues } = await supabase
    .from('leagues')
    .select('*, seasons(name)')
    .order('level', { ascending: true });
    
  const { data: allTeams } = await supabase.from('teams').select('id, name, logo_url').order('name');
  const { data: leagueTeams } = await supabase.from('league_teams').select('league_id, team_id, teams(name, logo_url)');

  return (
    <div className='max-w-6xl mx-auto'>
      <div className='flex items-center justify-between mb-8'>
        <div>
          <h1 className='text-2xl font-black text-white tracking-widest'>LİG YÖNETİM MERKEZİ</h1>
          <p className='text-sm text-zinc-400 mt-1'>Teta League liglerini ve katılımcı takımları yönetin</p>
        </div>
      </div>

      <LeaguesManager 
        initialLeagues={leagues || []} 
        seasons={seasons || []} 
        allTeams={allTeams || []} 
        initialLeagueTeams={leagueTeams || []} 
      />
    </div>
  );
}

