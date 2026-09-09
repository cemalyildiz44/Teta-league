'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function sendTeamInviteAction(playerId: string) {
  try {
    if (!playerId) return { error: 'Oyuncu ID eksik.' };

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Giriş yapmanız gerekiyor.' };

    // Caller profile status check
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('status, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (callerProfile?.status === 'BANNED') {
      return { error: 'Hesabınız yasaklandığı için transfer daveti gönderemezsiniz.' };
    }
    if (callerProfile?.status === 'SUSPENDED' || callerProfile?.is_active === false) {
      return { error: 'Hesabınız askıya alındığı için transfer daveti gönderemezsiniz.' };
    }

    // Target player profile status check
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('status, is_active')
      .eq('id', playerId)
      .maybeSingle();

    if (!targetProfile || targetProfile.status === 'BANNED' || targetProfile.status === 'SUSPENDED' || targetProfile.is_active === false) {
      return { error: 'Askıya alınmış veya yasaklanmış bir oyuncuya transfer daveti gönderilemez.' };
    }

    const { error: rpcError } = await supabase.rpc('send_team_invite', {
      p_player_id: playerId
    });

    if (rpcError) {
      console.error('sendTeamInviteAction RPC error:', rpcError);
      return { error: 'İşlem başarısız: ' + rpcError.message };
    }

    revalidatePath('/profil');
    return { success: 'Davet başarıyla gönderildi.' };
  } catch (error: any) {
    console.error('sendTeamInviteAction unexpected error:', error);
    return { error: 'İşlem sırasında bir hata oluştu.' };
  }
}

export async function cancelTeamInviteAction(transferId: string) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz işlem.' };

    const { error: rpcError } = await supabase.rpc('cancel_team_invite', {
      p_transfer_id: transferId
    });

    if (rpcError) {
      console.error('cancelTeamInviteAction RPC error:', rpcError);
      return { error: 'İptal edilemedi: ' + rpcError.message };
    }

    revalidatePath('/profil');
    return { success: 'Davet iptal edildi.' };
  } catch (e) {
    console.error('cancelTeamInviteAction unexpected error:', e);
    return { error: 'Hata oluştu.' };
  }
}

export async function acceptTeamInviteAction(transferId: string) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz işlem.' };

    // Profile status guard for accepting invites (SUSPENDED / BANNED)
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.status === 'BANNED') {
      return { error: 'Hesabınız yasaklandığı için transfer teklifini kabul edemezsiniz.' };
    }
    if (profile?.status === 'SUSPENDED' || profile?.is_active === false) {
      return { error: 'Hesabınız askıya alındığı için transfer teklifini kabul edemezsiniz.' };
    }

    const { error: rpcError } = await supabase.rpc('accept_team_invite', {
      p_transfer_id: transferId
    });

    if (rpcError) {
      console.error('acceptTeamInviteAction RPC error:', rpcError);
      return { error: 'Kabul işlemi başarısız: ' + rpcError.message };
    }

    revalidatePath('/profil');
    revalidatePath('/bildirimler');
    return { success: 'Daveti kabul ettiniz ve takıma katıldınız.' };
  } catch (error: any) {
    console.error('acceptTeamInviteAction unexpected error:', error);
    return { error: 'İşlem sırasında bir hata oluştu.' };
  }
}

export async function rejectTeamInviteAction(transferId: string) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz işlem.' };

    const { error: rpcError } = await supabase.rpc('reject_team_invite', {
      p_transfer_id: transferId
    });

    if (rpcError) {
      console.error('rejectTeamInviteAction RPC error:', rpcError);
      return { error: 'Reddetme işlemi başarısız: ' + rpcError.message };
    }

    revalidatePath('/profil');
    revalidatePath('/bildirimler');
    return { success: 'Davet reddedildi.' };
  } catch (e) {
    console.error('rejectTeamInviteAction unexpected error:', e);
    return { error: 'Hata oluştu.' };
  }
}

export async function markNotificationReadAction(notificationId: string) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Yetkisiz' };

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id)
      .select('id')
      .single();

    if (error || !data) {
      return { error: 'Bildirim güncellenemedi veya size ait değil.' };
    }

    return { success: true };
  } catch (e) {
    console.error('markNotificationReadAction unexpected error:', e);
    return { error: 'İşlem sırasında bir hata oluştu.' };
  }
}

export async function searchPlayersAction(query: string) {
  if (!query || query.length < 3) return { data: [] };
  
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, primary_position, platform, team_memberships(team_id, left_at)')
    .ilike('username', `%${query}%`)
    .limit(10);
    
  if (error) {
    console.error('search error', error);
    return { error: 'Oyuncu aranırken bir hata oluştu.' };
  }
  
  const formatted = data.map((p: any) => {
    const activeMembership = p.team_memberships?.find((m: any) => !m.left_at);
    return {
      id: p.id,
      username: p.username,
      avatar_url: p.avatar_url,
      primary_position: p.primary_position,
      platform: p.platform,
      active_team_id: activeMembership ? activeMembership.team_id : null,
    };
  });

  return { data: formatted };
}
