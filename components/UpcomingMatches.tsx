import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import TeamLogo from '@/components/TeamLogo';

function getShortName(name: string): string {
  return name.slice(0, 3).toUpperCase();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  }).format(date);
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  }).format(date);
}

import { getActiveSeason, getActiveLeagues } from '@/lib/fetchers';
import { pickUpcomingFixtures } from '@/lib/upcoming-fixtures';

// Her ligden gösterilecek maç sayısı ve seçim için değerlendirilecek yaklaşan maç sayısı
const MATCHES_PER_LEAGUE = 2;
const CANDIDATES_PER_LEAGUE = 8;

export default async function UpcomingMatches() {
  const activeSeason = await getActiveSeason();

  if (!activeSeason) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[28px] font-[800] tracking-wide text-white">HAFTANIN MAÇLARI</h2>
        </div>
        <div className="empty-state !py-8"><span className="empty-state-title">Veri Bekleniyor</span><span className="empty-state-desc">Aktif bir lig sezonu bulunmuyor.</span></div>
      </div>
    );
  }

  // 2. Aktif sezondaki ligleri al (memoized - Standings ile paylaşılır)
  const leagues = await getActiveLeagues(activeSeason.id);

  // Süperlig ve ECL ligleri: Standings.tsx ile aynı seviye/ad kuralı
  const superLigLeague = leagues.find(
    (l) => l.level === 1 || l.name.toLowerCase().includes('süper') || l.name.toLowerCase().includes('super')
  ) || leagues[0];

  const eclCandidate = leagues.find(
    (l) => l.level === 2 || l.name.toLowerCase().includes('ecl')
  ) || leagues.find((l) => l.id !== superLigLeague?.id) || null;
  const eclLeague = eclCandidate && eclCandidate.id !== superLigLeague?.id ? eclCandidate : null;

  const targetLeagues = [superLigLeague, eclLeague].filter(Boolean) as typeof leagues;

  if (targetLeagues.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[28px] font-[800] tracking-wide text-white">HAFTANIN MAÇLARI</h2>
        </div>
        <div className="empty-state !py-8"><span className="empty-state-title">Veri Bekleniyor</span><span className="empty-state-desc">Aktif bir lig bulunmuyor.</span></div>
      </div>
    );
  }

  // 3. Her lig için yaklaşan fikstürleri çek (lig başına tek sorgu, paralel).
  //    fixtures -> league_teams ilişkisi home/away için iki ayrı FK kullanıyor
  //    Ambiguity önlemek için explicit FK isimleri zorunlu
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const nowIso = new Date().toISOString();

  const leagueMatches = await Promise.all(
    targetLeagues.map(async (league) => {
      const { data: fixtures } = await supabase
        .from('fixtures')
        .select(`
          id,
          week_number,
          scheduled_at,
          status,
          home:league_teams!fixtures_league_id_season_id_home_team_id_fkey (
            teams ( name, slug, logo_url )
          ),
          away:league_teams!fixtures_league_id_season_id_away_team_id_fkey (
            teams ( name, slug, logo_url )
          )
        `)
        .eq('league_id', league.id)
        .eq('season_id', activeSeason.id)
        .eq('status', 'SCHEDULED')
        .gte('scheduled_at', nowIso)
        // Aynı zamana sahip maçlarda sınır (limit) kararının sabit kalması için ikincil sıralama
        .order('scheduled_at', { ascending: true })
        .order('week_number', { ascending: true })
        .order('id', { ascending: true })
        .limit(CANDIDATES_PER_LEAGUE);

      // En yakın haftadan öncelikli, eksikse sonraki yaklaşan maçlarla tamamlanan deterministik seçim
      return { league, matches: pickUpcomingFixtures(fixtures || [], MATCHES_PER_LEAGUE) };
    })
  );

  const groups = leagueMatches.filter((g) => g.matches.length > 0);

  if (groups.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[28px] font-[800] tracking-wide text-white">HAFTANIN MAÇLARI</h2>
        </div>
        <div className="empty-state !py-8"><span className="empty-state-title">Veri Bekleniyor</span><span className="empty-state-desc">Yaklaşan maç bulunmuyor.</span></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[28px] font-[800] tracking-wide text-white">HAFTANIN MAÇLARI</h2>
      </div>

      <div className="space-y-4">
        {groups.map(({ league, matches }) => (
          <div key={league.id} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {matches.map((fixture: any) => {
              const homeTeam = fixture.home?.teams;
              const awayTeam = fixture.away?.teams;
              const homeName = homeTeam?.name || 'Bilinmeyen';
              const awayName = awayTeam?.name || 'Bilinmeyen';

              return (
                <div key={fixture.id} className="card-surface card-hover-lift rounded-xl p-5 relative overflow-hidden group cursor-pointer">
                  <div className="flex justify-between items-center mb-4 gap-3">
                    <span className="text-[10px] font-bold tracking-widest uppercase min-w-0">
                      <span className="text-[#00e5ff]">{league.name}</span>
                      <span className="text-[#00e5ff]"> - Hafta {fixture.week_number}</span>
                    </span>
                    <span className="text-[10px] font-bold text-[#00e5ff] tracking-widest shrink-0">
                      {formatTime(fixture.scheduled_at)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    {/* Home */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <TeamLogo src={homeTeam?.logo_url} name={homeName} size="md" className="group-hover:scale-[1.04] transition-transform duration-200" />
                      <span className="text-[15px] font-[700] text-white whitespace-normal break-words min-w-0 group-hover:text-[#00e5ff] transition-colors duration-200">{homeName}</span>
                    </div>

                    {/* VS */}
                    <div className="w-[20%] flex justify-center">
                      <span className="text-xs font-black text-gray-500 group-hover:text-gray-400 transition-colors duration-200">VS</span>
                    </div>

                    {/* Away */}
                    <div className="flex items-center gap-3 flex-1 min-w-0 justify-end text-right">
                      <span className="text-[15px] font-[700] text-white whitespace-normal break-words min-w-0 group-hover:text-[#00e5ff] transition-colors duration-200">{awayName}</span>
                      <TeamLogo src={awayTeam?.logo_url} name={awayName} size="md" className="group-hover:scale-[1.04] transition-transform duration-200" />
                    </div>
                  </div>

                  <div className="mt-3 text-center">
                    <span className="text-[10px] font-medium text-gray-500 tracking-wider">
                      {formatDate(fixture.scheduled_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
