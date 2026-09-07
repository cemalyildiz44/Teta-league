import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import Link from 'next/link';

export const revalidate = 60; // SSR with revalidation

export default async function SocialFeed() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: posts } = await supabase
    .from('posts')
    .select(`
      id, content, created_at,
      author:profiles!posts_author_id_fkey ( id, username, avatar_url ),
      likes ( id ),
      comments ( id )
    `)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(3);

  if (!posts || posts.length === 0) {
    return (
      <div className="client-glass p-6 md:p-8 max-h-[350px] md:max-h-[400px] xl:max-h-[450px] flex flex-col border border-white/5">
        <div className="flex items-center gap-3 mb-6 shrink-0">
          <h2 className="text-[24px] font-[800] tracking-wide text-white tracking-widest">SON <span className="text-[#00e5ff]">GÖNDERİLER</span></h2>
          <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
        </div>
        <div className="empty-state flex-1 !py-8"><span className="empty-state-title text-[18px]">Gönderi Yok</span></div>
      </div>
    );
  }

  return (
    <div className="client-glass p-6 md:p-8 max-h-[350px] md:max-h-[400px] xl:max-h-[450px] flex flex-col border border-white/5">
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <h2 className="text-[24px] font-[800] tracking-wide text-white tracking-widest">SON <span className="text-[#00e5ff]">GÖNDERİLER</span></h2>
        <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
      </div>
      
      <div className="space-y-4 flex-1 overflow-y-auto pr-2 min-h-0">
        {posts.map((post: any) => (
          <div key={post.id} className="group relative">
            <div className="flex items-start gap-4 p-4 rounded-xl hover:bg-[#060d18] border border-transparent hover:border-[#00e5ff]/20 transition-all">
              <div className="relative">
                {post.author.avatar_url ? (
                  <img src={post.author.avatar_url} alt="" className="w-12 h-12 rounded-full border border-white/10" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#132338] border border-white/10 flex items-center justify-center font-bold text-[#00e5ff]">
                    {post.author.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-white text-sm truncate">{post.author.username}</span>
                </div>
                <p className="text-gray-400 text-sm line-clamp-2 mb-3">{post.content}</p>
                <div className="flex items-center gap-4 text-[13px] font-[700] text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="text-sm">💬</span> {post.comments?.length || 0}
                  </span>
                  <span className="flex items-center gap-1.5 hover:text-[#00e5ff] transition-colors cursor-pointer">
                    <span className="text-sm border border-transparent group-hover:border-[#00e5ff]/30 rounded px-1 transition-all">
                      ♥ {post.likes?.length || 0}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <Link 
        href="/sosyal"
        className="mt-6 shrink-0 block w-full py-3 text-center text-[13px] flat-button"
      >
        TÜMÜNÜ GÖR
      </Link>
    </div>
  );
}
