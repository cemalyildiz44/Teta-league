import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Metadata } from 'next';
import { slugify } from '@/app/lig/utils';
import { Calendar, Shield, ChevronRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Fikstür ve Maç Takvimi | TETA League',
  description: 'TETA League güncel maç fikstürü, haftalık karşılaşmalar ve onaylanan maç sonuçları.',
};

interface Props {
  searchParams: Promise<{
    season?: string;
    league?: string;
    week?: string;
  }>;
}

export default async function GeneralFixturesPage({ searchParams }: Props) {
  const resolvedParams = await searchParams;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Fetch all seasons (ACTIVE first)
  const { data: seasonsData } = await supabase
    .from('seasons')
    .select('id, name, slug, status')
    .order('created_at', { ascending: false });

  const seasons = seasonsData || [];
  if (seasons.length === 0) {
    return (
      <main className="min-h-screen bg-[#01060b] py-12 px-4 lg:px-6">
        <div className="max-w-[1400px] mx-auto text-center py-20">
          <h1 className="text-3xl font-[900] text-white tracking-widest uppercase mb-4">FİKSTÜR</h1>
          <p className="text-gray-400">Henüz kayıtlı bir lig sezonu bulunmuyor.</p>
        </div>
      </main>
    );
  }

  // Determine selected season: priority from searchParams.season -> ACTIVE season -> first season
  const selectedSeason = resolvedParams.season
    ? seasons.find((s) => s.slug === resolvedParams.season) || seasons.find((s) => s.status === 'ACTIVE') || seasons[0]
    : seasons.find((s) => s.status === 'ACTIVE') || seasons[0];

  // 2. Fetch leagues for the selected season
  const { data: leaguesData } = await supabase
    .from('leagues')
    .select('id, name, level, status')
    .eq('season_id', selectedSeason.id)
    .order('level', { ascending: true });

  const leagues = leaguesData || [];

  // Determine selected league
  let selectedLeague = leagues[0] || null;
  if (resolvedParams.league && leagues.length > 0) {
    const matched = leagues.find((l) => slugify(l.name) === resolvedParams.league);
    if (matched) selectedLeague = matched;
  }

  // 3. Fetch fixtures for selected season & league
  let fixtures: any[] = [];
  if (selectedLeague) {
    const { data: fixData } = await supabase
      .from('fixtures')
      .select(`
        id,
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
      .eq('league_id', selectedLeague.id)
      .eq('season_id', selectedSeason.id)
      .order('week_number', { ascending: true })
      .order('scheduled_at', { ascending: true });

    fixtures = fixData || [];
  }

  // 4. Fetch all teams to map IDs to details
  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, slug, logo_url');

  const teamMap = new Map((teamsData || []).map((t) => [t.id, t]));

  // Group fixtures by week
  const groupedByWeek = fixtures.reduce((acc: Record<number, any[]>, fix) => {
    const week = fix.week_number;
    if (!acc[week]) acc[week] = [];
    acc[week].push(fix);
    return acc;
  }, {});

  const availableWeeks = Object.keys(groupedByWeek)
    .map(Number)
    .sort((a, b) => a - b);

  // Optional week filter
  const selectedWeek = resolvedParams.week ? Number(resolvedParams.week) : null;
  const displayedWeeks = selectedWeek && groupedByWeek[selectedWeek]
    ? [selectedWeek]
    : availableWeeks;

  return (
    <main className="min-h-screen bg-[#01060b] py-10 lg:py-16">
      <div className="max-w-[1400px] mx-auto px-4 lg:px-6">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-white/10 pb-8 mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
              <span className="text-[11px] font-[900] text-[#00e5ff] tracking-[0.2em] uppercase">
                RESMİ MAÇ TAKVİMİ
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-[900] text-white tracking-tight uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
              FİKSTÜR <span className="text-[#00e5ff]">& SONUÇLAR</span>
            </h1>
          </div>

          {/* Current Selection Summary */}
          {selectedLeague && (
            <div className="flex flex-col md:items-end">
              <span className="text-[20px] md:text-[24px] font-[900] text-[#00e5ff] tracking-wider uppercase drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]">
                {selectedLeague.name}
              </span>
              <span className="text-[12px] font-[700] text-gray-400 tracking-widest uppercase">
                {selectedSeason.name}
              </span>
            </div>
          )}
        </div>

        {/* CONTROLS / FILTERS */}
        <div className="space-y-4 mb-10">
          
          {/* 1. SEASONS (If multiple exist) */}
          {seasons.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-[900] text-gray-500 uppercase tracking-widest mr-2">SEZON:</span>
              {seasons.map((s) => {
                const isActive = s.id === selectedSeason.id;
                return (
                  <Link
                    key={s.id}
                    href={`/fikstur?season=${s.slug}${selectedLeague ? `&league=${slugify(selectedLeague.name)}` : ''}`}
                    className={`px-4 py-2 rounded-xl text-[12px] font-[800] uppercase tracking-wider transition-all ${
                      isActive
                        ? 'bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/50 shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                        : 'bg-white/5 text-gray-400 border border-white/5 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {s.name}
                  </Link>
                );
              })}
            </div>
          )}

          {/* 2. LEAGUE SELECTOR */}
          {leagues.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[11px] font-[900] text-gray-500 uppercase tracking-widest mr-2">LİG:</span>
              {leagues.map((l) => {
                const lSlug = slugify(l.name);
                const isSelected = selectedLeague?.id === l.id;
                return (
                  <Link
                    key={l.id}
                    href={`/fikstur?season=${selectedSeason.slug}&league=${lSlug}`}
                    className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-[13px] font-[900] uppercase tracking-widest transition-all ${
                      isSelected
                        ? 'bg-gradient-to-r from-[#00e5ff] to-[#00b4d8] text-black shadow-[0_0_20px_rgba(0,229,255,0.4)] scale-[1.02]'
                        : 'client-glass text-gray-300 border border-white/10 hover:border-[#00e5ff]/30 hover:text-white'
                    }`}
                  >
                    <Shield className={`w-4 h-4 ${isSelected ? 'text-black' : 'text-[#00e5ff]'}`} />
                    <span>{l.name}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* 3. WEEKS QUICK JUMP */}
          {availableWeeks.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
              <span className="text-[10px] font-[900] text-gray-500 uppercase tracking-widest mr-2">HAFTA:</span>
              <Link
                href={`/fikstur?season=${selectedSeason.slug}&league=${slugify(selectedLeague?.name || '')}`}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-[800] uppercase tracking-wider transition-all ${
                  selectedWeek === null
                    ? 'bg-white text-black font-[900]'
                    : 'bg-white/5 text-gray-400 border border-white/5 hover:text-white'
                }`}
              >
                TÜMÜ
              </Link>
              {availableWeeks.map((w) => {
                const isWeekActive = selectedWeek === w;
                return (
                  <Link
                    key={w}
                    href={`/fikstur?season=${selectedSeason.slug}&league=${slugify(selectedLeague?.name || '')}&week=${w}`}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-[800] uppercase tracking-wider transition-all ${
                      isWeekActive
                        ? 'bg-[#00e5ff] text-black font-[900] shadow-[0_0_10px_rgba(0,229,255,0.3)]'
                        : 'bg-white/5 text-gray-400 border border-white/5 hover:text-white'
                    }`}
                  >
                    {w}. HAFTA
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* FIXTURE LIST */}
        {displayedWeeks.length > 0 ? (
          <div className="space-y-10">
            {displayedWeeks.map((week) => {
              const weekFixtures = groupedByWeek[week] || [];
              return (
                <div key={week} className="client-glass rounded-2xl border border-white/5 overflow-hidden">
                  
                  {/* Week Banner */}
                  <div className="bg-black/60 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[#00e5ff] shadow-[0_0_8px_rgba(0,229,255,0.8)]" />
                      <h2 className="text-[#00e5ff] text-[18px] md:text-[20px] font-[900] tracking-widest uppercase drop-shadow-[0_0_8px_rgba(0,229,255,0.3)]">
                        {week}. HAFTA
                      </h2>
                    </div>
                    <span className="text-[11px] font-[800] text-gray-500 uppercase tracking-widest">
                      {weekFixtures.length} Karşılaşma
                    </span>
                  </div>

                  {/* Matches In Week */}
                  <div className="divide-y divide-white/5">
                    {weekFixtures.map((fixture) => {
                      const homeTeam = teamMap.get(fixture.home_team_id);
                      const awayTeam = teamMap.get(fixture.away_team_id);

                      // Match resolution: prioritize APPROVED matches for official scores
                      const matchesList = Array.isArray(fixture.matches) ? fixture.matches : fixture.matches ? [fixture.matches] : [];
                      const approvedMatch = matchesList.find((m: any) => m.status === 'APPROVED');
                      const pendingMatch = matchesList.find((m: any) => m.status === 'PENDING_REVIEW');
                      const hasResult = !!approvedMatch;

                      const formattedDate = fixture.scheduled_at
                        ? new Intl.DateTimeFormat('tr-TR', {
                            timeZone: 'Europe/Istanbul',
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          }).format(new Date(fixture.scheduled_at))
                        : 'Tarih Belirtilmedi';

                      return (
                        <div
                          key={fixture.id}
                          className="p-5 md:p-6 hover:bg-white/[0.02] transition-colors flex flex-col md:flex-row items-center justify-between gap-6"
                        >
                          {/* Schedule / Status */}
                          <div className="w-full md:w-40 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center shrink-0">
                            <div className="flex items-center gap-1.5 text-[13px] font-[700] text-gray-400">
                              <Calendar className="w-3.5 h-3.5 text-[#00e5ff]" />
                              <span>{formattedDate}</span>
                            </div>
                            <span
                              className={`text-[9px] font-[900] tracking-widest uppercase mt-1.5 px-2.5 py-1 rounded-md ${
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

                          {/* Match Core: Home - Score - Away */}
                          <div className="flex-1 flex items-center justify-center gap-3 md:gap-6 w-full max-w-[700px]">
                            
                            {/* Home Team */}
                            <Link
                              href={homeTeam?.slug ? `/takim/${homeTeam.slug}` : '#'}
                              className="flex-1 flex items-center justify-end gap-3 group min-w-0"
                            >
                              <span className="text-[14px] md:text-[18px] lg:text-[20px] font-[800] text-white tracking-wide text-right group-hover:text-[#00e5ff] transition-colors truncate">
                                {homeTeam?.name || 'Ev Sahibi'}
                              </span>
                              <div className="w-9 h-9 md:w-11 md:h-11 shrink-0 rounded-full bg-[#060d18] border border-white/10 overflow-hidden flex items-center justify-center group-hover:border-[#00e5ff]/50 transition-all p-1 shadow-md">
                                {homeTeam?.logo_url ? (
                                  <img src={homeTeam.logo_url} alt="" className="w-full h-full object-contain" />
                                ) : (
                                  <span className="text-[12px] font-black text-[#00e5ff]">
                                    {homeTeam?.name?.charAt(0) || 'H'}
                                  </span>
                                )}
                              </div>
                            </Link>

                            {/* Center Score Block */}
                            <div className="shrink-0 flex flex-col items-center justify-center">
                              {hasResult ? (
                                <Link
                                  href={`/mac/${approvedMatch.id}`}
                                  title="Maç Detayını İncele"
                                  className="group flex flex-col items-center"
                                >
                                  <div className="px-4 py-2 bg-[#060d18] border border-[#00e5ff]/30 rounded-xl flex items-center justify-center shadow-[0_0_12px_rgba(0,229,255,0.15)] group-hover:border-[#00e5ff] transition-all">
                                    <span className="text-[20px] md:text-[24px] font-[900] text-white tracking-wider group-hover:text-[#00e5ff] transition-colors">
                                      {approvedMatch.home_score} - {approvedMatch.away_score}
                                    </span>
                                  </div>
                                  <span className="text-[9px] font-[800] text-gray-500 uppercase tracking-widest mt-1 group-hover:text-[#00e5ff] transition-colors inline-flex items-center gap-0.5">
                                    Detay <ChevronRight className="w-3 h-3" />
                                  </span>
                                </Link>
                              ) : pendingMatch ? (
                                <div className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex flex-col items-center">
                                  <span className="text-[11px] font-[900] text-amber-400 tracking-wider">İNCELENİYOR</span>
                                </div>
                              ) : (
                                <div className="w-16 h-10 bg-[#060d18] border border-white/10 rounded-xl flex items-center justify-center">
                                  <span className="text-[13px] font-[900] text-gray-500 tracking-widest">VS</span>
                                </div>
                              )}
                            </div>

                            {/* Away Team */}
                            <Link
                              href={awayTeam?.slug ? `/takim/${awayTeam.slug}` : '#'}
                              className="flex-1 flex items-center justify-start gap-3 group min-w-0"
                            >
                              <div className="w-9 h-9 md:w-11 md:h-11 shrink-0 rounded-full bg-[#060d18] border border-white/10 overflow-hidden flex items-center justify-center group-hover:border-[#00e5ff]/50 transition-all p-1 shadow-md">
                                {awayTeam?.logo_url ? (
                                  <img src={awayTeam.logo_url} alt="" className="w-full h-full object-contain" />
                                ) : (
                                  <span className="text-[12px] font-black text-[#00e5ff]">
                                    {awayTeam?.name?.charAt(0) || 'A'}
                                  </span>
                                )}
                              </div>
                              <span className="text-[14px] md:text-[18px] lg:text-[20px] font-[800] text-white tracking-wide text-left group-hover:text-[#00e5ff] transition-colors truncate">
                                {awayTeam?.name || 'Deplasman'}
                              </span>
                            </Link>

                          </div>

                          {/* Action Button */}
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
              );
            })}
          </div>
        ) : (
          <div className="client-glass rounded-2xl border border-white/5 p-16 text-center">
            <Shield className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-[900] text-white uppercase tracking-wider mb-2">
              FİKSTÜR BULUNAMADI
            </h3>
            <p className="text-[14px] text-gray-400 max-w-md mx-auto">
              Seçilen lig ve sezona ait fikstür henüz oluşturulmadı veya bu haftada planlanmış karşılaşma bulunmuyor.
            </p>
          </div>
        )}

      </div>
    </main>
  );
}
