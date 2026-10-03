
'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { logAdminAudit } from '@/lib/audit';

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

  const { data: post } = await supabase.from('posts').select('id, content, user_id').eq('id', postId).maybeSingle();

  const { error } = await supabase.from('posts').update({ is_deleted: true }).eq('id', postId);

  if (error) return { error: 'Gönderi silinemedi: ' + error.message };

  await logAdminAudit({
    action: 'DELETE_POST',
    entity_type: 'posts',
    entity_id: postId,
    entity_label: post?.content ? (post.content.length > 30 ? post.content.substring(0, 30) + '...' : post.content) : `Gönderi #${postId.substring(0, 8)}`,
    old_data: { is_deleted: false },
    new_data: { is_deleted: true },
    description: 'Gönderi yönetici tarafından silindi.',
    actor_id: user?.id
  });

  revalidatePath('/admin/social');
  revalidatePath('/sosyal');
  return { success: 'Gönderi başarıyla silindi.' };
}

export async function adminDeleteCommentAction(commentId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { data: comment } = await supabase.from('comments').select('id, content, post_id, user_id').eq('id', commentId).maybeSingle();

  const { error } = await supabase.from('comments').update({ is_deleted: true }).eq('id', commentId);

  if (error) return { error: 'Yorum silinemedi: ' + error.message };

  await logAdminAudit({
    action: 'DELETE_COMMENT',
    entity_type: 'comments',
    entity_id: commentId,
    entity_label: comment?.content ? (comment.content.length > 30 ? comment.content.substring(0, 30) + '...' : comment.content) : `Yorum #${commentId.substring(0, 8)}`,
    old_data: { is_deleted: false },
    new_data: { is_deleted: true },
    description: 'Yorum yönetici tarafından silindi.',
    actor_id: user?.id
  });

  revalidatePath('/admin/social');
  revalidatePath('/sosyal');
  return { success: 'Yorum başarıyla silindi.' };
}


export async function adminRestorePostAction(postId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { data: post } = await supabase.from('posts').select('id, content, user_id').eq('id', postId).maybeSingle();

  const { error } = await supabase.from('posts').update({ is_deleted: false, deleted_by: null, delete_reason: null }).eq('id', postId);

  if (error) return { error: 'Gönderi geri alınamadı: ' + error.message };

  await logAdminAudit({
    action: 'RESTORE_POST',
    entity_type: 'posts',
    entity_id: postId,
    entity_label: post?.content ? (post.content.length > 30 ? post.content.substring(0, 30) + '...' : post.content) : `Gönderi #${postId.substring(0, 8)}`,
    old_data: { is_deleted: true },
    new_data: { is_deleted: false },
    description: 'Silinmiş gönderi yönetici tarafından geri yüklendi.',
    actor_id: user?.id
  });

  revalidatePath('/admin/social');
  revalidatePath('/sosyal');
  return { success: 'Gönderi başarıyla geri alındı.' };
}

export async function adminRestoreCommentAction(commentId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!(await checkAdmin(supabase, user))) return { error: 'Yetkisiz erişim.' };

  const { data: comment } = await supabase.from('comments').select('id, content, post_id, user_id').eq('id', commentId).maybeSingle();

  const { error } = await supabase.from('comments').update({ is_deleted: false, deleted_by: null }).eq('id', commentId);

  if (error) return { error: 'Yorum geri alınamadı: ' + error.message };

  await logAdminAudit({
    action: 'RESTORE_COMMENT',
    entity_type: 'comments',
    entity_id: commentId,
    entity_label: comment?.content ? (comment.content.length > 30 ? comment.content.substring(0, 30) + '...' : comment.content) : `Yorum #${commentId.substring(0, 8)}`,
    old_data: { is_deleted: true },
    new_data: { is_deleted: false },
    description: 'Silinmiş yorum yönetici tarafından geri yüklendi.',
    actor_id: user?.id
  });

  revalidatePath('/admin/social');
  revalidatePath('/sosyal');
  return { success: 'Yorum başarıyla geri alındı.' };
}
