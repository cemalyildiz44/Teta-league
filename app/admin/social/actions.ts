
'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

async function checkAdmin(supabase: any, user: any) {
  if (!user) return false;
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).in('role', ['ADMIN', 'SUPER_ADMIN']).eq('is_active', true).maybeSingle();
  return !!data;
}

export async function adminDeletePostAction(postId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('posts').update({ is_deleted: true }).eq('id', postId);

  if (error) return { error: 'Gönderi silinemedi: ' + error.message };

  revalidatePath('/admin/social');
  revalidatePath('/sosyal');
  return { success: 'Gönderi başarıyla silindi.' };
}

export async function adminDeleteCommentAction(commentId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('comments').update({ is_deleted: true }).eq('id', commentId);

  if (error) return { error: 'Yorum silinemedi: ' + error.message };

  revalidatePath('/admin/social');
  revalidatePath('/sosyal');
  return { success: 'Yorum başarıyla silindi.' };
}


export async function adminRestorePostAction(postId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('posts').update({ is_deleted: false, deleted_by: null, delete_reason: null }).eq('id', postId);

  if (error) return { error: 'Gönderi geri alınamadı: ' + error.message };

  revalidatePath('/admin/social');
  revalidatePath('/sosyal');
  return { success: 'Gönderi başarıyla geri alındı.' };
}

export async function adminRestoreCommentAction(commentId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { error } = await supabase.from('comments').update({ is_deleted: false, deleted_by: null }).eq('id', commentId);

  if (error) return { error: 'Yorum geri alınamadı: ' + error.message };

  revalidatePath('/admin/social');
  revalidatePath('/sosyal');
  return { success: 'Yorum başarıyla geri alındı.' };
}
