'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function invitePlayer(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const playerId = formData.get('playerId') as string;

  if (!playerId) {
    return { error: 'Missing required fields' };
  }

  const { error } = await supabase.rpc('send_team_invite', {
    p_player_id: playerId
  });

  if (error) {
    console.error('Transfer error:', error);
    if (error.message.includes('A pending invite to this player already exists')) {
      return { error: 'Bu oyuncuya zaten bekleyen bir teklifiniz var.' };
    }
    if (error.message.includes('Player is already in your team')) {
      return { error: 'Oyuncu zaten sizin takımınızda.' };
    }
    if (error.message.includes('No active transfer window')) {
      return { error: 'Transfer penceresi şu anda kapalı.' };
    }
    return { error: 'Teklif gönderilemedi: ' + error.message };
  }

  revalidatePath('/takim/yonet');
  revalidatePath('/profil');
  return { success: true };
}

export async function kickPlayerAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const playerId = formData.get('playerId') as string;
  const seasonId = formData.get('seasonId') as string;

  if (!playerId || !seasonId) return { error: 'Missing required fields' };

  // Call the new RPC kick_player
  const { error } = await supabase.rpc('kick_player', {
    p_player_id: playerId,
    p_season_id: seasonId
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath('/takim/yonet');
  return { success: true };
}

export async function searchPlayers(query: string, seasonId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  
  if (!query || query.length < 3) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, current_ea_player_id, primary_position, platform, avatar_url')
    .or(`username.ilike.%${query}%,current_ea_player_id.ilike.%${query}%`)
    .limit(10);

  if (!profiles || profiles.length === 0) return [];

  // Need to know their active team for this season to show it
  const playerIds = profiles.map(p => p.id);
  const { data: memberships } = await supabase
    .from('team_memberships')
    .select('player_id, team_id')
    .eq('season_id', seasonId)
    .in('player_id', playerIds)
    .is('left_at', null);

  const teamIds = Array.from(new Set((memberships || []).map(m => m.team_id).filter(Boolean)));
  let teamsMap = new Map<string, { name: string, slug: string }>();

  if (teamIds.length > 0) {
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name, slug')
      .in('id', teamIds);
    if (teams) {
      teamsMap = new Map(teams.map(t => [t.id, t]));
    }
  }

  const membershipMap = new Map((memberships || []).map(m => [m.player_id, m.team_id]));

  return profiles.map(p => {
    const playerTeamId = membershipMap.get(p.id);
    const teamData = playerTeamId ? teamsMap.get(playerTeamId) : null;
    return {
      ...p,
      team_name: teamData?.name || 'Free Agent',
      is_free_agent: !playerTeamId
    };
  });
}
