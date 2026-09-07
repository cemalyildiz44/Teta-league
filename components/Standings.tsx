import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';

interface StandingsProps {
  compact?: boolean;
}

export default async function Standings({ compact = false }: StandingsProps) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Aktif sezonu bul
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'ACTIVE')
    .limit(1)
    .single();

  if (!activeSeason) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[28px] font-[800] tracking-wide text-white">PUAN DURUMU</h2>
        </div>
        <div className="empty-state !py-8">
          <span className="empty-state-title">Sezon Yok</span>
          <span className="empty-state-desc">Henüz aktif sezon bulunmuyor.</span>
        </div>
      </div>
    );
  }

  // 2. Aktif sezondaki ACTIVE ligleri bul (level 1 = en üst lig)
  const { data: activeLeague } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('season_id', activeSeason.id)
    .eq('status', 'ACTIVE')
    .order('level', { ascending: true })
    .limit(1)
    .single();

  if (!activeLeague) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[28px] font-[800] tracking-wide text-white">PUAN DURUMU</h2>
        </div>
        <div className="empty-state !py-8">
          <span className="empty-state-title">Lig Yok</span>
          <span className="empty-state-desc">Henüz aktif lig bulunmuyor.</span>
        </div>
      </div>
    );
  }

  // 3. Puan verilerini çek — team_season_stats composite FK ile league_teams'e bağlı
  //    league_teams ise teams tablosuna doğrudan FK (team_id -> teams.id) ile bağlı
  const { data: stats } = await supabase
    .from('team_season_stats')
    .select(`
      matches_played,
      wins,
      draws,
      losses,
      goals_for,
      goals_against,
      points,
      league_teams!inner (
        teams ( name, slug, logo_url )
      )
    `)
    .eq('league_id', activeLeague.id)
    .eq('season_id', activeSeason.id)
    .order('points', { ascending: false })
    .order('goals_for', { ascending: false });

  // 4. Sıralama: Puan > Averaj > Atılan Gol
  const sortedStats = (stats || [])
    .map((row: any) => ({
      team: row.league_teams?.teams,
      matches_played: row.matches_played,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goals_for: row.goals_for,
      goals_against: row.goals_against,
      goal_diff: row.goals_for - row.goals_against,
      points: row.points,
    }))
    .sort((a: any, b: any) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_diff !== a.goal_diff) return b.goal_diff - a.goal_diff;
      return b.goals_for - a.goals_for;
    });

  const displayCount = compact ? 5 : sortedStats.length;

  if (sortedStats.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[28px] font-[800] tracking-wide text-white">PUAN DURUMU</h2>
        </div>
        <div className="empty-state !py-8">
          <span className="empty-state-title">Veri Bekleniyor</span>
          <span className="empty-state-desc">Henüz puan durumu verisi bulunmuyor.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[28px] font-[800] tracking-wide text-white">PUAN DURUMU</h2>
        <Link href="/ligler" className="text-[13px] font-[700] text-[#00e5ff] hover:text-white transition-colors tracking-widest uppercase">
          Tümünü Gör →
        </Link>
      </div>

      <div className="card-surface rounded-xl overflow-hidden border border-white/5">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-black/40 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-white/5">
            <tr>
              <th className="px-4 py-3.5 w-12 text-center">#</th>
              <th className="px-3 py-3.5">TAKIM</th>
              <th className="px-3 py-3.5 text-center w-12 hidden sm:table-cell" title="Oynanan Maç">O</th>
              <th className="px-3 py-3.5 text-center w-12 hidden md:table-cell" title="Galibiyet">G</th>
              <th className="px-3 py-3.5 text-center w-12 hidden md:table-cell" title="Beraberlik">B</th>
              <th className="px-3 py-3.5 text-center w-12 hidden md:table-cell" title="Mağlubiyet">M</th>
              <th className="px-3 py-3.5 text-center w-14 hidden sm:table-cell" title="Averaj">AV</th>
              <th className="px-4 py-3.5 text-center w-14 font-black text-[#00e5ff]">P</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sortedStats.slice(0, displayCount).map((row: any, index: number) => {
              const rank = index + 1;
              return (
                <tr key={row.team?.slug || index} className={`hover:bg-white/5 transition-colors ${rank === 1 ? 'bg-[#00e5ff]/5' : ''}`}>
                  <td className="px-4 py-3.5 text-center">
                    <span className={`font-black ${rank === 1 ? 'text-[#00e5ff]' : 'text-gray-500'}`}>
                      {rank}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      {row.team?.logo_url ? (
                        <img src={row.team.logo_url} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-[#0a1628] border border-white/10 flex items-center justify-center text-[9px] font-black text-white shrink-0">
                          {row.team?.name?.charAt(0) || '?'}
                        </div>
                      )}
                      {row.team?.slug ? (
                        <Link href={`/takim/${row.team.slug}`} className={`font-bold text-sm truncate hover:text-[#00e5ff] transition-colors ${rank === 1 ? 'text-white' : 'text-gray-300'}`}>
                          {row.team.name}
                        </Link>
                      ) : (
                        <span className={`font-bold text-sm truncate ${rank === 1 ? 'text-white' : 'text-gray-300'}`}>
                          {row.team?.name || 'Bilinmeyen'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-center text-gray-400 font-medium hidden sm:table-cell">
                    {row.matches_played}
                  </td>
                  <td className="px-3 py-3.5 text-center text-gray-400 font-medium hidden md:table-cell">
                    {row.wins}
                  </td>
                  <td className="px-3 py-3.5 text-center text-gray-400 font-medium hidden md:table-cell">
                    {row.draws}
                  </td>
                  <td className="px-3 py-3.5 text-center text-gray-400 font-medium hidden md:table-cell">
                    {row.losses}
                  </td>
                  <td className="px-3 py-3.5 text-center text-gray-400 font-medium hidden sm:table-cell">
                    {row.goal_diff > 0 ? `+${row.goal_diff}` : row.goal_diff}
                  </td>
                  <td className="px-4 py-3.5 text-center font-black text-base text-[#00e5ff]">
                    {row.points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
