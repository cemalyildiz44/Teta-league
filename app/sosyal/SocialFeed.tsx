'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PostForm } from './PostForm';
import { PostItem } from './PostItem';
import { fetchSocialFeedAction } from './actions';

export function SocialFeed({ initialPosts, userProfile, currentUser }: { initialPosts: any[], userProfile: any, currentUser: any }) {
  const [posts, setPosts] = useState<any[]>(initialPosts);
  const [tab, setTab] = useState<'son' | 'populer' | 'sana_ozel'>('son');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(initialPosts.length >= 20);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

  const handlePostCreated = (newPost: any) => {
    if (newPost) {
      setPosts(prev => [newPost, ...prev]);
    }
  };

  const handleDeletePost = (deletedPostId: string) => {
    setPosts(prev => prev.filter(p => p.id !== deletedPostId));
  };

  const fetchPosts = useCallback(async (reset: boolean, currentTab: string, query: string, currentPage: number) => {
    setErrorMsg(null);
    if (reset) {
      setIsSearching(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      // Fallback sana_ozel to 'son' logic since there is no follow system yet
      const activeTab = currentTab === 'sana_ozel' ? 'son' : currentTab;
      const res = await fetchSocialFeedAction(currentPage, 20, query, activeTab);
      
      if (res.error) {
        console.error("Server Action Error:", res.error);
        setErrorMsg("Gönderiler yüklenemedi.");
        return;
      }

      const newPosts = res.data || [];
      if (reset) {
        setPosts(newPosts);
      } else {
        setPosts(prev => {
          // prevent duplicates
          const existingIds = new Set(prev.map(p => p.id));
          const uniqueNew = newPosts.filter((p: any) => !existingIds.has(p.id));
          return [...prev, ...uniqueNew];
        });
      }
      setHasMore(newPosts.length >= 20);
    } catch (err) {
      console.error("Network Error:", err);
      setErrorMsg("Gönderiler yüklenemedi. Bağlantı hatası.");
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  }, []);

  // Handle Search Input Change with Debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setPage(0);
      fetchPosts(true, tab, val, 0);
    }, 500);
  };

  const handleTabChange = (newTab: 'son' | 'populer' | 'sana_ozel') => {
    setTab(newTab);
    setPage(0);
    fetchPosts(true, newTab, searchQuery, 0);
  };

  const loadMore = () => {
    if (isLoadingMore || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchPosts(false, tab, searchQuery, nextPage);
  };

  const retryFetch = () => {
    fetchPosts(page === 0, tab, searchQuery, page);
  };

  return (
    <div className="flex flex-col gap-6 min-w-0">
      
      {/* SEARCH BAR */}
      <div className="relative z-10">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
        </div>
        <input 
          type="text" 
          placeholder="Gönderi, kullanıcı veya konu ara..." 
          value={searchQuery}
          onChange={handleSearchChange}
          className="w-full bg-[#01060b] border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-[14px] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
        />
        {isSearching && (
          <div className="absolute inset-y-0 right-0 pr-4 flex items-center">
            <div className="w-4 h-4 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      {/* COMPOSER */}
      {currentUser ? (
        <PostForm userProfile={userProfile} onPostCreated={handlePostCreated} />
      ) : (
        <div className="client-glass p-6 rounded-xl text-center border border-white/5 bg-[#03070c]">
          <p className="text-gray-400 text-[13px] font-medium tracking-wide uppercase">Gönderi paylaşmak için giriş yapmalısınız.</p>
        </div>
      )}

      {/* TABS */}
      <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto custom-scrollbar-hide">
        <button 
          onClick={() => handleTabChange('son')}
          className={`px-4 py-3 text-[13px] font-bold tracking-widest uppercase whitespace-nowrap border-b-2 transition-colors ${tab === 'son' ? 'border-[#00e5ff] text-[#00e5ff]' : 'border-transparent text-gray-500 hover:text-white'}`}
        >
          Son Gönderiler
        </button>
        <button 
          onClick={() => handleTabChange('populer')}
          className={`px-4 py-3 text-[13px] font-bold tracking-widest uppercase whitespace-nowrap border-b-2 transition-colors ${tab === 'populer' ? 'border-[#00e5ff] text-[#00e5ff]' : 'border-transparent text-gray-500 hover:text-white'}`}
        >
          Popüler
        </button>
        <button 
          onClick={() => handleTabChange('sana_ozel')}
          className={`px-4 py-3 text-[13px] font-bold tracking-widest uppercase whitespace-nowrap border-b-2 transition-colors ${tab === 'sana_ozel' ? 'border-[#00e5ff] text-[#00e5ff]' : 'border-transparent text-gray-500 hover:text-white'}`}
        >
          Sana Özel
        </button>
      </div>

      {/* FEED */}
      <div className="space-y-6">
        {errorMsg ? (
          <div className="empty-state !py-16 border border-[#e53e3e]/20 bg-[#e53e3e]/5 rounded-xl flex flex-col items-center gap-4">
            <span className="text-[40px] text-[#e53e3e]">⚠️</span>
            <span className="empty-state-title text-[18px] text-[#e53e3e] uppercase">HATA OLUŞTU</span>
            <span className="empty-state-desc text-gray-400">{errorMsg}</span>
            <button 
              onClick={retryFetch}
              className="mt-4 px-6 py-2 border border-[#e53e3e] text-[#e53e3e] hover:bg-[#e53e3e] hover:text-white transition-colors uppercase font-bold text-[12px] tracking-widest rounded-lg"
            >
              TEKRAR DENE
            </button>
          </div>
        ) : posts.length === 0 && !isSearching ? (
          searchQuery ? (
            <div className="empty-state !py-16 border border-white/5 bg-[#01060b]">
              <span className="text-[40px] mb-4">🔍</span>
              <span className="empty-state-title text-[18px]">SONUÇ BULUNAMADI</span>
              <span className="empty-state-desc">Aramanızla eşleşen bir gönderi bulunamadı.</span>
            </div>
          ) : (
            <div className="empty-state !py-16 border border-white/5 bg-[#01060b]">
              <span className="text-[40px] mb-4">💬</span>
              <span className="empty-state-title text-[18px]">GÖNDERİ YOK</span>
              <span className="empty-state-desc">Toplulukta henüz bir gönderi paylaşılmadı.</span>
            </div>
          )
        ) : (
          <>
            {posts.map((post) => (
              <PostItem
                key={post.id}
                post={post}
                currentUser={currentUser}
                onDeletePost={handleDeletePost}
              />
            ))}
            
            {hasMore && (
              <div className="pt-4 pb-8 flex justify-center">
                <button 
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="px-6 py-3 bg-[#01060b] border border-[#00e5ff]/30 text-[#00e5ff] text-[12px] font-[900] tracking-widest uppercase rounded-xl hover:bg-[#00e5ff]/10 transition-colors disabled:opacity-50 flex items-center gap-3"
                >
                  {isLoadingMore ? (
                    <>
                      <div className="w-4 h-4 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin"></div>
                      YÜKLENİYOR...
                    </>
                  ) : (
                    'DAHA FAZLA GÖSTER'
                  )}
                </button>
              </div>
            )}
            
            {!hasMore && posts.length > 0 && (
              <div className="pt-4 pb-8 text-center">
                <p className="text-[11px] text-gray-600 font-bold tracking-[0.2em] uppercase flex items-center justify-center gap-2">
                  <span className="w-4 h-px bg-gray-700"></span>
                  TÜM GÖNDERİLERİ GÖRDÜNÜZ
                  <span className="w-4 h-px bg-gray-700"></span>
                </p>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}
