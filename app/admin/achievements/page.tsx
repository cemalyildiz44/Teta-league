import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import AchievementsClient from './AchievementsClient';

export const metadata = {
  title: 'Başarı Yönetimi | TETA League Admin',
};

export default async function AchievementsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <div>Yetkisiz erişim.</div>;

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .single();

  if (!roleData) return <div>Bu sayfayı görüntüleme yetkiniz yok.</div>;

  // Tüm oyuncuları getir
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, username')
    .order('username', { ascending: true });

  // Sezonları getir
  const { data: seasonsData } = await supabase
    .from('seasons')
    .select('id, name')
    .order('created_at', { ascending: false });

  // Maçları getir (opsiyonel, maçın oyuncusu için) - Sadece son 50 maçı alalım performans için
  const { data: matchesData } = await supabase
    .from('matches')
    .select('id, played_at, home_team:home_team_id(name), away_team:away_team_id(name)')
    .order('played_at', { ascending: false })
    .limit(50);

  // Verilen başarıları listele
  const { data: achievementsData } = await supabase
    .from('player_achievements')
    .select('id, achievement_type, week_number, month_number, awarded_at, profile:player_id(username), season:season_id(name), match:match_id(played_at, home_team:home_team_id(name), away_team:away_team_id(name))')
    .order('awarded_at', { ascending: false })
    .limit(100);

  return (
    <div>
      <AchievementsClient 
        profiles={profilesData || []} 
        seasons={seasonsData || []} 
        matches={matchesData || []} 
        achievements={achievementsData || []} 
      />
    </div>
  );
}
