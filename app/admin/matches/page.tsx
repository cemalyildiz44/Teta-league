
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { MatchesManager } from './MatchesManager';

export default async function AdminMatchesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Nested fetch to get all required data in one query
  const { data: matches } = await supabase
    .from('matches')
    .select('*, fixtures(week_number), home:teams!matches_home_team_id_fkey(id, name, logo_url), away:teams!matches_away_team_id_fkey(id, name, logo_url), leagues(id, name), seasons(id, name), stats:match_player_stats(*, profiles!match_player_stats_player_id_fkey(username))')
    .order('played_at', { ascending: false })
    .limit(500);

  const { data: seasons } = await supabase.from('seasons').select('id, name').order('created_at', { ascending: false });
  const { data: leagues } = await supabase.from('leagues').select('id, name, season_id');

  return (
    <div className='max-w-[1400px] mx-auto'>
      <div className='flex items-center justify-between mb-8'>
        <div>
          <h1 className='text-2xl font-black text-white tracking-widest'>MAÇ YÖNETİM MERKEZİ</h1>
          <p className='text-sm text-zinc-400 mt-1'>Teta League karşılaşmalarını görüntüle, incele, düzenle ve onayla.</p>
        </div>
      </div>

      <MatchesManager 
        initialMatches={matches || []} 
        seasons={seasons || []}
        leagues={leagues || []}
      />
    </div>
  );
}

