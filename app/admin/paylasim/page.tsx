import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { getActiveSeason, getCachedUser } from '@/lib/fetchers';
import { getLatestPlayedWeek, getLockedTotwWeeks, themeForLeague } from '@/lib/social-posts/data';
import WeeklyPostsClient, { type WeeklyPostLeague } from './WeeklyPostsClient';

export const metadata = {
  title: 'Haftalık Paylaşım | TETA League Admin',
};

export default async function WeeklyPostsPage() {
  const supabase = createClient(await cookies());

  const user = await getCachedUser();
  if (!user) redirect('/giris');
  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .maybeSingle();
  if (!adminRole) redirect('/');

  const season = await getActiveSeason();

  const { data: leagues } = season
    ? await supabase.from('leagues').select('id, name, level, season_id').eq('season_id', season.id).order('level', { ascending: true })
    : { data: [] };

  const items: WeeklyPostLeague[] = await Promise.all(
    (leagues || []).map(async (league) => {
      const [suggestedWeek, totwWeeks] = await Promise.all([getLatestPlayedWeek(supabase, league), getLockedTotwWeeks(supabase, league)]);
      return { id: league.id, name: league.name, theme: themeForLeague(league), suggestedWeek, totwWeeks };
    })
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white uppercase tracking-wider">Haftalık Paylaşım</h1>
        <p className="text-sm text-gray-400 mt-1">
          {season ? `${season.name} sezonu` : 'Aktif sezon bulunamadı'} · Instagram için 1080×1350 puan durumu ve haftanın takımı görselleri
        </p>
      </div>
      <WeeklyPostsClient leagues={items} />
    </div>
  );
}
