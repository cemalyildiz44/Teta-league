import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ClientAccount from './ClientAccount';

export const metadata = {
  title: "Hesabım | TETA League"
};

export default async function ProfilPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/giris');
  }

  // 1. Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/giris'); // Or error page
  }

  // 2. Fetch Team Memberships & League
  const { data: membershipsData } = await supabase
    .from('team_memberships')
    .select('*')
    .eq('player_id', user.id)
    .order('joined_at', { ascending: false });

  const memberships = membershipsData || [];
  const activeMembership = memberships.find(m => !m.left_at);

  let team = null;
  if (activeMembership?.team_id) {
    const { data: tData } = await supabase.from('teams').select('id, name, slug, logo_url, is_active').eq('id', activeMembership.team_id).maybeSingle();
    if (tData && tData.is_active !== false) {
      team = tData;
    }
  }

  // Active League
  let league = null;
  if (team && activeMembership?.league_id) {
    const { data: lData } = await supabase.from('leagues').select('name').eq('id', activeMembership.league_id).maybeSingle();
    league = lData;
  }

  // Captain Status (PLAYER + CAPTAIN, PLAYER + CAPTAIN + SUPER_ADMIN)
  let isCaptain = false;
  const { data: captainRole } = await supabase
    .from('user_roles')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('role', 'CAPTAIN')
    .eq('is_active', true)
    .maybeSingle();

  if (captainRole?.team_id) {
    isCaptain = true;
    if (!team) {
      const { data: cTeam } = await supabase.from('teams').select('id, name, slug, logo_url, is_active').eq('id', captainRole.team_id).maybeSingle();
      if (cTeam && cTeam.is_active !== false) team = cTeam;
    }
  }

  // 3. Fetch Achievements (Summary)
  const { data: tournamentsData } = await supabase
    .from('tournament_winners')
    .select('id, tournaments(type)')
    .eq('profile_id', user.id);

  const { data: ncData } = await supabase
    .from('tournament_application_players')
    .select('application_id, tournament_applications(tournament_winners(id, tournaments(type)))')
    .eq('profile_id', user.id);

  let totalCups = 0;
  let type1V1 = 0;
  let typeKarma = 0;
  let typeNC = 0;

  (tournamentsData || []).forEach((t: any) => {
    totalCups++;
    if (t.tournaments?.type === '1V1') type1V1++;
    if (t.tournaments?.type === 'KARMA') typeKarma++;
  });

  (ncData || []).forEach((a: any) => {
    const wins = a.tournament_applications?.tournament_winners || [];
    if (wins.length > 0) {
      totalCups++;
      typeNC++;
    }
  });

  // Auth User Data for Email/Verification info
  const authUser = {
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    created_at: user.created_at
  };

  // 4. Fetch Pending Invites
  const { data: pendingTransfers } = await supabase
    .from('transfers')
    .select('id, created_at, to_team_id, requested_by, teams!transfers_to_team_id_fkey(name), profiles!transfers_requested_by_fkey(username)')
    .eq('player_id', user.id)
    .eq('status', 'PENDING_PLAYER');

  const pendingInvites = pendingTransfers?.map((t: any) => ({
    id: t.id,
    team_name: t.teams?.name,
    captain_name: t.profiles?.username,
    created_at: t.created_at,
  })) || [];

  return (
    <main className="min-h-screen bg-[#01060b] pt-8 pb-20">
      <div className="max-w-[800px] mx-auto px-4 lg:px-6">
        <ClientAccount 
          profile={profile} 
          authUser={authUser}
          team={team}
          league={league}
          isCaptain={isCaptain}
          achievements={{ totalCups, type1V1, typeKarma, typeNC }}
          pendingInvites={pendingInvites}
        />
      </div>
    </main>
  );
}
