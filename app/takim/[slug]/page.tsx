import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import TeamRosterCarousel from '../TeamRosterCarousel';
import TeamLogo from '@/components/TeamLogo';
import { getCachedTeamPageData } from './team-page-data';

interface Props {
  params: Promise<{ slug: string }>;
}

export const revalidate = 60; // 1 min public cache

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const pageData = await getCachedTeamPageData(slug);
  const team = pageData?.team;

  if (!team) return { title: 'Takım Bulunamadı' };

  return {
    title: `${team.name} | TETA League`,
    description: `${team.name} takımının aktif kadrosu, güncel lig durumu ve detayları. TETA League e-spor platformu.`,
  };
}

export default async function TeamPage({ params }: Props) {
  const { slug } = await params;
  const pageData = await getCachedTeamPageData(slug);

  if (!pageData || !pageData.team) {
    notFound();
  }

  const {
    team,
    activeLeague,
    activeSeason,
    teamTrophies,
    allTimeWins,
    allTimeDraws,
    allTimeLosses,
    roster,
    recentMatches,
    upcomingMatches,
    transferSlots,
    totalTeamValue,
    stats
  } = pageData;

  const shortTag = `#${(team.ea_club_name || team.slug.substring(0, 3)).toUpperCase()}`;

  return (
    <div className="mx-auto max-w-[1400px] px-4 lg:px-6 py-12 md:py-16 page-enter">

      {/* HERO SECTION */}
      <div className="client-glass rounded-2xl p-6 lg:p-10 relative overflow-hidden mb-8 border border-[#00e5ff]/20 bg-[#01060b]">
        {/* Subtle Background Elements */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#00e5ff] rounded-full blur-[150px] opacity-[0.07] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[#00e5ff] rounded-full blur-[120px] opacity-[0.03] pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-8">
          {/* Logo */}
          <TeamLogo src={team.logo_url} name={team.name} size="hero" />

          {/* Info */}
          <div className="flex-1 text-center md:text-left flex flex-col justify-center pt-2">

            <div className="flex flex-col md:flex-row md:items-center gap-4 mb-3">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-[900] text-white tracking-tight uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                {team.name}
              </h1>
              <span className="data-label !bg-transparent !text-gray-400 border border-white/10 self-center md:self-auto text-[13px]">
                {shortTag}
              </span>
              {!team.is_active && (
                <span className="data-label !bg-red-500/10 !text-red-400 border border-red-500/30 self-center md:self-auto">
                  PASİF
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-6">
              <p className="text-[#00e5ff] text-[14px] font-[700] tracking-[0.2em] uppercase">
                EA CLUB ID: <span className="text-white">{team.ea_club_id || "BİLİNMİYOR"}</span>
              </p>

              {(team.stream_url || team.instagram_url) && (
                <div className="flex items-center gap-2">
                  {team.stream_url && (
                    <a
                      href={team.stream_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 border border-[#00e5ff]/30 text-[#00e5ff] text-[12px] font-[800] uppercase tracking-wider transition-all shadow-[0_0_12px_rgba(0,229,255,0.15)] group"
                    >
                      <span className="w-2 h-2 rounded-full bg-[#00e5ff] animate-pulse" />
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 3l14 9-14 9V3z" />
                      </svg>
                      YAYIN
                    </a>
                  )}
                  {team.instagram_url && (
                    <a
                      href={team.instagram_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 text-pink-400 text-[12px] font-[800] uppercase tracking-wider transition-all"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                      Instagram
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
              {activeLeague && activeSeason ? (
                <>
                  <div className="px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl flex flex-col">
                    <span className="text-[10px] text-gray-500 font-[900] uppercase tracking-[0.2em] mb-1">Aktif Lig</span>
                    <span className="text-[14px] text-white font-[800] tracking-widest uppercase">{activeLeague.name}</span>
                  </div>
                  <div className="px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl flex flex-col">
                    <span className="text-[10px] text-gray-500 font-[900] uppercase tracking-[0.2em] mb-1">Sezon</span>
                    <span className="text-[14px] text-white font-[800] tracking-widest uppercase">{activeSeason.name}</span>
                  </div>
                </>
              ) : (
                <div className="px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl">
                  <span className="text-[13px] text-gray-500 font-bold uppercase tracking-widest">Kayıtlı Aktif Lig Yok</span>
                </div>
              )}

              {/* Transfer Slotu */}
              <div className="px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl flex flex-col">
                <span className="text-[10px] text-gray-400 font-[900] uppercase tracking-[0.2em] mb-1">TRANSFER SLOTU</span>
                <span className="text-[14px] text-white font-[800] tracking-widest uppercase font-mono">
                  {transferSlots.isUnlimited ? (
                    <span className="text-[#00e5ff]">SINIRSIZ</span>
                  ) : (
                    `${transferSlots.remaining} / ${transferSlots.total}`
                  )}
                </span>
              </div>

              {/* Team Market Value Badge */}
              {totalTeamValue > 0 && (
                <div className="px-6 py-3 bg-gradient-to-br from-[#00e5ff]/10 to-transparent backdrop-blur-md border border-[#00e5ff]/30 rounded-xl flex flex-col shadow-[0_0_15px_rgba(0,229,255,0.1)] relative overflow-hidden group">
                  <div className="absolute inset-0 bg-[#00e5ff] opacity-0 group-hover:opacity-[0.05] transition-opacity" />
                  <span className="text-[10px] text-[#00e5ff] font-[900] uppercase tracking-[0.2em] mb-1 z-10">KADRO DEĞERİ</span>
                  <span className="text-[16px] text-white font-[900] tracking-wider uppercase z-10">
                    {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(totalTeamValue)}
                  </span>
                </div>
              )}

              {/* TÜM ZAMANLAR STATS BADGE */}
              <div className="px-5 py-3 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl flex flex-col">
                <span className="text-[10px] text-gray-400 font-[900] uppercase tracking-[0.2em] mb-1">TÜM ZAMANLAR</span>
                <div className="flex items-center gap-2 text-[14px] font-[900]">
                  <span className="text-emerald-400">{allTimeWins} <span className="text-[10px] text-gray-400 font-bold">G</span></span>
                  <span className="text-white/20">•</span>
                  <span className="text-gray-300">{allTimeDraws} <span className="text-[10px] text-gray-400 font-bold">B</span></span>
                  <span className="text-white/20">•</span>
                  <span className="text-red-400">{allTimeLosses} <span className="text-[10px] text-gray-400 font-bold">M</span></span>
                </div>
              </div>

              {/* KUPA VİTRİNİ ROZETİ */}
              {teamTrophies.length > 0 && (
                <div className="px-5 py-3 bg-gradient-to-br from-amber-500/10 to-transparent backdrop-blur-md border border-amber-500/30 rounded-xl flex flex-col shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                  <span className="text-[10px] text-amber-400 font-[900] uppercase tracking-[0.2em] mb-1">KUPA VİTRİNİ</span>
                  <span className="text-[14px] text-white font-[900] tracking-wider uppercase font-mono flex items-center gap-1.5">
                    🏆 {teamTrophies.length} KUPA
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TEAM STATS ROW */}
      {stats && (
        <div className="mb-12">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-[11px] font-[900] text-gray-500 uppercase tracking-[0.2em]">
              SEZON İSTATİSTİKLERİ ({activeSeason?.name || 'GÜNCEL'})
            </h3>
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">
              TÜM ZAMANLAR: {allTimeWins}G / {allTimeDraws}B / {allTimeLosses}M
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { label: "OYNANAN", value: stats.matches_played },
            { label: "GALİBİYET", value: stats.wins, color: "text-emerald-400" },
            { label: "BERABERLİK", value: stats.draws, color: "text-gray-300" },
            { label: "MAĞLUBİYET", value: stats.losses, color: "text-red-400" },
            { label: "PUAN", value: stats.points, highlight: true },
            { label: "ATILAN", value: stats.goals_for },
            { label: "YENİLEN", value: stats.goals_against },
            { label: "AVERAJ", value: stats.goal_difference }
          ].map((stat, i) => (
            <div key={i} className={`client-glass rounded-xl border p-4 text-center flex flex-col justify-center hover:-translate-y-0.5 transition-all duration-200 ${stat.highlight ? 'border-[#00e5ff]/30 bg-[#00e5ff]/5 shadow-[0_0_15px_rgba(0,229,255,0.08)]' : 'border-white/5 bg-[#03070c] hover:border-white/10'}`}>
              <span className={`text-[9px] font-[900] tracking-[0.2em] uppercase mb-2 ${stat.highlight ? 'text-[#00e5ff]' : 'text-gray-500'}`}>{stat.label}</span>
              <span className={`text-xl lg:text-2xl font-[900] ${stat.highlight ? 'text-[#00e5ff] drop-shadow-[0_0_10px_rgba(0,229,255,0.4)]' : (stat.color || 'text-white')}`}>
                {stat.value}
              </span>
            </div>
          ))}
          </div>
        </div>
      )}

      {/* MAIN ROSTER SECTION */}
      <div className="mb-16">
        <div className="flex items-center gap-4 mb-8">
          <h2 className="text-2xl md:text-3xl font-[900] text-white tracking-widest uppercase flex items-center gap-3">
            <span className="w-2 h-8 bg-[#00e5ff] rounded-full inline-block" />
            KADRO
          </h2>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </div>

        <TeamRosterCarousel players={roster} />
      </div>

      {/* KUPA VİTRİNİ SECTION */}
      <div className="mb-16">
        <div className="flex items-center gap-4 mb-8">
          <h2 className="text-2xl md:text-3xl font-[900] text-white tracking-widest uppercase flex items-center gap-3">
            <span className="w-2 h-8 bg-amber-400 rounded-full inline-block shadow-[0_0_12px_rgba(245,158,11,0.5)]" />
            KUPA VİTRİNİ
          </h2>
          <div className="flex-1 h-px bg-gradient-to-r from-amber-500/20 via-white/10 to-transparent" />
          {teamTrophies.length > 0 && (
            <span className="text-xs font-black px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-wider font-mono">
              {teamTrophies.length} Kupa
            </span>
          )}
        </div>

        {teamTrophies.length > 0 ? (() => {
          const groupedTeamTrophies = Array.from(
            teamTrophies.reduce((map: Map<string, any>, tw: any) => {
              const tid = tw.trophy?.id || tw.id;
              if (!map.has(tid)) {
                map.set(tid, {
                  id: tw.id,
                  trophy: tw.trophy,
                  count: 0,
                  awarded_at: tw.awarded_at,
                  notes: [] as string[],
                });
              }
              const entry = map.get(tid);
              entry.count += 1;
              if (tw.notes && !entry.notes.includes(tw.notes)) {
                entry.notes.push(tw.notes);
              }
              if (tw.awarded_at && (!entry.awarded_at || new Date(tw.awarded_at) > new Date(entry.awarded_at))) {
                entry.awarded_at = tw.awarded_at;
              }
              return map;
            }, new Map<string, any>()).values()
          );

          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {groupedTeamTrophies.map((item: any) => {
                const tr = item.trophy;
                const seasonDisplay = tr?.season?.name || tr?.season_name;
                return (
                  <div
                    key={item.id}
                    className="group relative bg-[#03070c] border border-white/5 hover:border-amber-400/40 rounded-2xl p-6 text-center transition-all duration-300 hover:shadow-[0_0_25px_rgba(245,158,11,0.2)] hover:-translate-y-0.5 flex flex-col items-center justify-between overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-amber-500/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* Top row: Category Badge & Repeat Count */}
                    <div className="w-full flex items-center justify-between mb-3 gap-1.5">
                      {tr?.category ? (
                        <span className="text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/5 group-hover:border-amber-400/30 group-hover:text-amber-300 transition-colors truncate">
                          {tr.category}
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-black shadow-sm font-mono shrink-0">
                        {item.count}x
                      </span>
                    </div>

                    {/* Trophy Image */}
                    <div className="w-20 h-20 my-2 flex items-center justify-center relative">
                      {tr?.image_url ? (
                        <img
                          src={tr.image_url}
                          alt={tr.title}
                          className="max-h-full max-w-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)] group-hover:scale-105 transition-transform duration-300 select-none"
                        />
                      ) : (
                        <span className="text-4xl select-none">🏆</span>
                      )}
                    </div>

                    {/* Title & Season */}
                    <div className="mt-2 w-full">
                      <h4 className="text-[13px] font-[900] text-white tracking-wide uppercase line-clamp-2 group-hover:text-amber-300 transition-colors">
                        {tr?.title || 'Kupa'}
                      </h4>
                      {seasonDisplay && (
                        <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded bg-black/60 border border-white/10 text-[10px] font-black text-amber-300 uppercase tracking-wider">
                          {seasonDisplay}
                        </span>
                      )}
                      {item.notes.length > 0 && (
                        <p className="text-[11px] font-medium text-gray-400 mt-2 line-clamp-2 italic" title={item.notes.join(' • ')}>
                          "{item.notes.join(' • ')}"
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })() : (
          <div className="bg-[#03070c] border border-white/5 rounded-2xl p-10 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-center text-2xl mb-3 text-gray-600">
              🏆
            </div>
            <h3 className="text-sm font-[900] text-white uppercase tracking-wide mb-1">
              Henüz Kazanılmış Kupa Yok
            </h3>
            <p className="text-xs text-gray-500 font-medium max-w-sm">
              Bu takıma ait henüz vitrinde sergilenecek resmi bir kupa bulunmuyor.
            </p>
          </div>
        )}
      </div>

      {/* MATCHES SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Upcoming Matches */}
          <div className="client-glass rounded-xl border border-white/5 p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[12px] font-[900] text-gray-400 tracking-[0.2em] uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Yaklaşan Maçlar
              </h3>
            </div>
            <div className="space-y-3">
              {upcomingMatches.length > 0 ? (
                upcomingMatches.map(match => {
                  const opponent = match.opponent;
                  const dateStr = match.date
                    ? new Intl.DateTimeFormat('tr-TR', {
                        timeZone: 'Europe/Istanbul',
                        day: 'numeric',
                        month: 'short',
                      }).format(new Date(match.date))
                    : `${match.week_number}. Hafta`;
                  const timeStr = match.date
                    ? new Intl.DateTimeFormat('tr-TR', {
                        timeZone: 'Europe/Istanbul',
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(new Date(match.date))
                    : (match.status === 'PENDING_REVIEW' ? 'İNCELEMEDE' : 'VS');

                  return (
                    <div key={match.id || match.fixture_id} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-[#00e5ff]/30 transition-all duration-200 group">
                      <div className="flex flex-col items-center justify-center min-w-[65px] pr-4 border-r border-white/10">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">
                          {dateStr}
                        </span>
                        <span className={`text-[11px] font-black uppercase ${match.status === 'PENDING_REVIEW' ? 'text-amber-400' : 'text-white'}`}>
                          {timeStr}
                        </span>
                      </div>
                      <div className="flex-1 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 truncate">
                          <TeamLogo src={opponent?.logo_url} name={opponent?.name} size="sm" className="group-hover:scale-[1.04] transition-transform duration-200" />
                          <Link href={opponent?.slug ? `/takim/${opponent.slug}` : "#"} className="text-[14px] font-[800] text-gray-300 hover:text-[#00e5ff] truncate transition-colors">
                            {opponent?.name || 'Rakip Takım'}
                          </Link>
                        </div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase px-2 py-0.5 rounded bg-white/5 shrink-0">
                          {match.isHome ? 'EV' : 'DEP'}
                        </span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-[13px] text-gray-500 italic p-4 bg-white/[0.02] rounded-xl border border-white/5">Yaklaşan maç bulunmuyor.</div>
              )}
            </div>
          </div>

          {/* Recent Matches */}
          <div className="client-glass rounded-xl border border-white/5 p-6 md:p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[12px] font-[900] text-gray-400 tracking-[0.2em] uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#00e5ff]" />
                Son Maçlar
              </h3>
            </div>
            <div className="space-y-3">
              {recentMatches.length > 0 ? (
                recentMatches.map(match => {
                  const opponent = match.opponent;
                  const myScore = match.myScore;
                  const oppScore = match.oppScore;
                  let resultClass = "text-gray-400 bg-white/5"; // draw
                  if (myScore > oppScore) resultClass = "text-emerald-400 bg-emerald-500/10"; // win
                  else if (myScore < oppScore) resultClass = "text-red-400 bg-red-500/10"; // loss

                  const dateStr = match.date
                    ? new Intl.DateTimeFormat('tr-TR', {
                        timeZone: 'Europe/Istanbul',
                        day: 'numeric',
                        month: 'short',
                      }).format(new Date(match.date))
                    : `${match.week_number}. Hafta`;

                  return (
                    <Link href={`/mac/${match.id}`} key={match.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-[#00e5ff]/30 transition-all duration-200 group">
                      <div className="flex flex-col items-center justify-center min-w-[65px] pr-4 border-r border-white/10">
                        <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">
                          {dateStr}
                        </span>
                        <span className="text-[9px] font-bold text-gray-500 uppercase">
                          {match.isHome ? 'EV' : 'DEP'}
                        </span>
                      </div>
                      <div className="flex-1 flex items-center justify-between">
                        <div className="flex items-center gap-3 truncate">
                          <TeamLogo src={opponent?.logo_url} name={opponent?.name} size="sm" className="group-hover:scale-[1.04] transition-transform duration-200" />
                          <span className="text-[14px] font-[800] text-gray-300 truncate group-hover:text-[#00e5ff] transition-colors">
                            {opponent?.name || 'Rakip Takım'}
                          </span>
                        </div>
                        <div className={`px-3 py-1 rounded ml-3 shrink-0 flex items-center justify-center font-[900] text-[14px] tracking-wider ${resultClass}`}>
                          {myScore} - {oppScore}
                        </div>
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="text-[13px] text-gray-500 italic p-4 bg-white/[0.02] rounded-xl border border-white/5">Son maç bulunmuyor.</div>
              )}
            </div>
          </div>

        </div>
    </div>
  );
}
