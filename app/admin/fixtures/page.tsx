import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { FixturesManager } from './FixturesManager';

export default async function AdminFixturesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  
  const [
    { data: seasons },
    { data: leagues },
    { data: leagueTeams },
    { data: teams },
    { data: fixtures }
  ] = await Promise.all([
    supabase.from('seasons').select('id, name, status, slug').order('created_at', { ascending: false }),
    supabase.from('leagues').select('id, name, season_id, status').order('level'),
    supabase.from('league_teams').select('league_id, team_id, is_active').eq('is_active', true),
    supabase.from('teams').select('id, name, logo_url, ea_club_id'),
    supabase
      .from('fixtures')
      .select('*, matches:matches(id, status, home_score, away_score, played_at, source, ea_match_id, updated_at)')
      .order('scheduled_at', { ascending: true })
      .limit(1000)
  ]);

  const teamMap = new Map((teams || []).map(t => [t.id, t]));
  const leagueMap = new Map((leagues || []).map(l => [l.id, l]));
  const seasonMap = new Map((seasons || []).map(s => [s.id, s]));

  const formattedFixtures = (fixtures || []).map(f => {
    const match = Array.isArray(f.matches) ? f.matches[0] : f.matches;
    return {
      ...f,
      home: f.home_team_id ? teamMap.get(f.home_team_id) || null : null,
      away: f.away_team_id ? teamMap.get(f.away_team_id) || null : null,
      leagues: f.league_id ? leagueMap.get(f.league_id) || null : null,
      seasons: f.season_id ? seasonMap.get(f.season_id) || null : null,
      match: match || null
    };
  });

  return (
    <div className='max-w-[1400px] mx-auto'>
      <div className='flex items-center justify-between mb-8'>
        <div>
          <h1 className='text-2xl font-black text-white tracking-widest'>FİKSTÜR VE MAÇ YÖNETİM MERKEZİ</h1>
          <p className='text-sm text-zinc-400 mt-1'>Karşılaşma takvimlerini oluşturun, filtreleyin, skorları ve maç kayıtlarını düzenleyin.</p>
        </div>
        <Link href='/admin/fixtures/import' className='px-4 py-2 rounded-lg text-sm font-bold bg-white/10 text-white hover:bg-white/20'>
          Haftalık JSON Aktarımı
        </Link>
      </div>

      <FixturesManager 
        initialFixtures={formattedFixtures}
        seasons={seasons || []} 
        leagues={leagues || []}
        leagueTeams={leagueTeams || []}
        teams={teams || []}
      />
    </div>
  );
}
