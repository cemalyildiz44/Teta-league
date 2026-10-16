import { notFound } from 'next/navigation';
import { getLeagueBySlugs } from '../../../utils';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { Calendar } from 'lucide-react';
import FixtureWeekBrowser, { type FixtureTeamView, type FixtureView } from './FixtureWeekBrowser';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  hour: '2-digit',
  minute: '2-digit',
});

function toTeamView(team: { name?: string | null; slug?: string | null; logo_url?: string | null } | undefined): FixtureTeamView | null {
  if (!team) return null;
  return {
    name: team.name || '',
    slug: team.slug ?? null,
    logo_url: team.logo_url ?? null,
  };
}

export default async function LeagueFixturesPage({
  params,
  searchParams,
}: {
  params: Promise<{ seasonSlug: string; leagueSlug: string }>;
  searchParams: Promise<{ hafta?: string | string[] }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
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

  // 3. Görünüm modeli: tarih/saat sunucuda biçimlenir; istemciye yalnızca gerekli alanlar gider
  const fixtureViews: FixtureView[] = (fixtures || []).map((fixture) => {
    const matchesList = Array.isArray(fixture.matches)
      ? fixture.matches
      : fixture.matches
      ? [fixture.matches]
      : [];
    const approvedMatch = matchesList.find((m) => m.status === 'APPROVED');
    const pendingMatch = matchesList.find((m) => m.status === 'PENDING_REVIEW');

    const scheduledAt = fixture.scheduled_at ? new Date(fixture.scheduled_at) : null;

    return {
      id: fixture.id,
      week: fixture.week_number,
      dateLabel: scheduledAt ? dateFormatter.format(scheduledAt) : 'Tarih Yok',
      timeLabel: scheduledAt ? timeFormatter.format(scheduledAt) : '',
      fixtureStatus: fixture.status,
      home: toTeamView(teamMap.get(fixture.home_team_id)),
      away: toTeamView(teamMap.get(fixture.away_team_id)),
      approved: approvedMatch
        ? { id: approvedMatch.id, homeScore: approvedMatch.home_score, awayScore: approvedMatch.away_score }
        : null,
      pendingReview: !!pendingMatch,
    };
  });

  const weeks = Array.from(new Set(fixtureViews.map((f) => f.week))).sort((a, b) => a - b);

  // Başlangıç haftası: geçerli ?hafta=N, yoksa 1. hafta, o da yoksa ilk mevcut hafta
  const haftaParam = Array.isArray(resolvedSearchParams.hafta)
    ? resolvedSearchParams.hafta[0]
    : resolvedSearchParams.hafta;
  const requestedWeek = /^\d+$/.test(haftaParam ?? '') ? Number(haftaParam) : NaN;
  const initialWeek = weeks.includes(requestedWeek) ? requestedWeek : weeks.includes(1) ? 1 : weeks[0];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-[28px] font-[900] tracking-tight text-white tracking-widest">
          FİKSTÜR <span className="text-[#00e5ff]">& SONUÇLAR</span>
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
      </div>

      {weeks.length > 0 ? (
        <FixtureWeekBrowser fixtures={fixtureViews} initialWeek={initialWeek} />
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
