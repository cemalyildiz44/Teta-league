import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import TournamentDetailClient from './TournamentDetailClient';

export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: tour } = await supabase
    .from('tournaments')
    .select('name, description, banner_url, image_url')
    .eq('id', id)
    .maybeSingle();

  if (!tour) {
    return { title: 'Turnuva Bulunamadı | TETA League' };
  }

  return {
    title: `${tour.name} | TETA League Turnuvalar`,
    description: tour.description || `${tour.name} turnuva detayları, katılımcı takımlar ve kurallar.`,
    openGraph: {
      title: `${tour.name} | TETA League`,
      description: tour.description || `${tour.name} turnuva detayları.`,
      images: tour.banner_url || tour.image_url ? [{ url: tour.banner_url || tour.image_url }] : [],
    },
  };
}

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();

  // 1. Fetch tournament
  const { data: tournamentData, error: tourError } = await supabase
    .from('tournaments')
    .select('*, seasons(id, name)')
    .eq('id', id)
    .maybeSingle();

  if (tourError || !tournamentData) {
    notFound();
  }

  // 2. Fetch applications
  const { data: applicationsData } = await supabase
    .from('tournament_applications')
    .select(`
      id,
      tournament_id,
      applicant_id,
      team_name,
      logo_url,
      status,
      created_at,
      applicant:profiles!applicant_id(id, username, avatar_url, full_name)
    `)
    .eq('tournament_id', id)
    .order('created_at', { ascending: true });

  const rawApplications = applicationsData || [];

  // 3. Fetch application squad players
  const appIds = rawApplications.map((a: any) => a.id);
  let squadPlayers: any[] = [];
  if (appIds.length > 0) {
    const { data: playersData } = await supabase
      .from('tournament_application_players')
      .select(`
        id,
        application_id,
        profile_id,
        profiles:profile_id(id, username, avatar_url, full_name)
      `)
      .in('application_id', appIds);
    squadPlayers = playersData || [];
  }

  // Attach squad players to corresponding application
  const applicationsWithSquad = rawApplications.map((app: any) => {
    const players = squadPlayers
      .filter((p: any) => p.application_id === app.id)
      .map((p: any) => ({
        id: p.id,
        profile_id: p.profile_id,
        profile: p.profiles || null,
      }));
    return {
      ...app,
      players,
    };
  });

  // 4. Fetch tournament winners if any
  const { data: winnersData } = await supabase
    .from('tournament_winners')
    .select(`
      id,
      tournament_id,
      profile_id,
      team_id,
      application_id,
      placement,
      profiles(id, username, avatar_url),
      teams(id, name, logo_url),
      tournament_applications(id, team_name, logo_url)
    `)
    .eq('tournament_id', id)
    .order('placement', { ascending: true });

  // 5. Fetch current user profile if logged in
  let currentUserProfile: any = null;
  if (user) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    currentUserProfile = prof || { id: user.id, email: user.email };
  }

  // 6. Fetch profiles for search in squad selection modal
  const { data: searchProfilesData } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .order('username', { ascending: true })
    .limit(300);

  // 7. Fetch tournament groups (Phase 2)
  const { data: groupsData } = await supabase
    .from('tournament_groups')
    .select(`
      id,
      tournament_id,
      name,
      order_index,
      tournament_group_teams(
        id,
        tournament_id,
        group_id,
        application_id,
        seed,
        tournament_applications(id, team_name, logo_url)
      )
    `)
    .eq('tournament_id', id)
    .order('order_index', { ascending: true });

  // 8. Fetch tournament matches (Phase 2)
  const { data: matchesData } = await supabase
    .from('tournament_matches')
    .select(`
      id,
      tournament_id,
      group_id,
      home_application_id,
      away_application_id,
      stage,
      round_number,
      match_order,
      bracket_slot,
      next_match_id,
      winner_application_id,
      penalty_home_score,
      penalty_away_score,
      is_bye,
      home_score,
      away_score,
      status,
      scheduled_at,
      rejection_reason,
      screenshot_url,
      created_at,
      home:tournament_applications!home_application_id(id, team_name, logo_url, applicant_id),
      away:tournament_applications!away_application_id(id, team_name, logo_url, applicant_id),
      winner:tournament_applications!winner_application_id(id, team_name, logo_url),
      tournament_match_goals(
        id,
        team_application_id,
        player_id,
        player_name,
        goals,
        is_own_goal,
        player:profiles!player_id(id, username)
      )
    `)
    .eq('tournament_id', id)
    .order('round_number', { ascending: true })
    .order('match_order', { ascending: true });

  return (
    <TournamentDetailClient
      tournament={tournamentData}
      applications={applicationsWithSquad}
      winners={winnersData || []}
      currentUser={user ? { ...user, profile: currentUserProfile } : null}
      profiles={searchProfilesData || []}
      groups={groupsData || []}
      matches={matchesData || []}
    />
  );
}
