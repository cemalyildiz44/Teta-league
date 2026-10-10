
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
    { data: profilesData },
    { data: groupsData },
    { data: matchesData },
    { data: submissionsData }
  ] = await Promise.all([
    supabase.from('tournaments').select('*, seasons(id, name)').order('created_at', { ascending: false }),
    supabase.from('tournament_winners').select('*, profiles(username, full_name, avatar_url), teams(name, logo_url), tournament_applications(team_name, logo_url)').order('placement', { ascending: true }),
    supabase.from('tournament_applications').select('*, profiles(id, username, full_name, avatar_url), tournament_application_players(id, profile_id, profiles(id, username, full_name, avatar_url))').order('created_at', { ascending: false }),
    supabase.from('seasons').select('id, name, status').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, username, full_name, avatar_url').order('username', { ascending: true }),
    supabase.from('tournament_groups').select('*, tournament_group_teams(*, tournament_applications(id, team_name, logo_url))').order('order_index', { ascending: true }),
    supabase.from('tournament_matches').select('*, home:tournament_applications!home_application_id(id, team_name, logo_url), away:tournament_applications!away_application_id(id, team_name, logo_url)').order('round_number', { ascending: true }).order('match_order', { ascending: true }),
    supabase.from('tournament_match_submissions').select(`
      *,
      submitter:profiles!submitted_by(id, username, full_name, avatar_url),
      team:tournament_applications!submitted_team_application_id(id, team_name, logo_url),
      tournament:tournaments(id, name),
      match:tournament_matches(
        id,
        round_number,
        match_order,
        home:tournament_applications!home_application_id(id, team_name, logo_url),
        away:tournament_applications!away_application_id(id, team_name, logo_url)
      ),
      goals:tournament_match_goals(
        id,
        team_application_id,
        player_id,
        player_name,
        goals,
        is_own_goal,
        player:profiles!player_id(id, username)
      )
    `).order('created_at', { ascending: false })
  ]);

  return (
    <div className='max-w-[1400px] mx-auto'>
      <div className='mb-8'>
        <h1 className='text-2xl font-black text-white tracking-widest uppercase mb-1'>TURNUVA YÖNETİM MERKEZİ</h1>
        <p className='text-sm text-zinc-400'>1V1 Şampiyonları, Karma Kadroları, Night Cup başvuruları, grup ve fikstür yönetimini sağlayın.</p>
      </div>

      <TournamentsManager 
        tournaments={tournamentsData || []}
        winners={winnersData || []}
        applications={applicationsData || []}
        seasons={seasonsData || []}
        profiles={profilesData || []}
        groups={groupsData || []}
        matches={matchesData || []}
        submissions={submissionsData || []}
      />
    </div>
  );
}

