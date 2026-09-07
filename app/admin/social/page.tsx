import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { SocialModerationManager } from './SocialModerationManager';

export default async function AdminSocialPage({ searchParams }: any) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  
  const resolvedParams = await searchParams;
  
  // Safe page parsing to avoid NaN (1-based convention)
  const requestedPage = parseInt(resolvedParams?.page, 10);
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 ? requestedPage : 1;
  
  const tab = resolvedParams?.tab || 'posts';
  const status = resolvedParams?.status || 'ALL'; // ALL, ACTIVE, DELETED
  const searchQ = resolvedParams?.q || '';
  
  const limit = 20;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Fetch KPIs (using exact counts)
  const [{ count: totalPosts }, { count: activePosts }, { count: deletedPosts }, { count: totalComments }, { count: deletedComments }] = await Promise.all([
    supabase.from('posts').select('*', { count: 'exact', head: true }),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('is_deleted', true),
    supabase.from('comments').select('*', { count: 'exact', head: true }),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('is_deleted', true)
  ]);

  const kpis = {
    totalPosts: totalPosts || 0,
    totalComments: totalComments || 0,
    activePosts: activePosts || 0,
    deletedContent: (deletedPosts || 0) + (deletedComments || 0)
  };

  let postsData: any[] = [];
  let commentsData: any[] = [];
  let totalCount = 0;

  if (tab === 'posts') {
    let query = supabase
      .from('posts')
      .select('id, content, created_at, is_deleted, profiles!posts_author_id_fkey(username, avatar_url, primary_position), likes(count), comments(count)', { count: 'exact' });
      
    if (status === 'ACTIVE') query = query.eq('is_deleted', false);
    if (status === 'DELETED') query = query.eq('is_deleted', true);
    if (searchQ) query = query.ilike('content', `%${searchQ}%`);

    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
    postsData = data || [];
    totalCount = count || 0;
    
    console.log('[ADMIN SOCIAL POSTS]', {
      page,
      from,
      to,
      count: totalCount,
      dataLength: postsData?.length,
      firstPost: postsData?.[0],
      error
    });
  } else {
    let query = supabase
      .from('comments')
      .select('id, content, created_at, is_deleted, post_id, profiles!comments_author_id_fkey(username, avatar_url, primary_position), posts(content)', { count: 'exact' });
      
    if (status === 'ACTIVE') query = query.eq('is_deleted', false);
    if (status === 'DELETED') query = query.eq('is_deleted', true);
    if (searchQ) query = query.ilike('content', `%${searchQ}%`);

    const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to);
    if (error) console.error('[ADMIN SOCIAL COMMENTS QUERY] Error:', error);
    commentsData = data || [];
    totalCount = count || 0;
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 md:py-12">
      <div className="mb-10 text-center flex flex-col items-center">
        <span className="text-[#00e5ff] text-[10px] font-[900] tracking-[0.3em] uppercase bg-[#00e5ff]/10 px-4 py-1.5 rounded-full border border-[#00e5ff]/30 mb-4 shadow-[0_0_15px_rgba(0,229,255,0.2)]">
          TETA NETWORK MODERATION CENTER
        </span>
        <h1 className="text-3xl md:text-5xl font-black text-white tracking-widest uppercase mb-3 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
          SOSYAL MODERASYON
        </h1>
        <p className="text-sm md:text-base text-zinc-400 max-w-2xl font-medium">
          Teta Network üzerindeki gönderileri ve yorumları güvenli şekilde yönet.
        </p>
      </div>

      <SocialModerationManager 
        kpis={kpis}
        initialPosts={postsData}
        initialComments={commentsData}
        totalCount={totalCount}
        currentParams={{ tab, page, status, q: searchQ }}
        limit={limit}
      />
    </div>
  );
}
