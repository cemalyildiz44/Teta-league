import { notFound } from 'next/navigation';
import { getLeagueBySlugs } from '../../../utils';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import TeamLogo from '@/components/TeamLogo';

export default async function LeagueFixturesPage({
  params,
}: {
  params: Promise<{ seasonSlug: string; leagueSlug: string }>;
}) {
  const resolvedParams = await params;
  const league = await getLeagueBySlugs(resolvedParams.seasonSlug, resolvedParams.leagueSlug);
  if (!league) notFound();

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Fetch fixtures and their associated matches for this league and season
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select(`
      id,
      season_id,
      league_id,
      week_number,
      scheduled_at,
      status,
      home_team_id,
      away_team_id,
      matches (
        id,
        home_score,
        away_score,
        status,
        played_at
      )
    `)
    .eq('league_id', league.id)
    .eq('season_id', league.season_id)
    .order('week_number', { ascending: true })
    .order('scheduled_at', { ascending: true });

  // 2. Fetch all teams to map IDs to names, slugs, and logos
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, slug, logo_url');
  const teamMap = new Map((teams || []).map((t) => [t.id, t]));

  // Group fixtures by week number
  const groupedByWeek = (fixtures || []).reduce((acc: Record<number, any[]>, fixture) => {
    const week = fixture.week_number;
    if (!acc[week]) acc[week] = [];
    acc[week].push(fixture);
    return acc;
  }, {});

  const weeks = Object.keys(groupedByWeek)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-[28px] font-[900] tracking-tight text-white tracking-widest">
          FİKSTÜR <span className="text-[#00e5ff]">& SONUÇLAR</span>
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
      </div>

      {weeks.length > 0 ? (
        <div className="space-y-8">
          {weeks.map((week) => (
            <div key={week} className="client-glass border border-white/5 rounded-2xl overflow-hidden">
              {/* Week Header */}
              <div className="bg-black/60 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#00e5ff] shadow-[0_0_8px_rgba(0,229,255,0.8)]" />
                  <h3 className="text-[#00E5FF] text-[18px] md:text-[20px] font-[900] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)] tracking-widest uppercase">
                    {week}. HAFTA
                  </h3>
                </div>
                <span className="text-[11px] font-[800] text-gray-500 uppercase tracking-widest">
                  {groupedByWeek[week].length} Karşılaşma
                </span>
              </div>

              {/* Match Rows in this Week */}
              <div className="divide-y divide-white/5">
                {groupedByWeek[week].map((fixture: any) => {
                  const homeTeam = teamMap.get(fixture.home_team_id);
                  const awayTeam = teamMap.get(fixture.away_team_id);

                  // Extract matches
                  const matchesList = Array.isArray(fixture.matches)
                    ? fixture.matches
                    : fixture.matches
                    ? [fixture.matches]
                    : [];
                  const approvedMatch = matchesList.find((m: any) => m.status === 'APPROVED');
                  const pendingMatch = matchesList.find((m: any) => m.status === 'PENDING_REVIEW');
                  const hasResult = !!approvedMatch;

                  const formattedDate = fixture.scheduled_at
                    ? new Intl.DateTimeFormat('tr-TR', {
                        timeZone: 'Europe/Istanbul',
                        day: 'numeric',
                        month: 'short',
                      }).format(new Date(fixture.scheduled_at))
                    : 'Tarih Yok';

                  const formattedTime = fixture.scheduled_at
                    ? new Intl.DateTimeFormat('tr-TR', {
                        timeZone: 'Europe/Istanbul',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(fixture.scheduled_at))
                    : '';

                  return (
                    <div
                      key={fixture.id}
                      className="p-4 md:p-6 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6"
                    >
                      {/* Date & Status */}
                      <div className="w-full md:w-36 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center shrink-0">
                        <div className="flex items-center gap-1.5 text-[13px] font-[700] text-gray-400">
                          <Calendar className="w-3.5 h-3.5 text-[#00e5ff]" />
                          <span>{formattedDate}</span>
                          {formattedTime && (
                            <span className="text-white font-bold ml-1">{formattedTime}</span>
                          )}
                        </div>
                        <span
                          className={`text-[9px] font-black tracking-widest uppercase mt-1 px-2.5 py-0.5 rounded-md ${
                            hasResult
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : pendingMatch
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : fixture.status === 'POSTPONED'
                              ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
                              : fixture.status === 'CANCELLED'
                              ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                              : 'bg-white/5 text-gray-400 border border-white/10'
                          }`}
                        >
                          {hasResult
                            ? 'TAMAMLANDI'
                            : pendingMatch
                            ? 'ONAY BEKLİYOR'
                            : fixture.status === 'POSTPONED'
                            ? 'ERTELENDİ'
                            : fixture.status === 'CANCELLED'
                            ? 'İPTAL EDİLDİ'
                            : 'PLANLANDI'}
                        </span>
                      </div>

                      {/* Teams & Score Block */}
                      <div className="flex-1 flex items-center justify-center gap-3 md:gap-6 w-full max-w-[700px]">
                        {/* Home Team */}
                        <Link
                          href={homeTeam?.slug ? `/takim/${homeTeam.slug}` : '#'}
                          className="flex-1 flex items-center justify-end gap-3 group min-w-0"
                        >
                          <span className="font-[800] text-white text-[14px] md:text-[18px] lg:text-[20px] tracking-wide text-right group-hover:text-[#00e5ff] transition-colors truncate">
                            {homeTeam?.name || 'Ev Sahibi'}
                          </span>
                          <TeamLogo src={homeTeam?.logo_url} name={homeTeam?.name} size="sm" />
                        </Link>

                        {/* Score / Status Center Block */}
                        <div className="shrink-0 flex items-center justify-center">
                          {hasResult ? (
                            <Link
                              href={`/mac/${approvedMatch.id}`}
                              className="px-3.5 py-1.5 bg-[#060d18] hover:bg-[#00e5ff]/10 border border-[#00e5ff]/30 hover:border-[#00e5ff] rounded-xl flex items-center justify-center transition-all group/score shadow-[0_0_12px_rgba(0,229,255,0.15)]"
                              title="Maç Raporunu Gör"
                            >
                              <span className="text-[18px] md:text-[24px] font-[900] tracking-wider text-white group-hover/score:text-[#00e5ff] transition-colors">
                                {approvedMatch.home_score} - {approvedMatch.away_score}
                              </span>
                            </Link>
                          ) : pendingMatch ? (
                            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                              <span className="text-[11px] font-[900] text-amber-400 tracking-wider">
                                ONAY BEKLİYOR
                              </span>
                            </div>
                          ) : (
                            <div className="w-14 h-9 bg-[#060d18] border border-white/10 rounded-xl flex items-center justify-center">
                              <span className="text-[12px] font-[900] text-gray-500 tracking-widest">
                                VS
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Away Team */}
                        <Link
                          href={awayTeam?.slug ? `/takim/${awayTeam.slug}` : '#'}
                          className="flex-1 flex items-center justify-start gap-3 group min-w-0"
                        >
                          <TeamLogo src={awayTeam?.logo_url} name={awayTeam?.name} size="sm" />
                          <span className="font-[800] text-white text-[14px] md:text-[18px] lg:text-[20px] tracking-wide text-left group-hover:text-[#00e5ff] transition-colors truncate">
                            {awayTeam?.name || 'Deplasman'}
                          </span>
                        </Link>
                      </div>

                      {/* Right Action */}
                      <div className="shrink-0 w-full md:w-32 flex justify-end">
                        {hasResult ? (
                          <Link
                            href={`/mac/${approvedMatch.id}`}
                            className="w-full md:w-auto text-center px-4 py-2 bg-white/5 hover:bg-[#00e5ff]/10 text-gray-300 hover:text-[#00e5ff] border border-white/10 hover:border-[#00e5ff]/30 text-[11px] font-[800] uppercase tracking-wider rounded-xl transition-all"
                          >
                            MAÇ RAPORU
                          </Link>
                        ) : (
                          <span className="hidden md:block w-20" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="client-glass rounded-2xl border border-white/5 p-16 text-center">
          <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-[900] text-white uppercase tracking-wider mb-2">
            FİKSTÜR BULUNAMADI
          </h3>
          <p className="text-[14px] text-gray-400 max-w-md mx-auto">
            Bu lige ait fikstür henüz oluşturulmadı. Karşılaşma takvimi belirlendiğinde burada listelenecektir.
          </p>
        </div>
      )}
    </div>
  );
}


