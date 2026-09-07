import { notFound } from 'next/navigation';
import { getLeagueBySlugs } from '../../../utils';
﻿import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';

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

  // 1. Fetch fixtures and their associated matches
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('*, matches(home_score, away_score, status)')
    .eq('league_id', league.id)
    .order('week_number', { ascending: true })
    .order('scheduled_at', { ascending: true });

  // 2. Fetch all teams to map IDs to names/logos safely
  const { data: teams } = await supabase.from('teams').select('id, name, slug, logo_url');
  const teamMap = new Map((teams || []).map(t => [t.id, t]));

  // Group fixtures by week
  const groupedByWeek = (fixtures || []).reduce((acc: any, fixture) => {
    const week = fixture.week_number;
    if (!acc[week]) acc[week] = [];
    acc[week].push(fixture);
    return acc;
  }, {});

  const weeks = Object.keys(groupedByWeek).map(Number).sort((a, b) => a - b);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-[28px] font-[900] tracking-tight text-white tracking-widest">LÄ°G <span className="text-[#00e5ff]">FÄ°KSTÃœRÃœ</span></h2>
        <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
      </div>

      {weeks.length > 0 ? (
        <div className="space-y-8">
          {weeks.map((week) => (
            <div key={week} className="client-glass fade-in-up border border-white/5 overflow-hidden">
              <div className="bg-black/50 backdrop-blur-xl border border-[#00E5FF]/20 border-b border-white/5 px-6 py-4 flex items-center justify-between">
                <h3 className="text-[#00E5FF] text-[20px] font-[900] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)] tracking-widest uppercase">Hafta {week}</h3>
              </div>
              
              <div className="divide-y divide-white/5">
                {groupedByWeek[week].map((fixture: any) => {
                  const homeTeam = teamMap.get(fixture.home_team_id) as any;
                  const awayTeam = teamMap.get(fixture.away_team_id) as any;
                  
                  // Find approved match if exists
                  const approvedMatch = fixture.matches?.find((m: any) => m.status === 'APPROVED');
                  const hasResult = !!approvedMatch;

                  return (
                    <div key={fixture.id} className="p-4 md:p-6 hover:bg-white/5 transition-colors flex flex-col md:flex-row items-center justify-between gap-6">
                      
                      {/* Date & Status */}
                      <div className="w-full md:w-32 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center shrink-0">
                        <span className="text-[14px] font-[700] text-gray-400">
                          {new Intl.DateTimeFormat('tr-TR', {
                            timeZone: 'Europe/Istanbul',
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          }).format(new Date(fixture.scheduled_at))}
                        </span>
                        <span className={`text-[9px] font-black tracking-widest uppercase mt-1 px-2 py-0.5 rounded ${
                          fixture.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500' :
                          fixture.status === 'POSTPONED' ? 'bg-orange-500/10 text-orange-500' :
                          fixture.status === 'CANCELLED' ? 'bg-red-500/10 text-red-500' :
                          'bg-gray-500/10 text-gray-500'
                        }`}>
                          {fixture.status}
                        </span>
                      </div>

                      {/* Teams & Score */}
                      <div className="flex-1 flex items-center justify-center gap-4 w-full">
                        {/* Home Team */}
                        <Link href={`/takim/${homeTeam?.slug}`} className="flex-1 flex items-center justify-end gap-3 group">
                          <span className="font-bold text-white md:text-[22px] font-[800] tracking-wider text-right group-hover:text-[#00e5ff] transition-colors whitespace-normal break-words min-w-0">
                            {homeTeam?.name || 'Ev Sahibi'}
                          </span>
                          <div className="w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-full bg-[#060d18] border border-white/10 overflow-hidden flex items-center justify-center group-hover:border-[#00e5ff] transition-colors">
                            {homeTeam?.logo_url ? (
                              <img src={homeTeam.logo_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-black text-[#00e5ff]">{homeTeam?.name?.charAt(0)}</span>
                            )}
                          </div>
                        </Link>

                        {/* Score Block */}
                        <div className="shrink-0 w-20 h-12 bg-[#060d18] border border-white/10 rounded-lg flex items-center justify-center">
                          {hasResult ? (
                            <span className="text-[28px] font-[900] tracking-tight text-white tracking-widest">
                              {approvedMatch.home_score} - {approvedMatch.away_score}
                            </span>
                          ) : (
                            <span className="text-gray-500 font-bold">- : -</span>
                          )}
                        </div>

                        {/* Away Team */}
                        <Link href={`/takim/${awayTeam?.slug}`} className="flex-1 flex items-center justify-start gap-3 group">
                          <div className="w-8 h-8 md:w-10 md:h-10 shrink-0 rounded-full bg-[#060d18] border border-white/10 overflow-hidden flex items-center justify-center group-hover:border-[#00e5ff] transition-colors">
                            {awayTeam?.logo_url ? (
                              <img src={awayTeam.logo_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-black text-[#00e5ff]">{awayTeam?.name?.charAt(0)}</span>
                            )}
                          </div>
                          <span className="font-bold text-white md:text-[22px] font-[800] tracking-wider text-left group-hover:text-[#00e5ff] transition-colors whitespace-normal break-words min-w-0">
                            {awayTeam?.name || 'Deplasman'}
                          </span>
                        </Link>
                      </div>
                      
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state w-full">
          <svg className="w-12 h-12 text-muted mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <span className="empty-state-title">FikstÃ¼r BulunamadÄ±</span>
          <span className="empty-state-desc">Bu lige ait fikstÃ¼r henÃ¼z oluÅŸturulmadÄ±.</span>
        </div>
      )}
    </div>
  );
}


