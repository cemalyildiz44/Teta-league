import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCachedUser } from '@/lib/fetchers';
import { getCaptainFixtureRowState, type ReportStatus } from '@/lib/match-reporting';

interface FixtureMatchSummary {
  id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  source: string;
  submitted_by: string | null;
}

interface CaptainFixtureRow {
  id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string;
  status: string;
  matchday?: number | null;
  week_number?: number | null;
  matches?: FixtureMatchSummary | FixtureMatchSummary[] | null;
}

interface TeamSummary {
  id: string;
  name: string;
  logo_url?: string | null;
}

interface TeamReportSummary {
  id: string;
  fixture_id: string;
  team_id: string;
  home_score: number;
  away_score: number;
  status: ReportStatus;
  rejection_reason: string | null;
  created_at: string;
}

export default async function CaptainMatchesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const user = await getCachedUser();
  if (!user) redirect('/giris');

  // Check Captain Context
  const { data: role } = await supabase
    .from('user_roles')
    .select('team_id, teams(name)')
    .eq('user_id', user.id)
    .eq('role', 'CAPTAIN')
    .eq('is_active', true)
    .is('revoked_at', null)
    .maybeSingle();

  if (!role || !role.team_id) redirect('/profil');
  const teamId = role.team_id;

  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id, name')
    .eq('status', 'ACTIVE')
    .single();
  if (!activeSeason) return <div className="text-center p-8 text-white">Aktif sezon yok.</div>;

  // Fetch all fixtures for this captain's team in the active season (both unplayed and finished/played)
  const { data: fixtures } = await supabase
    .from('fixtures')
    .select('*, matches(id, home_score, away_score, status, source, submitted_by)')
    .eq('season_id', activeSeason.id)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .order('scheduled_at', { ascending: true });

  const teamFixtures = (fixtures || []) as CaptainFixtureRow[];
  const fixtureIds = teamFixtures.map((f) => f.id);

  // Fetch team reports and teams in parallel
  const [{ data: teams }, { data: teamReports }] = await Promise.all([
    supabase.from('teams').select('id, name, logo_url'),
    fixtureIds.length > 0
      ? supabase
          .from('match_team_reports')
          .select('id, fixture_id, team_id, home_score, away_score, status, rejection_reason, created_at')
          .in('fixture_id', fixtureIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as TeamReportSummary[] }),
  ]);

  const teamMap = new Map(((teams || []) as TeamSummary[]).map((t) => [t.id, t]));

  // Map latest report per (fixture_id, team_id)
  const reportByFixtureAndTeam = new Map<string, TeamReportSummary>();
  for (const r of (teamReports || []) as TeamReportSummary[]) {
    const key = `${r.fixture_id}:${r.team_id}`;
    if (!reportByFixtureAndTeam.has(key)) {
      reportByFixtureAndTeam.set(key, r);
    }
  }

  const roleTeam = Array.isArray(role.teams) ? role.teams[0] : role.teams;
  const captainTeamName = (roleTeam as { name?: string } | null)?.name ?? '';

  return (
    <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white tracking-widest uppercase mb-1">
              MAÇ YÖNETİMİ
            </h1>
            <p className="text-sm font-bold text-gray-400">
              {captainTeamName} • {activeSeason.name}
            </p>
          </div>
          <Link
            href="/takim/yonet"
            className="px-6 py-2.5 bg-white/5 border border-white/10 text-white text-xs font-black rounded-lg tracking-widest hover:bg-white/10 transition-all"
          >
            GERİ DÖN
          </Link>
        </div>

        <div className="card-surface rounded-xl border border-white/5 overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-[#0a1628] border-b border-white/5 text-xs uppercase font-black text-[#00e5ff]">
              <tr>
                <th className="px-4 py-3">Hafta</th>
                <th className="px-4 py-3">Rakip</th>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Maç Skoru / Durumu</th>
                <th className="px-4 py-3">Çift Taraflı Rapor Durumu</th>
                <th className="px-4 py-3">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {teamFixtures.map((f) => {
                const isHome = f.home_team_id === teamId;
                const opponentId = isHome ? f.away_team_id : f.home_team_id;
                const opponent = teamMap.get(opponentId);
                const match =
                  Array.isArray(f.matches) && f.matches.length > 0
                    ? f.matches[0]
                    : f.matches && !Array.isArray(f.matches)
                    ? f.matches
                    : null;

                const myReport = reportByFixtureAndTeam.get(`${f.id}:${teamId}`) || null;
                const oppReport = reportByFixtureAndTeam.get(`${f.id}:${opponentId}`) || null;

                const resolvedHomeScore =
                  match?.home_score ??
                  (myReport?.status === 'APPROVED'
                    ? myReport.home_score
                    : oppReport?.status === 'APPROVED'
                    ? oppReport.home_score
                    : null);
                const resolvedAwayScore =
                  match?.away_score ??
                  (myReport?.status === 'APPROVED'
                    ? myReport.away_score
                    : oppReport?.status === 'APPROVED'
                    ? oppReport.away_score
                    : null);

                const rowState = getCaptainFixtureRowState({
                  fixtureStatus: f.status,
                  matchSource: match?.source || null,
                  matchStatus: match?.status || null,
                  homeScore: resolvedHomeScore,
                  awayScore: resolvedAwayScore,
                  myTeamReportStatus: myReport?.status || null,
                  oppTeamReportStatus: oppReport?.status || null,
                });

                const weekNo = f.matchday ?? f.week_number ?? '-';

                return (
                  <tr key={f.id} className="hover:bg-white/5">
                    <td className="px-4 py-3 font-bold text-white whitespace-nowrap">
                      Hafta {weekNo}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-gray-500 bg-[#0a1628] px-1.5 py-0.5 rounded">
                          {isHome ? 'EV' : 'DEP'}
                        </span>
                        <span className="font-bold text-white">{opponent?.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(f.scheduled_at).toLocaleString('tr-TR')}
                    </td>
                    <td className="px-4 py-3">
                      {rowState.isFinished ? (
                        <div className="flex items-center gap-2.5">
                          {rowState.scoreText && (
                            <span className="font-black text-white bg-[#0a1628] border border-white/15 px-2.5 py-1 rounded tabular-nums">
                              {rowState.scoreText}
                            </span>
                          )}
                          <span
                            className={`px-2 py-1 rounded text-[10px] font-black border ${
                              rowState.statusLabel === 'İPTAL'
                                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                : rowState.statusLabel === 'HÜKMEN'
                                ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            }`}
                          >
                            {rowState.statusLabel}
                          </span>
                        </div>
                      ) : match ? (
                        <div className="flex items-center gap-2.5">
                          <span className="font-black text-white bg-[#0a1628] border border-white/10 px-2 py-1 rounded tabular-nums">
                            {match.home_score} - {match.away_score}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-[10px] font-black ${
                              match.status === 'REJECTED'
                                ? 'bg-red-500/10 text-red-500'
                                : 'bg-yellow-500/10 text-yellow-500'
                            }`}
                          >
                            {match.status}
                          </span>
                        </div>
                      ) : (
                        <span className="px-2 py-1 rounded text-[10px] font-black bg-[#00e5ff]/10 text-[#00e5ff]">
                          {f.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {rowState.hasDualReports || (!rowState.isFinished && match?.source !== 'AUTO') ? (
                        <div className="flex flex-col gap-1 text-[10px] font-black uppercase tracking-wider">
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-400">Takımınız:</span>
                            {myReport ? (
                              <span
                                className={
                                  myReport.status === 'APPROVED'
                                    ? 'text-emerald-400'
                                    : myReport.status === 'REJECTED'
                                    ? 'text-red-400'
                                    : 'text-yellow-400'
                                }
                              >
                                {myReport.status === 'APPROVED'
                                  ? 'ONAYLANDI'
                                  : myReport.status === 'REJECTED'
                                  ? 'REDDEDİLDİ'
                                  : 'ONAY BEKLİYOR'}
                              </span>
                            ) : (
                              <span className="text-gray-500">GÖNDERİLMEDİ</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-gray-400">Rakip:</span>
                            {oppReport ? (
                              <span
                                className={
                                  oppReport.status === 'APPROVED'
                                    ? 'text-emerald-400'
                                    : oppReport.status === 'REJECTED'
                                    ? 'text-red-400'
                                    : 'text-yellow-400'
                                }
                              >
                                {oppReport.status === 'APPROVED'
                                  ? 'ONAYLANDI'
                                  : oppReport.status === 'REJECTED'
                                  ? 'REDDEDİLDİ'
                                  : 'ONAY BEKLİYOR'}
                              </span>
                            ) : (
                              <span className="text-gray-500">GÖNDERİLMEDİ</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {rowState.isFinished ? (
                        <span className="text-xs font-bold text-gray-500">İşlem yapılamaz</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {rowState.canSubmit && (
                            <Link
                              href={`/takim/yonet/maclar/yeni?fixture=${f.id}`}
                              className={`px-3 py-1.5 font-black text-[10px] rounded transition-colors ${
                                rowState.isResubmission
                                  ? 'bg-red-500 text-white hover:bg-red-600'
                                  : 'bg-[#00e5ff] text-black hover:bg-[#00b8d4]'
                              }`}
                            >
                              {rowState.isResubmission ? 'YENİDEN RAPOR GÖNDER' : 'SONUÇ GİR'}
                            </Link>
                          )}
                          {match && rowState.canViewPendingDetails ? (
                            <Link
                              href={`/takim/yonet/maclar/${match.id}`}
                              className="text-[#00e5ff] font-bold text-xs hover:underline"
                            >
                              İncele / İstatistik Gir &rarr;
                            </Link>
                          ) : !rowState.canSubmit ? (
                            <span className="text-xs text-gray-500">İşlem yapılamaz</span>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {teamFixtures.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Takımınıza ait fikstür maçı bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
