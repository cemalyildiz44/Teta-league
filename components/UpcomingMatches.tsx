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

export default async function UpcomingMatches() {
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
          <h2 className="text-[28px] font-[800] tracking-wide text-white">HAFTANIN MAÇLARI</h2>
        </div>
        <div className="empty-state !py-8"><span className="empty-state-title">Veri Bekleniyor</span><span className="empty-state-desc">Aktif bir lig sezonu bulunmuyor.</span></div>
      </div>
    );
  }

  // 2. Aktif sezondaki ACTIVE ligleri bul (level 1 = en üst)
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
          <h2 className="text-[28px] font-[800] tracking-wide text-white">HAFTANIN MAÇLARI</h2>
        </div>
        <div className="empty-state !py-8"><span className="empty-state-title">Veri Bekleniyor</span><span className="empty-state-desc">Aktif bir lig bulunmuyor.</span></div>
      </div>
    );
  }

  // 3. Yaklaşan fikstürleri çek
  //    fixtures -> league_teams ilişkisi home/away için iki ayrı FK kullanıyor
  //    Ambiguity önlemek için explicit FK isimleri zorunlu
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
    .eq('league_id', activeLeague.id)
    .eq('season_id', activeSeason.id)
    .eq('status', 'SCHEDULED')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(4);

  const matchList = fixtures || [];

  if (matchList.length === 0) {
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {matchList.map((fixture: any) => {
          const homeTeam = fixture.home?.teams;
          const awayTeam = fixture.away?.teams;
          const homeName = homeTeam?.name || 'Bilinmeyen';
          const awayName = awayTeam?.name || 'Bilinmeyen';

          return (
            <div key={fixture.id} className="card-surface rounded-xl p-5 hover:scale-[1.02] transition-transform relative overflow-hidden group">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">
                  {activeLeague.name} - Hafta {fixture.week_number}
                </span>
                <span className="text-[10px] font-bold text-[#00e5ff] tracking-widest">
                  {formatTime(fixture.scheduled_at)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                {/* Home */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <TeamLogo src={homeTeam?.logo_url} name={homeName} size="md" />
                  <span className="text-[15px] font-[700] text-white whitespace-normal break-words min-w-0">{homeName}</span>
                </div>

                {/* VS */}
                <div className="w-[20%] flex justify-center">
                  <span className="text-xs font-black text-gray-500">VS</span>
                </div>

                {/* Away */}
                <div className="flex items-center gap-3 flex-1 min-w-0 justify-end text-right">
                  <span className="text-[15px] font-[700] text-white whitespace-normal break-words min-w-0">{awayName}</span>
                  <TeamLogo src={awayTeam?.logo_url} name={awayName} size="md" />
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
    </div>
  );
}
