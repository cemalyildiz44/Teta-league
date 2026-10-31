import Link from 'next/link';
import { Calendar, DownloadCloud } from 'lucide-react';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { MatchesManager } from './MatchesManager';

export default async function AdminMatchesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const [
    { data: matches },
    { data: seasons },
    { data: leagues },
    { data: teams },
    { data: teamReports },
  ] = await Promise.all([
    supabase
      .from('matches')
      .select(
        '*, fixtures(id, week_number), stats:match_player_stats(*, profiles!match_player_stats_player_id_fkey(id, username, full_name, current_ea_player_id)), match_raw_ea_data(id, ea_match_id, raw_data, fetched_at)'
      )
      .order('played_at', { ascending: false })
      .limit(500),
    supabase.from('seasons').select('id, name').order('created_at', { ascending: false }),
    supabase.from('leagues').select('id, name, season_id'),
    supabase.from('teams').select('id, name, logo_url, ea_club_id'),
    supabase
      .from('match_team_reports')
      .select(
        '*, submitter:profiles!match_team_reports_submitted_by_fkey(id, username, full_name), reviewer:profiles!match_team_reports_reviewed_by_fkey(id, username), report_players:match_team_report_players(*, profiles!match_team_report_players_player_id_fkey(id, username, full_name, current_ea_player_id))'
      )
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  const teamMap = new Map((teams || []).map((t) => [t.id, t]));
  const leagueMap = new Map((leagues || []).map((l) => [l.id, l]));
  const seasonMap = new Map((seasons || []).map((s) => [s.id, s]));

  // Group reports by fixture_id and match_id
  const reportsByFixture = new Map<string, any[]>();
  const reportsByMatch = new Map<string, any[]>();

  for (const r of teamReports || []) {
    const enrichedReport = {
      ...r,
      team: r.team_id ? teamMap.get(r.team_id) || null : null,
    };
    if (r.fixture_id) {
      const list = reportsByFixture.get(r.fixture_id) || [];
      list.push(enrichedReport);
      reportsByFixture.set(r.fixture_id, list);
    }
    if (r.match_id) {
      const list = reportsByMatch.get(r.match_id) || [];
      list.push(enrichedReport);
      reportsByMatch.set(r.match_id, list);
    }
  }

  const formattedMatches = (matches || []).map((m: any) => {
    const fixtureObj = m.fixtures
      ? {
          ...m.fixtures,
          week_number: m.fixtures.week_number ?? m.fixtures.matchday ?? null,
        }
      : null;

    const matchReports =
      (m.fixture_id && reportsByFixture.get(m.fixture_id)) ||
      reportsByMatch.get(m.id) ||
      [];

    // Pick the latest report for home_team_id and away_team_id
    const homeReport =
      matchReports.find((r: any) => r.team_id === m.home_team_id) || null;
    const awayReport =
      matchReports.find((r: any) => r.team_id === m.away_team_id) || null;

    return {
      ...m,
      fixtures: fixtureObj,
      home: m.home_team_id ? teamMap.get(m.home_team_id) || null : null,
      away: m.away_team_id ? teamMap.get(m.away_team_id) || null : null,
      leagues: m.league_id ? leagueMap.get(m.league_id) || null : null,
      seasons: m.season_id ? seasonMap.get(m.season_id) || null : null,
      team_reports: matchReports,
      home_report: homeReport,
      away_report: awayReport,
    };
  });

  return (
    <div className="max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-white tracking-widest">
            MAÇ ONAY VE İNCELEME MERKEZİ
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            TETA League karşılaşmalarını ve çift taraflı kaptan raporlarını incele, EA skorları ile karşılaştır, kadro uyumunu denetle ve onayla.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/fixtures"
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
          >
            <Calendar className="w-4 h-4 text-cyan-400" />
            Fikstür Yönetimi
          </Link>
          <Link
            href="/admin/matches/ea-import"
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-xs font-black transition-colors flex items-center gap-2"
          >
            <DownloadCloud className="w-4 h-4" />
            EA İçe Aktar
          </Link>
          <Link
            href="/admin/matches/import"
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
          >
            Haftalık Sonuç JSON Aktarımı
          </Link>
        </div>
      </div>

      <MatchesManager
        initialMatches={formattedMatches}
        seasons={seasons || []}
        leagues={leagues || []}
      />
    </div>
  );
}
