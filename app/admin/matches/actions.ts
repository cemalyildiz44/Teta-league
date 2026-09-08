
'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { slugify } from '@/app/lig/utils';

async function checkAdmin(supabase: any, user: any) {
  if (!user) return false;
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', ['ADMIN', 'SUPER_ADMIN']).single();
  return !!data;
}

export async function reviewMatchAction(matchId: string, status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW' | 'CANCELLED') {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  // Fetch current match to guard against re-approval and collect route info for revalidation
  const { data: existingMatch } = await supabase
    .from('matches')
    .select('id, status, season_id, league_id, seasons(slug), leagues(name)')
    .eq('id', matchId)
    .single();

  if (!existingMatch) return { error: 'Maç bulunamadı.' };

  // 2. Re-Approve Protection: Guard against re-approving an already approved match
  if (existingMatch.status === 'APPROVED' && status === 'APPROVED') {
    return { error: 'Bu maç zaten onaylanmış.' };
  }

  const { error } = await supabase.from('matches').update({
    status,
    approved_by: status === 'APPROVED' ? user.id : null,
    approved_at: status === 'APPROVED' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  }).eq('id', matchId);

  if (error) return { error: error.message };

  // 3. Cache Invalidation: Revalidate necessary public paths and admin paths
  revalidatePath('/admin/matches');

  if (status === 'APPROVED' || existingMatch.status === 'APPROVED') {
    revalidatePath('/');
    revalidatePath('/ligler');
    revalidatePath('/oyuncular');
    revalidatePath(`/mac/${matchId}`);

    const seasonSlug = (existingMatch.seasons as any)?.slug;
    const leagueName = (existingMatch.leagues as any)?.name;
    if (seasonSlug && leagueName) {
      const leagueSlug = slugify(leagueName);
      revalidatePath(`/lig/${seasonSlug}/${leagueSlug}`);
      revalidatePath(`/lig/${seasonSlug}/${leagueSlug}/istatistikler`);
      revalidatePath(`/lig/${seasonSlug}/${leagueSlug}/fikstur`);
    }
  }

  return { success: 'Maç durumu güncellendi.' };
}

export async function deleteMatchAction(matchId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  // First delete player stats if any exist to respect FK (no cascade)
  const { error: statsError } = await supabase.from('match_player_stats').delete().eq('match_id', matchId);
  if (statsError) return { error: 'İlişkili oyuncu istatistikleri silinemedi: ' + statsError.message };

  const { error } = await supabase.from('matches').delete().eq('id', matchId);
  if (error) return { error: 'Maç silinemedi: ' + error.message };

  revalidatePath('/admin/matches');
  return { success: 'Maç başarıyla silindi.' };
}


export async function updateMatchScoreAction(matchId: string, home_score: number, away_score: number) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!(await checkAdmin(supabase, user)) || !user) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('matches').update({
    home_score,
    away_score,
    updated_at: new Date().toISOString()
  }).eq('id', matchId);

  if (error) return { error: 'Skor güncellenemedi: ' + error.message };
  revalidatePath('/admin/matches');
  return { success: 'Skor başarıyla güncellendi.' };
}

