import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PlayerStatsForm } from './PlayerStatsForm';
import { MatchEditForm } from './MatchEditForm';
import { getCachedUser } from '@/lib/fetchers';
import { canCaptainSubmitTeamReport } from '@/lib/match-reporting';

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const matchId = resolvedParams.id;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const user = await getCachedUser();
  if (!user) redirect('/giris');

  // Verify Captain
  const { data: role } = await supabase
    .from('user_roles')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('role', 'CAPTAIN')
    .eq('is_active', true)
    .is('revoked_at', null)
    .maybeSingle();

  if (!role || !role.team_id) redirect('/profil');
  const teamId = role.team_id;

  const { data: match } = await supabase
    .from('matches')
    .select('*, fixtures(week_number, status)')
    .eq('id', matchId)
    .single();

  if (!match) return <div className="p-8 text-white">Maç bulunamadı.</div>;

  if (match.home_team_id !== teamId && match.away_team_id !== teamId) {
    return <div className="p-8 text-red-500">Bu maçı inceleme yetkiniz yok.</div>;
  }

  const fixtureObj = Array.isArray(match.fixtures) ? match.fixtures[0] : match.fixtures;
  const fixtureStatus = fixtureObj?.status ?? 'SCHEDULED';

  const [{ data: homeTeam }, { data: awayTeam }] = await Promise.all([
    supabase.from('teams').select('name, logo_url').eq('id', match.home_team_id).single(),
    supabase.from('teams').select('name, logo_url').eq('id', match.away_team_id).single(),
  ]);

  // Fetch Roster (active members for this season)
  const { data: memberships } = await supabase
    .from('team_memberships')
    .select('profiles:player_id(id, username, full_name, primary_position)')
    .eq('team_id', teamId)
    .eq('season_id', match.season_id)
    .is('left_at', null);

  const roster = (memberships || []).map((m: any) => m.profiles).filter(Boolean);

  // Fetch team reports for this fixture and existing stats for THIS team
  const [{ data: existingStats }, { data: teamReports }] = await Promise.all([
    supabase
      .from('match_player_stats')
      .select('*')
      .eq('match_id', matchId)
      .eq('team_id', teamId),
    match.fixture_id
      ? supabase
          .from('match_team_reports')
          .select('*, report_players:match_team_report_players(*)')
          .eq('fixture_id', match.fixture_id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const allReports = teamReports || [];
  const myTeamReport = allReports.find((r: any) => r.team_id === teamId) || null;
  const opponentTeamReport = allReports.find((r: any) => r.team_id !== teamId) || null;

  // Completed / Approved / EA / Forfeit matches are strictly closed to captain reporting or editing
  const isClosedMatch =
    fixtureStatus !== 'SCHEDULED' ||
    match.status === 'APPROVED' ||
    match.status === 'CANCELLED' ||
    match.source === 'AUTO' ||
    match.source === 'FORFEIT';

  const isMyReportPending =
    !isClosedMatch &&
    (myTeamReport
      ? myTeamReport.status === 'PENDING_REVIEW'
      : match.status === 'PENDING_REVIEW' && match.source === 'MANUAL' && match.submitted_by === user.id);

  const submitEligibility = canCaptainSubmitTeamReport({
    fixtureStatus,
    matchSource: match.source,
    matchStatus: match.status,
    homeScore: match.home_score,
    awayScore: match.away_score,
    myTeamReportStatus: myTeamReport?.status || null,
    myTeamHasSavedStats: (existingStats || []).length > 0,
    hasAnyTeamReports: allReports.length > 0,
  });

  const effectiveStatsForForm =
    myTeamReport?.report_players && myTeamReport.report_players.length > 0
      ? myTeamReport.report_players
      : existingStats || [];

  const displayNotes = myTeamReport?.notes ?? match.notes;
  const displayScreenshot = myTeamReport?.screenshot_url ?? match.screenshot_url;
  const displayHomeScore = myTeamReport?.home_score ?? match.home_score;
  const displayAwayScore = myTeamReport?.away_score ?? match.away_score;
  const weekNo = fixtureObj?.week_number ?? fixtureObj?.matchday ?? '-';

  return (
    <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-widest uppercase mb-1">
              MAÇ DETAYI / İSTATİSTİK GİRİŞİ
            </h1>
            <p className="text-sm font-bold text-gray-400">
              Hafta {weekNo} • {new Date(match.played_at).toLocaleString('tr-TR')}
            </p>
          </div>
          <Link
            href="/takim/yonet/maclar"
            className="px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] font-black rounded tracking-widest hover:bg-white/10 transition-all"
          >
            GERİ DÖN
          </Link>
        </div>

        {/* Dual-Sided Team Report Status Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-[#0b172a] border border-white/10 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                TAKIMINIZIN RAPOR DURUMU
              </div>
              <div className="text-sm font-black text-white mt-0.5">
                {match.home_team_id === teamId ? homeTeam?.name : awayTeam?.name}
              </div>
            </div>
            {myTeamReport ? (
              <span
                className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                  myTeamReport.status === 'APPROVED'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : myTeamReport.status === 'REJECTED'
                    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                    : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                }`}
              >
                {myTeamReport.status === 'APPROVED'
                  ? 'ONAYLANDI'
                  : myTeamReport.status === 'REJECTED'
                  ? 'REDDEDİLDİ'
                  : 'ONAY BEKLİYOR'}
              </span>
            ) : (
              <span className="px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-white/5 text-gray-400 border border-white/10">
                RAPOR GÖNDERİLMEDİ
              </span>
            )}
          </div>

          <div className="bg-[#0b172a] border border-white/10 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                RAKİP TAKIMIN RAPOR DURUMU
              </div>
              <div className="text-sm font-black text-white mt-0.5">
                {match.home_team_id === teamId ? awayTeam?.name : homeTeam?.name}
              </div>
            </div>
            {opponentTeamReport ? (
              <span
                className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest ${
                  opponentTeamReport.status === 'APPROVED'
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : opponentTeamReport.status === 'REJECTED'
                    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                    : 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30'
                }`}
              >
                {opponentTeamReport.status === 'APPROVED'
                  ? 'ONAYLANDI'
                  : opponentTeamReport.status === 'REJECTED'
                  ? 'REDDEDİLDİ'
                  : 'ONAY BEKLİYOR'}
              </span>
            ) : (
              <span className="px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-white/5 text-gray-400 border border-white/10">
                RAPOR GÖNDERİLMEDİ
              </span>
            )}
          </div>
        </div>

        {/* Prompt if this captain can still submit or resubmit their team report on an unplayed SCHEDULED fixture */}
        {match.fixture_id && submitEligibility.canSubmit && (
          <div className="bg-[#0b172a] border border-[#00e5ff]/40 rounded-xl p-5 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-[#00e5ff] uppercase tracking-widest">
                {myTeamReport?.status === 'REJECTED'
                  ? 'TAKIM RAPORUNUZ REDDEDİLDİ — YENİDEN GÖNDEREBİLİRSİNİZ'
                  : 'TAKIMINIZIN MAÇ RAPORU HENÜZ GÖNDERİLMEDİ'}
              </h3>
              <p className="text-xs font-bold text-gray-300 mt-1">
                {myTeamReport?.status === 'REJECTED'
                  ? `Red Gerekçesi: ${myTeamReport.rejection_reason || 'Belirtilmedi'}`
                  : 'Rakip kaptan rapor göndermiş olsa bile kendi takımınızın ilk 11 kadrosunu, istatistiklerini ve kanıt görselini bağımsız olarak gönderebilirsiniz.'}
              </p>
            </div>
            <Link
              href={`/takim/yonet/maclar/yeni?fixture=${match.fixture_id}`}
              className="px-5 py-3 bg-[#00e5ff] text-black text-xs font-black rounded-lg tracking-widest uppercase hover:bg-[#00b8d4] transition-all shrink-0 text-center"
            >
              {myTeamReport?.status === 'REJECTED'
                ? 'YENİDEN RAPOR GÖNDER &rarr;'
                : 'TAKIM RAPORU GÖNDER &rarr;'}
            </Link>
          </div>
        )}

        {/* Scoreboard */}
        <div className="card-surface p-6 rounded-xl border border-white/5 mb-8">
          <div className="flex items-center justify-center gap-8">
            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase mb-2">
                Ev Sahibi
              </span>
              <span className="text-xl font-black text-white text-center">{homeTeam?.name}</span>
            </div>

            <div className="flex flex-col items-center">
              <div className="flex items-center gap-4 bg-[#0a1628] px-6 py-4 rounded-xl border border-white/10">
                <span className="text-3xl font-black text-white">{match.home_score}</span>
                <span className="text-xl font-black text-gray-600">-</span>
                <span className="text-3xl font-black text-white">{match.away_score}</span>
              </div>
              <span
                className={`mt-3 px-2 py-1 rounded text-[10px] font-black tracking-widest uppercase ${
                  match.status === 'APPROVED'
                    ? 'bg-emerald-500/10 text-emerald-500'
                    : match.status === 'REJECTED'
                    ? 'bg-red-500/10 text-red-500'
                    : 'bg-yellow-500/10 text-yellow-500'
                }`}
              >
                GENEL MAÇ: {match.status}
              </span>
            </div>

            <div className="flex flex-col items-center flex-1">
              <span className="text-[10px] text-gray-500 font-black tracking-widest uppercase mb-2">
                Deplasman
              </span>
              <span className="text-xl font-black text-white text-center">{awayTeam?.name}</span>
            </div>
          </div>
        </div>

        {/* Match Score and Proof Edit Form (When captain's report is PENDING_REVIEW on an unplayed SCHEDULED fixture) */}
        {isMyReportPending && (
          <MatchEditForm
            matchId={matchId}
            teamId={teamId}
            homeTeamName={homeTeam?.name || 'Ev Sahibi'}
            awayTeamName={awayTeam?.name || 'Deplasman'}
            initialHomeScore={displayHomeScore}
            initialAwayScore={displayAwayScore}
            initialScreenshotUrl={displayScreenshot}
            initialNotes={displayNotes}
          />
        )}

        {/* Notes & Screenshot Display (Read-Only overview) */}
        {(displayNotes || displayScreenshot) && (
          <div className="card-surface p-6 rounded-xl border border-white/5 mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-2">
                Rapor Notları
              </h4>
              <p className="text-sm text-gray-300">{displayNotes || '-'}</p>
            </div>
            <div>
              <h4 className="text-[10px] font-black text-gray-500 tracking-widest uppercase mb-2">
                Kanıt (Screenshot)
              </h4>
              {displayScreenshot ? (
                <div className="space-y-2">
                  <div className="relative max-h-48 max-w-sm rounded-lg overflow-hidden border border-white/10 bg-black/40">
                    <img
                      src={displayScreenshot}
                      alt="Kanıt Görseli"
                      className="max-h-48 w-auto object-contain rounded-lg"
                    />
                  </div>
                  <a
                    href={displayScreenshot}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00e5ff] text-xs font-bold hover:underline inline-flex items-center gap-1"
                  >
                    Tam Boyut Aç &rarr;
                  </a>
                </div>
              ) : (
                <p className="text-sm text-gray-500">-</p>
              )}
            </div>
          </div>
        )}

        {/* Player Stats Form */}
        {isMyReportPending ? (
          <PlayerStatsForm
            matchId={matchId}
            roster={roster}
            existingStats={effectiveStatsForForm}
          />
        ) : (
          <div className="card-surface p-8 text-center rounded-xl border border-white/5">
            <span className="text-gray-400 text-sm font-medium italic">
              {isClosedMatch
                ? 'Tamamlanmış (COMPLETED), onaylanmış (APPROVED) veya geçmişte oynanmış maçlar kaptan raporlamasına kapalıdır.'
                : myTeamReport?.status === 'APPROVED'
                ? 'Takımınızın maç raporu ve ilk 11 oyuncu istatistikleri onaylanmıştır.'
                : myTeamReport?.status === 'REJECTED'
                ? 'Bu rapor reddedilmiştir. Yukarıdaki "Yeniden Rapor Gönder" butonunu kullanarak yeni rapor gönderebilirsiniz.'
                : `Bu maç ${match.status} durumunda olduğu için doğrudan düzenlenemez.`}
            </span>
          </div>
        )}
      </div>
    </main>
  );
}
