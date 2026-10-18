import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { getCachedUser } from '@/lib/fetchers';
import TotwManager, {
  type TotwSeasonOption,
  type TotwLeagueOption,
  type TotwTrophyOption,
  type LockedWeekSummary,
} from './TotwManager';

export const metadata = {
  title: 'TOTW Yönetimi (Haftanın Takımı) | TETA League Admin',
};

export default async function AdminTotwPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const user = await getCachedUser();
  if (!user) {
    return <div className="p-8 text-red-400 font-bold">Yetkisiz erişim.</div>;
  }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .is('revoked_at', null)
    .maybeSingle();

  if (!roleData) {
    return <div className="p-8 text-red-400 font-bold">Bu sayfayı görüntüleme yetkiniz yok.</div>;
  }

  const [seasonsRes, leaguesRes, fixturesRes, trophiesRes, lockedWeeksRes] = await Promise.all([
    supabase
      .from('seasons')
      .select('id, name, slug, status, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('leagues')
      .select('id, season_id, name, slug, tier_order, is_active')
      .order('tier_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('fixtures')
      .select('season_id, league_id, week_number'),
    supabase
      .from('trophies')
      .select('id, title, description, image_url, category, target_type, season_id, season_name, display_order, created_at')
      .in('target_type', ['PLAYER', 'BOTH'])
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase
      .from('totw_weeks')
      .select('season_id, league_id, week_number, formation, trophy_id, is_locked, submitted_at'),
  ]);

  const seasons: TotwSeasonOption[] = (seasonsRes.data || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    status: s.status,
  }));

  const leagues: TotwLeagueOption[] = (leaguesRes.data || []).map((l: any) => ({
    id: l.id,
    season_id: l.season_id,
    name: l.name,
    slug: l.slug,
    tier_order: l.tier_order ?? 1,
    is_active: Boolean(l.is_active),
  }));

  // Group distinct week numbers by `${season_id}:${league_id}`
  const weeksMapRecord: Record<string, number[]> = {};
  const weekSetByKey = new Map<string, Set<number>>();
  for (const f of fixturesRes.data || []) {
    if (!f.season_id || !f.league_id || typeof f.week_number !== 'number') continue;
    const key = `${f.season_id}:${f.league_id}`;
    if (!weekSetByKey.has(key)) {
      weekSetByKey.set(key, new Set());
    }
    weekSetByKey.get(key)!.add(f.week_number);
  }
  for (const [key, set] of weekSetByKey.entries()) {
    weeksMapRecord[key] = Array.from(set).sort((a, b) => a - b);
  }

  const trophies: TotwTrophyOption[] = (trophiesRes.data || []).map((t: any) => ({
    id: t.id,
    title: t.title,
    description: t.description || null,
    image_url: t.image_url,
    category: t.category,
    target_type: t.target_type,
    season_id: t.season_id || null,
    season_name: t.season_name || null,
  }));

  const lockedWeeks: LockedWeekSummary[] = (lockedWeeksRes.data || []).map((lw: any) => ({
    seasonId: lw.season_id,
    leagueId: lw.league_id,
    weekNumber: lw.week_number,
    formation: lw.formation,
    trophyId: lw.trophy_id,
    isLocked: Boolean(lw.is_locked),
    submittedAt: lw.submitted_at,
  }));

  const isSchemaPending = Boolean(
    lockedWeeksRes.error &&
      (lockedWeeksRes.error.code === '42P01' ||
        lockedWeeksRes.error.message?.includes('totw_weeks'))
  );

  return (
    <div className="space-y-6">
      <TotwManager
        seasons={seasons}
        leagues={leagues}
        weeksBySeasonLeague={weeksMapRecord}
        trophies={trophies}
        initialLockedWeeks={lockedWeeks}
        initialSchemaPending={isSchemaPending}
      />
    </div>
  );
}
