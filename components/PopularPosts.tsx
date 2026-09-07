import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export const revalidate = 60; // SSR with revalidation

export default async function PopularPosts() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // Popular by most likes
  const { data: posts } = await supabase
    .from('posts')
    .select(`
      id, content, created_at,
      author:profiles!posts_author_id_fkey ( id, username, avatar_url ),
      likes ( id )
    `)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  let popular: any[] = [];
  if (posts) {
    // Sort by like count manually since postgrest order on count is tricky
    popular = posts.sort((a: any, b: any) => (b.likes?.length || 0) - (a.likes?.length || 0)).slice(0, 3);
  }

  if (popular.length === 0) {
    return (
      <div className="card-surface rounded-2xl p-6 border border-white/5 h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <h2 className="text-[24px] font-[800] text-white tracking-widest">POPÜLER <span className="text-purple-400">GÖNDERİLER</span></h2>
          <div className="h-px flex-1 bg-gradient-to-r from-purple-500/20 to-transparent" />
        </div>
        <div className="flex-1 flex items-center justify-center border-dashed border-2 border-white/5 rounded-xl">
          <div className="empty-state"><span className="empty-state-title text-[15px]">Popüler Gönderi Yok</span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="card-surface rounded-2xl p-6 border border-white/5 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-[24px] font-[800] text-white tracking-widest">POPÜLER <span className="text-purple-400">GÖNDERİLER</span></h2>
        <div className="h-px flex-1 bg-gradient-to-r from-purple-500/20 to-transparent" />
      </div>

      <div className="space-y-4">
        {popular.map((post: any, idx: number) => (
          <div key={post.id} className="relative group cursor-pointer bg-[#060d18] rounded-xl p-4 border border-white/5 hover:border-purple-500/30 transition-all">
            <div className="absolute -left-2 -top-2 w-6 h-6 rounded-full bg-black border border-purple-500/30 flex items-center justify-center text-[10px] font-black text-purple-400 shadow-lg z-10">
              #{idx + 1}
            </div>
            <div className="flex items-center gap-3 mb-2">
              {post.author.avatar_url ? (
                <img src={post.author.avatar_url} alt="" className="w-8 h-8 rounded-full border border-white/10" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#132338] border border-white/10 flex items-center justify-center font-bold text-purple-400 text-xs">
                  {post.author.username.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="font-bold text-white text-xs truncate">{post.author.username}</span>
            </div>
            <p className="text-gray-400 text-xs line-clamp-2 mb-3 pl-11">{post.content}</p>
            <div className="flex justify-end gap-2 text-[13px] font-[700] text-purple-400/80 pr-2">
              <span className="bg-purple-500/10 px-2 py-1 rounded">♥ {post.likes?.length || 0}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
