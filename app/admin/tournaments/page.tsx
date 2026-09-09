
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TournamentsManager } from './TournamentsManager';

export const metadata = {
  title: 'Turnuva Yönetimi | TETA League Admin',
  description: 'TETA League turnuva ve kupa yönetimi',
};

export default async function AdminTournamentsPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris');

  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .maybeSingle();

  if (!adminRole) {
    redirect('/');
  }

  const [
    { data: tournamentsData },
    { data: winnersData },
    { data: applicationsData },
    { data: seasonsData },
    { data: profilesData }
  ] = await Promise.all([
    supabase.from('tournaments').select('*, seasons(id, name)').order('created_at', { ascending: false }),
    supabase.from('tournament_winners').select('*, profiles(username, avatar_url), teams(name, logo_url), tournament_applications(team_name, logo_url)').order('placement', { ascending: true }),
    supabase.from('tournament_applications').select('*, profiles(username, avatar_url), tournament_application_players(profiles(username, avatar_url))').order('created_at', { ascending: false }),
    supabase.from('seasons').select('id, name, status').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, username, avatar_url').order('username', { ascending: true })
  ]);

  return (
    <div className='max-w-[1400px] mx-auto'>
      <div className='mb-8'>
        <h1 className='text-2xl font-black text-white tracking-widest uppercase mb-1'>TURNUVA YÖNETİM MERKEZİ</h1>
        <p className='text-sm text-zinc-400'>1V1 Şampiyonları, Karma Kadroları ve Night Cup başvurularını yönetin.</p>
      </div>

      <TournamentsManager 
        tournaments={tournamentsData || []}
        winners={winnersData || []}
        applications={applicationsData || []}
        seasons={seasonsData || []}
        profiles={profilesData || []}
      />
    </div>
  );
}

