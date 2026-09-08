import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Calendar, Shield, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filter?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: team } = await supabase
    .from('teams')
    .select('name')
    .eq('slug', slug)
    .single();

  if (!team) return { title: 'Takım Bulunamadı' };

  return {
    title: `${team.name} - Tam Fikstür ve Maç Takvimi | TETA League`,
    description: `${team.name} takımının sezon fikstürü, iç saha ve deplasman maçları ve maç sonuçları.`,
  };
}

export default async function TeamFullFixturePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const currentFilter = resolvedSearchParams.filter || 'all';

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Fetch Team
  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!team) {
    notFound();
  }

  // 2. Fetch Active League & Season for this team
  const { data: leagueTeamData } = await supabase
    .from('league_teams')
    .select(`
      season_id,
      league_id,
      leagues!inner ( 
        id,
        name, 
        level,
        seasons!inner ( id, name, slug, status )
      )
    `)
    .eq('team_id', team.id)
    .in('leagues.seasons.status', ['UPCOMING', 'ACTIVE'])
    .limit(1)
    .maybeSingle();

  const activeLeague: any = Array.isArray(leagueTeamData?.leagues) ? leagueTeamData.leagues[0] : leagueTeamData?.leagues;
  const activeSeason: any = Array.isArray(activeLeague?.seasons) ? activeLeague.seasons[0] : activeLeague?.seasons;

  // 3. Fetch all fixtures for the team in this active season (both home and away)
  let fixtures: any[] = [];
  if (activeSeason) {
    const { data: fixData } = await supabase
      .from('fixtures')
      .select(`
        id,
        week_number,
        scheduled_at,
        status,
        home_team_id,
        away_team_id,
        league_id,
        matches (
          id,
          home_score,
          away_score,
          status,
          played_at
        )
      `)
      .or(`home_team_id.eq.${team.id},away_team_id.eq.${team.id}`)
      .eq('season_id', activeSeason.id)
      .order('week_number', { ascending: true })
      .order('scheduled_at', { ascending: true });

    fixtures = fixData || [];
  }

  // 4. Fetch all teams to map details
  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, slug, logo_url');

  const teamMap = new Map((teamsData || []).map((t) => [t.id, t]));

  // 5. Compute stats from team's fixtures
  let totalPlayed = 0;
  let totalWins = 0;
  let totalDraws = 0;
  let totalLosses = 0;

  fixtures.forEach((f) => {
    const matchesList = Array.isArray(f.matches) ? f.matches : f.matches ? [f.matches] : [];
    const appMatch = matchesList.find((m: any) => m.status === 'APPROVED');
    if (appMatch) {
      totalPlayed++;
      const isHome = f.home_team_id === team.id;
      const myScore = isHome ? (appMatch.home_score ?? 0) : (appMatch.away_score ?? 0);
      const oppScore = isHome ? (appMatch.away_score ?? 0) : (appMatch.home_score ?? 0);
      if (myScore > oppScore) totalWins++;
      else if (myScore === oppScore) totalDraws++;
      else totalLosses++;
    }
  });

  // 6. Apply filter
  const filteredFixtures = fixtures.filter((f) => {
    const matchesList = Array.isArray(f.matches) ? f.matches : f.matches ? [f.matches] : [];
    const hasApproved = matchesList.some((m: any) => m.status === 'APPROVED');
    const isHome = f.home_team_id === team.id;

    if (currentFilter === 'home') return isHome;
    if (currentFilter === 'away') return !isHome;
    if (currentFilter === 'completed') return hasApproved;
    if (currentFilter === 'upcoming') return !hasApproved && f.status !== 'CANCELLED';
    return true; // 'all'
  });

  const filterOptions = [
    { key: 'all', label: 'TÜM MAÇLAR' },
    { key: 'upcoming', label: 'YAKLAŞANLAR' },
    { key: 'completed', label: 'TAMAMLANANLAR' },
    { key: 'home', label: 'İÇ SAHA (EV)' },
    { key: 'away', label: 'DEPLASMAN' },
  ];

  return (
    <main className="min-h-screen bg-[#01060b] py-10 lg:py-16">
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6">
        
        {/* BACK BUTTON */}
        <div className="mb-6">
          <Link
            href={`/takim/${team.slug}`}
            className="inline-flex items-center gap-2 text-[13px] font-[800] text-gray-400 hover:text-[#00e5ff] transition-colors uppercase tracking-wider"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>{team.name} Profiline Dön</span>
          </Link>
        </div>

        {/* TEAM HEADER CARD */}
        <div className="client-glass rounded-2xl p-6 lg:p-8 border border-white/5 bg-[#03070c] mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-[#00e5ff] rounded-full blur-[140px] opacity-[0.05] pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
            {/* Logo */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#060d18] border border-white/10 p-2 flex items-center justify-center shrink-0 shadow-xl">
              {team.logo_url ? (
                <img src={team.logo_url} alt={team.name} className="w-full h-full object-contain" />
              ) : (
                <span className="text-3xl font-black text-[#00e5ff]">
                  {team.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-2">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-[900] text-white tracking-tight uppercase">
                  {team.name}
                </h1>
                <span className="data-label !bg-[#00e5ff]/10 !text-[#00e5ff] border border-[#00e5ff]/30 text-[11px] self-center sm:self-auto">
                  TAM FİKSTÜR
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 text-[12px] font-[700] text-gray-400 uppercase tracking-widest mt-3">
                {activeLeague && (
                  <span className="px-3 py-1 rounded bg-white/5 border border-white/10 text-white font-[800]">
                    {activeLeague.name}
                  </span>
                )}
                {activeSeason && (
                  <span className="px-3 py-1 rounded bg-white/5 border border-white/10 text-gray-300">
                    {activeSeason.name}
                  </span>
                )}
                <span className="text-gray-400">
                  SEZON FORMU:{' '}
                  <span className="text-emerald-400 font-bold">{totalWins}G</span> •{' '}
                  <span className="text-gray-300 font-bold">{totalDraws}B</span> •{' '}
                  <span className="text-red-400 font-bold">{totalLosses}M</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="flex flex-wrap items-center gap-2 mb-8">
          {filterOptions.map((opt) => {
            const isActive = currentFilter === opt.key;
            return (
              <Link
                key={opt.key}
                href={`/takim/${team.slug}/fikstur?filter=${opt.key}`}
                className={`px-4 py-2.5 rounded-xl text-[12px] font-[800] uppercase tracking-wider transition-all ${
                  isActive
                    ? 'bg-[#00e5ff] text-black font-[900] shadow-[0_0_15px_rgba(0,229,255,0.3)]'
                    : 'bg-white/5 text-gray-400 border border-white/5 hover:text-white hover:bg-white/10'
                }`}
              >
                {opt.label}
              </Link>
            );
          })}
        </div>

        {/* FIXTURE LIST */}
        {filteredFixtures.length > 0 ? (
          <div className="space-y-4">
            {filteredFixtures.map((fixture) => {
              const isHome = fixture.home_team_id === team.id;
              const opponentId = isHome ? fixture.away_team_id : fixture.home_team_id;
              const opponent = teamMap.get(opponentId);

              const matchesList = Array.isArray(fixture.matches) ? fixture.matches : fixture.matches ? [fixture.matches] : [];
              const approvedMatch = matchesList.find((m: any) => m.status === 'APPROVED');
              const pendingMatch = matchesList.find((m: any) => m.status === 'PENDING_REVIEW');
              const hasResult = !!approvedMatch;

              let resultType: 'win' | 'draw' | 'loss' | null = null;
              let myScore = 0;
              let oppScore = 0;

              if (hasResult) {
                myScore = isHome ? (approvedMatch.home_score ?? 0) : (approvedMatch.away_score ?? 0);
                oppScore = isHome ? (approvedMatch.away_score ?? 0) : (approvedMatch.home_score ?? 0);
                if (myScore > oppScore) resultType = 'win';
                else if (myScore === oppScore) resultType = 'draw';
                else resultType = 'loss';
              }

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
                  className={`client-glass rounded-xl p-5 border transition-all flex flex-col md:flex-row items-center justify-between gap-5 ${
                    resultType === 'win'
                      ? 'border-emerald-500/20 bg-emerald-500/[0.02] hover:border-emerald-500/40'
                      : resultType === 'loss'
                      ? 'border-red-500/20 bg-red-500/[0.02] hover:border-red-500/40'
                      : 'border-white/5 bg-[#03070c] hover:border-white/10'
                  }`}
                >
                  {/* Left: Week & Date */}
                  <div className="w-full md:w-48 flex flex-row md:flex-col items-center md:items-start justify-between md:justify-center shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-[900] text-white tracking-widest uppercase">
                        {fixture.week_number}. HAFTA
                      </span>
                      <span
                        className={`text-[9px] font-[900] px-2 py-0.5 rounded tracking-widest uppercase ${
                          isHome
                            ? 'bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/30'
                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                        }`}
                      >
                        {isHome ? 'İÇ SAHA' : 'DEPLASMAN'}
                      </span>
                    </div>
                    <span className="text-[12px] font-[700] text-gray-400 mt-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-gray-500" />
                      {formattedDate}
                    </span>
                  </div>

                  {/* Center: Team vs Opponent */}
                  <div className="flex-1 flex items-center justify-center gap-4 w-full max-w-[550px]">
                    
                    {/* Our Team */}
                    <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
                      <span className="text-[15px] md:text-[18px] font-[900] text-white tracking-wide text-right truncate">
                        {team.name}
                      </span>
                      <div className="w-9 h-9 shrink-0 rounded-full bg-[#060d18] border border-white/10 overflow-hidden flex items-center justify-center p-1">
                        {team.logo_url ? (
                          <img src={team.logo_url} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-[11px] font-black text-[#00e5ff]">
                            {team.name.charAt(0)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Center Score / State */}
                    <div className="shrink-0 flex items-center justify-center">
                      {hasResult ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black ${
                              resultType === 'win'
                                ? 'bg-emerald-500 text-black'
                                : resultType === 'loss'
                                ? 'bg-red-500 text-white'
                                : 'bg-gray-500 text-white'
                            }`}
                          >
                            {resultType === 'win' ? 'G' : resultType === 'loss' ? 'M' : 'B'}
                          </span>
                          <div className="px-3 py-1.5 bg-black/60 border border-white/10 rounded-lg text-center min-w-[70px]">
                            <span className="text-[18px] font-[900] text-white tracking-wider">
                              {myScore} - {oppScore}
                            </span>
                          </div>
                        </div>
                      ) : pendingMatch ? (
                        <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                          <span className="text-[11px] font-[900] text-amber-400 tracking-wider">ONAY BEKLİYOR</span>
                        </div>
                      ) : fixture.status === 'POSTPONED' ? (
                        <span className="text-[11px] font-[800] text-orange-400 bg-orange-500/10 border border-orange-500/30 px-3 py-1 rounded-lg">
                          ERTELENDİ
                        </span>
                      ) : (
                        <div className="w-14 h-9 bg-black/40 border border-white/10 rounded-lg flex items-center justify-center">
                          <span className="text-[12px] font-[900] text-gray-500">VS</span>
                        </div>
                      )}
                    </div>

                    {/* Opponent Team */}
                    <Link
                      href={opponent?.slug ? `/takim/${opponent.slug}` : '#'}
                      className="flex-1 flex items-center justify-start gap-3 min-w-0 group"
                    >
                      <div className="w-9 h-9 shrink-0 rounded-full bg-[#060d18] border border-white/10 overflow-hidden flex items-center justify-center p-1 group-hover:border-[#00e5ff] transition-colors">
                        {opponent?.logo_url ? (
                          <img src={opponent.logo_url} alt="" className="w-full h-full object-contain" />
                        ) : (
                          <span className="text-[11px] font-black text-[#00e5ff]">
                            {opponent?.name?.charAt(0) || 'R'}
                          </span>
                        )}
                      </div>
                      <span className="text-[15px] md:text-[18px] font-[800] text-gray-300 group-hover:text-[#00e5ff] tracking-wide text-left truncate transition-colors">
                        {opponent?.name || 'Rakip'}
                      </span>
                    </Link>

                  </div>

                  {/* Right: Match Action */}
                  <div className="w-full md:w-36 flex justify-end shrink-0">
                    {hasResult ? (
                      <Link
                        href={`/mac/${approvedMatch.id}`}
                        className="w-full md:w-auto text-center px-4 py-2 bg-white/5 hover:bg-[#00e5ff]/15 border border-white/10 hover:border-[#00e5ff]/30 text-gray-300 hover:text-[#00e5ff] text-[11px] font-[800] tracking-wider uppercase rounded-xl transition-all inline-flex items-center justify-center gap-1"
                      >
                        <span>MAÇ RAPORU</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    ) : (
                      <span className="text-[11px] font-[700] text-gray-500 uppercase tracking-widest hidden md:block">
                        BEKLİYOR
                      </span>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        ) : (
          <div className="client-glass rounded-2xl border border-white/5 p-16 text-center">
            <Shield className="w-16 h-16 text-gray-600 mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-[900] text-white uppercase tracking-wider mb-2">
              MAÇ BULUNAMADI
            </h3>
            <p className="text-[14px] text-gray-400 max-w-md mx-auto">
              Seçilen filtre kriterlerine uygun karşılaşma bulunamadı.
            </p>
          </div>
        )}

      </div>
    </main>
  );
}
