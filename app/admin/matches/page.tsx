
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { MatchesManager } from './MatchesManager';

export default async function AdminMatchesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [
    { data: matches },
    { data: seasons },
    { data: leagues },
    { data: teams }
  ] = await Promise.all([
    supabase
      .from('matches')
      .select('*, fixtures(week_number), stats:match_player_stats(*, profiles!match_player_stats_player_id_fkey(username))')
      .order('played_at', { ascending: false })
      .limit(500),
    supabase.from('seasons').select('id, name').order('created_at', { ascending: false }),
    supabase.from('leagues').select('id, name, season_id'),
    supabase.from('teams').select('id, name, logo_url')
  ]);

  const teamMap = new Map((teams || []).map(t => [t.id, t]));
  const leagueMap = new Map((leagues || []).map(l => [l.id, l]));
  const seasonMap = new Map((seasons || []).map(s => [s.id, s]));

  const formattedMatches = (matches || []).map(m => ({
    ...m,
    home: m.home_team_id ? teamMap.get(m.home_team_id) || null : null,
    away: m.away_team_id ? teamMap.get(m.away_team_id) || null : null,
    leagues: m.league_id ? leagueMap.get(m.league_id) || null : null,
    seasons: m.season_id ? seasonMap.get(m.season_id) || null : null,
  }));

  return (
    <div className='max-w-[1400px] mx-auto'>
      <div className='flex items-center justify-between mb-8'>
        <div>
          <h1 className='text-2xl font-black text-white tracking-widest'>MAÇ YÖNETİM MERKEZİ</h1>
          <p className='text-sm text-zinc-400 mt-1'>TETA League karşılaşmalarını görüntüle, incele, düzenle ve onayla.</p>
        </div>
      </div>

      <MatchesManager 
        initialMatches={formattedMatches}
        seasons={seasons || []}
        leagues={leagues || []}
      />
    </div>
  );
}

