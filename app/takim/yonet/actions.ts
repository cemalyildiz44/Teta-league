'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isValidHttpUrl } from '@/app/utils/urlValidator';

export async function invitePlayer(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const playerId = formData.get('playerId') as string;

  if (!playerId) {
    return { error: 'Missing required fields' };
  }

  // Caller profile status check
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('status, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (callerProfile?.status === 'BANNED') {
    return { error: 'Hesabınız yasaklandığı için transfer teklifi gönderemezsiniz.' };
  }
  if (callerProfile?.status === 'SUSPENDED' || callerProfile?.is_active === false) {
    return { error: 'Hesabınız askıya alındığı için transfer teklifi gönderemezsiniz.' };
  }

  // Target player profile status check
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('status, is_active, username')
    .eq('id', playerId)
    .maybeSingle();

  if (!targetProfile) {
    return { error: 'Oyuncu bulunamadı.' };
  }
  if (targetProfile.status === 'BANNED') {
    return { error: 'Yasaklı (BANLI) bir oyuncuya transfer teklifi gönderilemez.' };
  }
  if (targetProfile.status === 'SUSPENDED' || targetProfile.is_active === false) {
    return { error: 'Askıya alınmış bir oyuncuya transfer teklifi gönderilemez.' };
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
    if (error.message.includes('transfer slotu dolmuştur') || error.message.includes('Transfer kotanız dolmuştur')) {
      return { error: 'Bu transfer dönemi için maksimum transfer kotanıza (5) ulaştınız.' };
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
    .eq('is_active', true)
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

export async function updateTeamSocialsAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Oturum açmanız gerekiyor.' };

  const teamId = formData.get('teamId') as string;
  const streamUrl = (formData.get('stream_url') as string)?.trim() || null;
  const instagramUrl = (formData.get('instagram_url') as string)?.trim() || null;

  if (!teamId) return { error: 'Takım ID zorunludur.' };

  // Authorization: must be CAPTAIN of this team or ADMIN/SUPER_ADMIN
  const { data: captainRole } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .eq('team_id', teamId)
    .eq('role', 'CAPTAIN')
    .eq('is_active', true)
    .maybeSingle();

  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('id')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .maybeSingle();

  if (!captainRole && !adminRole) {
    return { error: 'Bu takımın sosyal bağlantılarını düzenleme yetkiniz yok.' };
  }

  // URL Validation
  if (streamUrl && !isValidHttpUrl(streamUrl)) {
    return { error: 'Yayın linki geçerli bir http:// veya https:// bağlantısı olmalıdır.' };
  }

  if (instagramUrl && !isValidHttpUrl(instagramUrl)) {
    return { error: 'Instagram linki geçerli bir http:// veya https:// bağlantısı olmalıdır.' };
  }

  // Fetch team slug for revalidation
  const { data: team } = await supabase
    .from('teams')
    .select('slug')
    .eq('id', teamId)
    .single();

  // 1. Try RPC update_team_socials
  const { data: rpcData, error: rpcError } = await supabase.rpc('update_team_socials', {
    p_team_id: teamId,
    p_stream_url: streamUrl,
    p_instagram_url: instagramUrl
  });

  if (rpcError) {
    // If RPC is not available yet (migration not yet applied to remote DB), fallback to direct update
    const { error: directError } = await supabase
      .from('teams')
      .update({
        stream_url: streamUrl,
        instagram_url: instagramUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', teamId);

    if (directError) {
      return { error: 'Bağlantılar kaydedilemedi: ' + directError.message };
    }
  } else if (rpcData && !rpcData.success) {
    return { error: rpcData.error || 'Güncelleme yetkiniz yok.' };
  }

  revalidatePath('/takim/yonet');
  if (team?.slug) {
    revalidatePath(`/takim/${team.slug}`);
  }

  return { success: true };
}
