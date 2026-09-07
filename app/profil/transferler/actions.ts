'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function respondToTransfer(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const transferId = formData.get('transferId') as string;
  const acceptStr = formData.get('accept') as string;
  const isAccept = acceptStr === 'true';

  if (!transferId) return { error: 'Missing transfer ID' };

  // Route to the new RPCs instead of the old respond_to_transfer
  const rpcName = isAccept ? 'accept_team_invite' : 'reject_team_invite';
  const { error } = await supabase.rpc(rpcName, {
    p_transfer_id: transferId
  });

  if (error) {
    return { error: 'İşlem başarısız: ' + error.message };
  }

  revalidatePath('/profil/transferler');
  return { success: true };
}

export async function leaveTeamAction(formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const seasonId = formData.get('seasonId') as string;
  if (!seasonId) return { error: 'Missing season ID' };

  const { error } = await supabase.rpc('leave_team', {
    p_season_id: seasonId
  });

  if (error) {
    return { error: 'Ayrılma işlemi başarısız: ' + error.message };
  }

  revalidatePath('/profil');
  revalidatePath('/profil/transferler');
  return { success: true };
}
