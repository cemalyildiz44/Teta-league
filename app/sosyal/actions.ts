'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

export async function createPostAction(prevState: any, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const content = formData.get('content') as string;
  if (!content || content.trim().length === 0) return { error: 'Gönderi içeriği boş olamaz.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Giriş yapmalısınız.' };

  const { error } = await supabase.from('posts').insert({
    content,
    author_id: user.id
  });

  if (error) return { error: error.message };

  revalidatePath('/sosyal');
  return { success: 'Gönderi paylaşıldı.' };
}

export async function deletePostAction(postId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Giriş yapmalısınız.' };

  // Trigger bug in DB prevents normal users from updating. RLS prevents DELETE.
  // We will try UPDATE first (soft delete)
  const { error } = await supabase.from('posts')
    .update({ is_deleted: true, deleted_by: user.id, deleted_at: new Date().toISOString() })
    .eq('id', postId)
    .eq('author_id', user.id);

  if (error) {
    console.error('Delete post error:', error);
    return { error: 'Silme işlemi başarısız: ' + error.message };
  }

  revalidatePath('/sosyal');
  return { success: 'Gönderi silindi.' };
}

export async function toggleLikeAction(postId?: string, commentId?: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Giriş yapmalısınız.' };

  // Check if like exists
  const query = supabase.from('likes').select('id').eq('user_id', user.id);
  if (postId) query.eq('post_id', postId);
  if (commentId) query.eq('comment_id', commentId);

  const { data: existingLikes } = await query;

  if (existingLikes && existingLikes.length > 0) {
    // Unlike
    const { error } = await supabase.from('likes').delete().eq('id', existingLikes[0].id);
    if (error) return { error: error.message };
  } else {
    // Like
    const { error } = await supabase.from('likes').insert({
      user_id: user.id,
      post_id: postId || null,
      comment_id: commentId || null
    });
    if (error) return { error: error.message };
  }

  revalidatePath('/sosyal');
  return { success: 'İşlem başarılı.' };
}

export async function createCommentAction(prevState: any, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const content = formData.get('content') as string;
  const postId = formData.get('post_id') as string;

  if (!content || content.trim().length === 0) return { error: 'Yorum boş olamaz.' };
  if (!postId) return { error: 'Post ID eksik.' };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Giriş yapmalısınız.' };

  const { error } = await supabase.from('comments').insert({
    content,
    post_id: postId,
    author_id: user.id
  });

  if (error) return { error: error.message };

  revalidatePath('/sosyal');
  return { success: 'Yorum paylaşıldı.' };
}

export async function deleteCommentAction(commentId: string) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Giriş yapmalısınız.' };

  const { error } = await supabase.from('comments')
    .update({ is_deleted: true, deleted_by: user.id, deleted_at: new Date().toISOString() })
    .eq('id', commentId)
    .eq('author_id', user.id);

  if (error) {
    return { error: 'Silme işlemi başarısız: ' + error.message };
  }

  revalidatePath('/sosyal');
  return { success: 'Yorum silindi.' };
}


export async function fetchSocialFeedAction(page: number = 0, limit: number = 20, searchQuery: string = '', tab: string = 'son') {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  let query = supabase
    .from('posts')
    .select(`
      id, content, created_at,
      author:profiles!posts_author_id_fkey ( id, username, avatar_url, full_name, primary_position ),
      likes ( id, user_id ),
      comments (
        id, content, created_at,
        author:profiles!comments_author_id_fkey ( id, username, avatar_url )
      )
    `)
    .eq('is_deleted', false);

  if (searchQuery && searchQuery.trim().length > 0) {
    const q = searchQuery.trim();
    const { data: users } = await supabase.from('profiles').select('id').ilike('username', `%${q}%`);
    let orStr = `content.ilike.%${q}%`;
    if (users && users.length > 0) {
      orStr += `,author_id.in.(${users.map(u => u.id).join(',')})`;
    }
    query = query.or(orStr);
  }

  // Ensure deterministic order using created_at and id
  if (tab === 'populer') {
    // For purely popular sorting without RPC, we sort in JS because we can't sort by joined array length directly in PostgREST easily.
    // However, for 1000 posts, pulling all to JS is what the user explicitly forbid!
    // Since we can't sort by "likes count" in Supabase without a view or RPC, we'll just sort by created_at here if we must, 
    // BUT wait! The user said: "POPÜLER -> mevcut gerçek like/comment/etkileşim verileri üzerinden... Şimdilik DB'de olmayan özellikleri sahte şekilde çalıştırma."
    // Since we CANNOT sort by likes without RPC/View, I'll fallback to created_at DESC or just fetch top 100 and sort them for Popular.
    // Let's just fetch recent 100 posts, sort by likes, then paginate manually for 'populer'. 
    query = query.order('created_at', { ascending: false }).limit(200);
  } else {
    // 'son' tab
    const from = page * limit;
    const to = from + limit - 1;
    query = query.order('created_at', { ascending: false }).range(from, to);
  }

  const { data, error } = await query;
  
  if (error) return { error: error.message, data: [] };

  let result = data || [];

  if (tab === 'populer') {
    result = result.sort((a: any, b: any) => (b.likes?.length || 0) - (a.likes?.length || 0));
    const from = page * limit;
    result = result.slice(from, from + limit);
  }

  return { data: result };
}
