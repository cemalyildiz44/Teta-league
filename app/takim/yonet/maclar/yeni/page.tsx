import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { SubmitMatchForm } from './SubmitMatchForm';
import { getCachedUser } from '@/lib/fetchers';
import { canCaptainSubmitTeamReport } from '@/lib/match-reporting';

export default async function NewMatchPage({ searchParams }: { searchParams: Promise<{ fixture: string }> }) {
  const resolvedParams = await searchParams;
  const fixtureId = resolvedParams.fixture;

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

  if (!fixtureId) return (
    <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
      <div className="max-w-5xl mx-auto px-4 lg:px-6 p-8 text-white">Fikstür ID gerekli.</div>
    </main>
  );

  const { data: fixture } = await supabase
    .from('fixtures')
    .select('id, season_id, league_id, week_number, home_team_id, away_team_id, scheduled_at, status')
    .eq('id', fixtureId)
    .maybeSingle();

  if (!fixture) return (
    <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
      <div className="max-w-5xl mx-auto px-4 lg:px-6 p-8 text-white">Fikstür bulunamadı.</div>
    </main>
  );

  if (fixture.home_team_id !== role.team_id && fixture.away_team_id !== role.team_id) {
    return (
      <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
        <div className="max-w-5xl mx-auto px-4 lg:px-6 p-8 text-red-500">Bu maçı raporlama yetkiniz yok.</div>
      </main>
    );
  }

  let seasonId = fixture.season_id;
  if (!seasonId) {
    const { data: activeSeason } = await supabase
      .from('seasons')
      .select('id')
      .eq('status', 'ACTIVE')
      .maybeSingle();
    seasonId = activeSeason?.id;
  }

  const [{ data: homeTeam }, { data: awayTeam }] = await Promise.all([
    supabase.from('teams').select('id, name, logo_url').eq('id', fixture.home_team_id).maybeSingle(),
    supabase.from('teams').select('id, name, logo_url').eq('id', fixture.away_team_id).maybeSingle()
  ]);

  const [
    { data: rosterMemberships },
    { data: existingMatch },
    { data: teamReports }
  ] = await Promise.all([
    supabase
      .from('team_memberships')
      .select('player_id, profiles!team_memberships_player_id_fkey(id, username, full_name, primary_position, status, is_active)')
      .eq('team_id', role.team_id)
      .eq('season_id', seasonId)
      .is('left_at', null),
    supabase
      .from('matches')
      .select('id, status, source, home_score, away_score, played_at')
      .eq('fixture_id', fixture.id)
      .maybeSingle(),
    supabase
      .from('match_team_reports')
      .select('*, report_players:match_team_report_players(*)')
      .eq('fixture_id', fixture.id)
      .order('created_at', { ascending: false })
  ]);

  let myTeamHasSavedStats = false;
  if (existingMatch?.id) {
    const { count } = await supabase
      .from('match_player_stats')
      .select('id', { count: 'exact', head: true })
      .eq('match_id', existingMatch.id)
      .eq('team_id', role.team_id);
    myTeamHasSavedStats = (count || 0) > 0;
  }

  const allReports = teamReports || [];
  const myLatestReport = allReports.find((r: any) => r.team_id === role.team_id) || null;
  const opponentReport =
    allReports.find(
      (r: any) =>
        r.team_id !== role.team_id &&
        (r.status === 'PENDING_REVIEW' || r.status === 'APPROVED')
    ) || null;

  const eligibility = canCaptainSubmitTeamReport({
    fixtureStatus: fixture.status,
    matchSource: existingMatch?.source as any,
    matchStatus: existingMatch?.status as any,
    homeScore: existingMatch?.home_score,
    awayScore: existingMatch?.away_score,
    myTeamReportStatus: myLatestReport?.status as any,
    myTeamHasSavedStats,
    hasAnyTeamReports: allReports.length > 0,
  });

  if (!eligibility.canSubmit) {
    const canViewMyPendingReport =
      fixture.status === 'SCHEDULED' &&
      existingMatch?.id &&
      existingMatch.status === 'PENDING_REVIEW' &&
      existingMatch.source === 'MANUAL' &&
      myLatestReport?.status === 'PENDING_REVIEW';

    return (
      <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
        <div className="max-w-4xl mx-auto px-4 lg:px-6">
          <div className="bg-[#0b172a] border border-yellow-500/30 rounded-xl p-8 text-center">
            <h2 className="text-lg font-black text-yellow-400 uppercase tracking-widest mb-2">
              RAPOR GÖNDERİMİ KAPALI
            </h2>
            <p className="text-sm font-bold text-gray-300 mb-6">
              {eligibility.reason || 'Sadece henüz oynanmamış (SCHEDULED) durumundaki maçlara sonuç girebilirsiniz.'}
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/takim/yonet/maclar"
                className="px-5 py-2.5 bg-white/10 text-white text-xs font-black rounded tracking-widest uppercase hover:bg-white/20 transition-all"
              >
                MAÇLARA DÖN
              </Link>
              {canViewMyPendingReport && (
                <Link
                  href={`/takim/yonet/maclar/${existingMatch.id}`}
                  className="px-5 py-2.5 bg-[#20b2aa] text-[#060d18] text-xs font-black rounded tracking-widest uppercase hover:bg-[#1a968f] transition-all"
                >
                  MEVCUT RAPORU İNCELE &rarr;
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const teamRoster = (rosterMemberships || [])
    .map((m: any) => {
      const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      if (!prof) return null;
      return {
        player_id: m.player_id,
        username: prof.username || 'Bilinmeyen',
        full_name: prof.full_name || null,
        primary_position: prof.primary_position || 'MID',
        status: prof.status || 'ACTIVE',
        is_active: prof.is_active !== false,
      };
    })
    .filter((p: any) => p && p.status !== 'BANNED' && p.status !== 'SUSPENDED' && p.is_active);

  // Attach roster and dual-report context onto fixture object for SubmitMatchForm
  Object.assign(fixture, {
    matchday: (fixture as any).week_number,
    teamRoster,
    myLatestReport,
    opponentReport,
    existingMatch,
  });

  return (
    <main className="min-h-screen bg-[#060d18] pt-24 pb-12">
      <div className="max-w-6xl mx-auto px-4 lg:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-black text-white tracking-widest uppercase mb-1">
              {myLatestReport?.status === 'REJECTED'
                ? 'REDDEDİLEN MAÇ RAPORUNU YENİDEN GÖNDER'
                : 'MAÇ SONUCU VE İLK 11 RAPORU GİR'}
            </h1>
            <p className="text-sm font-bold text-gray-400">
              Maç skorunu, kanıt görselini ve takımınızın ilk 11 oyuncu istatistiklerini girerek onaya gönderin.
            </p>
          </div>
          <Link href="/takim/yonet/maclar" className="px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] font-black rounded tracking-widest hover:bg-white/10 transition-all self-start sm:self-auto">
            İPTAL
          </Link>
        </div>

        <SubmitMatchForm fixture={fixture} homeTeam={homeTeam} awayTeam={awayTeam} teamId={role.team_id} />
      </div>
    </main>
  );
}
