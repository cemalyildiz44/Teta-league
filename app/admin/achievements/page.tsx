import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import AchievementsClient from './AchievementsClient';
import { getCachedUser } from '@/lib/fetchers';

export const metadata = {
  title: 'Kupa ve Başarı Yönetimi | TETA League Admin',
};

export default async function AchievementsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const user = await getCachedUser();
  if (!user) return <div className="p-8 text-red-400 font-bold">Yetkisiz erişim.</div>;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .single();

  if (!roleData) return <div className="p-8 text-red-400 font-bold">Bu sayfayı görüntüleme yetkiniz yok.</div>;

  // 1. Tüm oyuncuları getir (Kazanan seçimi için)
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url')
    .order('username', { ascending: true });

  // 2. Tüm takımları getir (Kazanan seçimi için)
  const { data: teamsData } = await supabase
    .from('teams')
    .select('id, name, logo_url')
    .eq('is_active', true)
    .order('name', { ascending: true });

  // 3. Tarihsel sezonlar (Season 1–4)
  const HISTORICAL_SEASONS = [
    { id: 'HISTORICAL:TETA SEASON 1', name: 'TETA SEASON 1' },
    { id: 'HISTORICAL:TETA SEASON 2', name: 'TETA SEASON 2' },
    { id: 'HISTORICAL:TETA SEASON 3', name: 'TETA SEASON 3' },
    { id: 'HISTORICAL:TETA SEASON 4', name: 'TETA SEASON 4' },
  ];

  // 4. Gerçek sezonları getir
  const { data: seasonsData } = await supabase
    .from('seasons')
    .select('id, name');

  const combinedSeasons = [...HISTORICAL_SEASONS, ...(seasonsData || [])];

  const sortedSeasons = combinedSeasons.sort((a, b) => {
    const nameA = a.name || '';
    const nameB = b.name || '';

    const matchA = nameA.match(/(?:sezon|season|s)\s*(\d+)/i) || nameA.match(/(\d+)\s*\.?\s*sezon/i) || nameA.match(/(\d+)/);
    const matchB = nameB.match(/(?:sezon|season|s)\s*(\d+)/i) || nameB.match(/(\d+)\s*\.?\s*sezon/i) || nameB.match(/(\d+)/);

    const numA = matchA ? parseInt(matchA[1], 10) : null;
    const numB = matchB ? parseInt(matchB[1], 10) : null;

    if (numA !== null && numB !== null && numA !== numB) {
      return numA - numB;
    }

    return nameA.localeCompare(nameB, 'tr', { numeric: true, sensitivity: 'base' });
  });

  // 5. Dinamik Kupaları ve Kazananları Getir
  const { data: trophiesData, error: trophiesError } = await supabase
    .from('trophies')
    .select(`
      id,
      title,
      description,
      image_url,
      category,
      target_type,
      season_id,
      season_name,
      display_order,
      created_at,
      season:seasons!season_id(name),
      winners:trophy_winners(
        id,
        winner_type,
        player_id,
        team_id,
        awarded_at,
        notes,
        profile:profiles!player_id(id, username, full_name, avatar_url),
        team:teams!team_id(id, name, logo_url)
      )
    `)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  const formattedTrophies = ((trophiesData || []) as any[]).map((t: any) => ({
    ...t,
    season: Array.isArray(t.season) ? t.season[0] || null : t.season || null,
    winners: (t.winners || []).map((w: any) => ({
      ...w,
      profile: Array.isArray(w.profile) ? w.profile[0] || null : w.profile || null,
      team: Array.isArray(w.team) ? w.team[0] || null : w.team || null,
    }))
  }));

  return (
    <div>
      <AchievementsClient
        trophies={formattedTrophies as any}
        profiles={profilesData || []}
        teams={teamsData || []}
        seasons={sortedSeasons}
        isSchemaPending={Boolean(trophiesError)}
      />
    </div>
  );
}
