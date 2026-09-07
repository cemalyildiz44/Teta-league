
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { EAImportManager } from './EAImportManager';

export default async function EAImportPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: seasons } = await supabase.from('seasons').select('id, name, status').order('created_at', { ascending: false });
  const { data: leagues } = await supabase.from('leagues').select('id, name, season_id, level').order('level');
  
  // We can also fetch the last imported matches to show on the right panel
  const { data: recentImports } = await supabase
    .from('matches')
    .select('id, home_score, away_score, played_at, status, home:teams!matches_home_team_id_fkey(name, logo_url), away:teams!matches_away_team_id_fkey(name, logo_url)')
    .eq('source', 'AUTO')
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <div className='max-w-[1600px] mx-auto'>
      <div className='mb-8'>
        <h1 className='text-2xl font-black text-white tracking-widest uppercase mb-1'>EA MAÇ İÇE AKTARMA</h1>
        <p className='text-sm text-zinc-400'>EA FC Pro Clubs karşılaşmalarından gelen verileri Teta League sistemine güvenli şekilde aktar.</p>
      </div>
      
      <EAImportManager 
        seasons={seasons || []}
        leagues={leagues || []}
        recentImports={recentImports || []}
      />
    </div>
  );
}

