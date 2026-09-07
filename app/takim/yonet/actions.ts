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
  const teamId = formData.get('teamId') as string;
  const seasonId = formData.get('seasonId') as string;
  const transferWindowId = formData.get('transferWindowId') as string;

  if (!playerId || !teamId || !seasonId || !transferWindowId) {
    return { error: 'Missing required fields' };
  }

  // 1. Get player's current active membership for this season
  const { data: membership } = await supabase
    .from('team_memberships')
    .select('team_id')
    .eq('player_id', playerId)
    .eq('season_id', seasonId)
    .is('left_at', null)
    .maybeSingle();

  const fromTeamId = membership ? membership.team_id : null;

  if (fromTeamId === teamId) {
    return { error: 'Oyuncu zaten sizin takımınızda.' };
  }

  // 2. Insert transfer (RLS handles Captain validation)
  const { error } = await supabase.from('transfers').insert({
    transfer_window_id: transferWindowId,
    season_id: seasonId,
    player_id: playerId,
    to_team_id: teamId,
    from_team_id: fromTeamId,
    requested_by: user.id,
    status: 'PENDING_PLAYER'
  });

  if (error) {
    console.error('Transfer error:', error);
    if (error.message.includes('duplicate')) {
        return { error: 'Bu oyuncuya zaten bekleyen bir teklifiniz var.' };
    }
    return { error: 'Teklif gönderilemedi: ' + error.message };
  }

  revalidatePath('/takim/yonet');
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

  if (!profiles) return [];

  // Need to know their active team for this season to show it
  const playerIds = profiles.map(p => p.id);
  const { data: memberships } = await supabase
    .from('team_memberships')
    .select('player_id, teams(name, slug)')
    .eq('season_id', seasonId)
    .in('player_id', playerIds)
    .is('left_at', null);

  return profiles.map(p => {
    const mem = memberships?.find(m => m.player_id === p.id);
    const teamData = mem?.teams as any;
    return {
      ...p,
      team_name: teamData?.name || 'Free Agent',
      is_free_agent: !mem
    };
  });
}
