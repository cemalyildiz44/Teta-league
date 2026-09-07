'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Search, Filter, Trash2, Eye, RotateCcw, AlertTriangle, 
  MessageSquare, Heart, MessageCircle, User, ShieldAlert,
  ChevronLeft, ChevronRight, X, Loader2
} from 'lucide-react';
import { 
  adminDeletePostAction, adminRestorePostAction,
  adminDeleteCommentAction, adminRestoreCommentAction 
} from './actions';

export function SocialModerationManager({ kpis, initialPosts, initialComments, totalCount, currentParams, limit }: any) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState(currentParams.q || '');
  const [feedback, setFeedback] = useState<{msg: string, type: 'success'|'error'} | null>(null);

  // Modals
  const [detailModal, setDetailModal] = useState<any>(null); // holds post/comment obj + type
  const [confirmModal, setConfirmModal] = useState<any>({ isOpen: false });

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm !== currentParams.q) {
        updateParams({ q: searchTerm, page: 1 }); // reset page on search
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const updateParams = (newParams: any) => {
    const params = new URLSearchParams();
    if (newParams.tab !== undefined) params.set('tab', newParams.tab);
    else params.set('tab', currentParams.tab);
    
    if (newParams.status !== undefined) params.set('status', newParams.status);
    else if (currentParams.status) params.set('status', currentParams.status);
    
    if (newParams.q !== undefined) {
      if (newParams.q) params.set('q', newParams.q);
    } else if (currentParams.q) params.set('q', currentParams.q);
    
    if (newParams.page !== undefined) params.set('page', newParams.page.toString());
    else params.set('page', currentParams.page.toString());

    router.push(`/admin/social?${params.toString()}`);
  };

  const handleAction = async (actionFn: any, id: string) => {
    setLoading(true);
    const res = await actionFn(id);
    setLoading(false);
    if (res.error) setFeedback({ msg: res.error, type: 'error' });
    else {
      setFeedback({ msg: res.success, type: 'success' });
      setConfirmModal({ isOpen: false });
      setDetailModal(null);
      router.refresh();
    }
    setTimeout(() => setFeedback(null), 3000);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  };

  const safeTotalCount = totalCount ?? 0;
  const safeLimit = limit ?? 20;
  const totalPages = Math.max(1, Math.ceil(safeTotalCount / safeLimit));

  console.log('[SSR RENDER LOG] tab:', currentParams.tab, 'initialPosts length:', initialPosts?.length, 'posts:', initialPosts);

  return (
    <div className='space-y-8'>
      {feedback && (
        <div className={`p-4 rounded-xl border flex items-center justify-center gap-3 ${feedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {feedback.type === 'success' ? <span className='text-lg'>✓</span> : <ShieldAlert className='w-5 h-5'/>}
          <span className='text-sm font-bold uppercase tracking-widest'>{feedback.msg}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6'>
        <div className='card-surface p-6 rounded-2xl border border-white/5 flex flex-col items-center text-center'>
          <MessageSquare className='w-6 h-6 text-cyan-400 mb-3 opacity-80' />
          <span className='text-3xl font-black text-white'>{kpis.totalPosts}</span>
          <span className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1'>Toplam Gönderi</span>
        </div>
        <div className='card-surface p-6 rounded-2xl border border-white/5 flex flex-col items-center text-center'>
          <MessageCircle className='w-6 h-6 text-cyan-400 mb-3 opacity-80' />
          <span className='text-3xl font-black text-white'>{kpis.totalComments}</span>
          <span className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1'>Toplam Yorum</span>
        </div>
        <div className='card-surface p-6 rounded-2xl border border-white/5 flex flex-col items-center text-center'>
          <ShieldAlert className='w-6 h-6 text-emerald-400 mb-3 opacity-80' />
          <span className='text-3xl font-black text-white'>{kpis.activePosts}</span>
          <span className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1'>Aktif Gönderi</span>
        </div>
        <div className='card-surface p-6 rounded-2xl border border-white/5 flex flex-col items-center text-center'>
          <Trash2 className='w-6 h-6 text-red-400 mb-3 opacity-80' />
          <span className='text-3xl font-black text-red-400'>{kpis.deletedContent}</span>
          <span className='text-[10px] font-bold text-red-500/50 uppercase tracking-widest mt-1'>Silinen İçerik</span>
        </div>
      </div>

      {/* Main Container */}
      <div className='card-surface rounded-2xl border border-white/5 overflow-hidden flex flex-col min-h-[600px]'>
        
        {/* Controls Bar */}
        <div className='p-4 md:p-6 bg-[#0a1628] border-b border-white/5 flex flex-col lg:flex-row gap-6 justify-between items-center shrink-0'>
          
          {/* Tabs */}
          <div className='flex items-center gap-2 bg-[#060d18] p-1.5 rounded-xl border border-white/5'>
            <button 
              onClick={() => updateParams({ tab: 'posts', page: 1 })}
              className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${currentParams.tab === 'posts' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-zinc-500 hover:text-white'}`}
            >
              Gönderiler
            </button>
            <button 
              onClick={() => updateParams({ tab: 'comments', page: 1 })}
              className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${currentParams.tab === 'comments' ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20' : 'text-zinc-500 hover:text-white'}`}
            >
              Yorumlar
            </button>
          </div>

          {/* Filters & Search */}
          <div className='flex w-full lg:w-auto items-center gap-3'>
            <div className='relative flex-1 lg:w-64'>
              <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500' />
              <input 
                type='text' 
                placeholder='İçerik ara...' 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='w-full bg-[#060d18] border border-white/5 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:border-cyan-500/50 outline-none transition-colors'
              />
            </div>
            <select 
              value={currentParams.status}
              onChange={(e) => updateParams({ status: e.target.value, page: 1 })}
              className='bg-[#060d18] border border-white/5 rounded-xl px-4 py-2 text-sm font-bold text-zinc-400 focus:border-cyan-500/50 outline-none transition-colors appearance-none cursor-pointer uppercase tracking-widest text-[10px]'
            >
              <option value='ALL'>Tümü</option>
              <option value='ACTIVE'>Aktif</option>
              <option value='DELETED'>Silinmiş</option>
            </select>
          </div>
        </div>

        {/* Content List */}
        <div className='p-6 flex-1 bg-gradient-to-b from-[#060d18] to-[#01060b]'>
          
          <div className='text-xs text-red-500 mb-4'>DEBUG: initialPosts.length = {initialPosts?.length}, tab = {currentParams?.tab}</div>

          {currentParams.tab === 'posts' && (
            <div className='space-y-4'>
              {initialPosts.length === 0 ? (
                <div className='py-24 text-center text-zinc-500 font-mono text-sm'>
                  Aramanızla eşleşen gönderi bulunamadı. (Sorgu sonucu 0 satır döndü)
                </div>
              ) : (
                initialPosts.map((post: any) => (
                  <div key={post.id} className={`p-5 rounded-2xl border transition-all ${post.is_deleted ? 'bg-red-500/5 border-red-500/10 opacity-70' : 'bg-white/5 border-white/5 hover:border-cyan-500/20 hover:bg-white/10'}`}>
                    <div className='flex items-start justify-between gap-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-full bg-zinc-800 overflow-hidden shrink-0 border border-white/10'>
                          {post.profiles?.avatar_url ? <img src={post.profiles.avatar_url} className='w-full h-full object-cover'/> : <User className='w-5 h-5 text-zinc-500 m-auto mt-2.5'/>}
                        </div>
                        <div>
                          <div className='flex items-center gap-2'>
                            <span className='text-sm font-black text-white'>@{post.profiles?.username}</span>
                            {post.is_deleted && <span className='px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest'>Silinmiş</span>}
                          </div>
                          <span className='text-[10px] text-zinc-500 uppercase tracking-widest'>{formatDate(post.created_at)}</span>
                        </div>
                      </div>
                      <div className='flex items-center gap-2 shrink-0'>
                        <button onClick={() => setDetailModal({ type: 'post', data: post })} className='p-2 bg-[#060d18] hover:bg-white/5 text-cyan-400 rounded-lg transition-colors border border-white/5' title='Detay'><Eye className='w-4 h-4'/></button>
                        {post.is_deleted ? (
                          <button onClick={() => setConfirmModal({ action: () => handleAction(adminRestorePostAction, post.id), title: 'Gönderiyi Geri Al', type: 'warning', message: 'Bu gönderiyi geri alıp herkesin görebilmesini sağlamak istiyor musunuz?' })} className='p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg transition-colors border border-amber-500/10' title='Geri Al'><RotateCcw className='w-4 h-4'/></button>
                        ) : (
                          <button onClick={() => setConfirmModal({ action: () => handleAction(adminDeletePostAction, post.id), title: 'Gönderiyi Sil', type: 'danger', message: 'Bu gönderiyi silmek istediğinize emin misiniz? Gönderi veritabanında saklanacak ancak kullanıcılara gösterilmeyecektir (Soft Delete).' })} className='p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/10' title='Sil'><Trash2 className='w-4 h-4'/></button>
                        )}
                      </div>
                    </div>
                    <p className='mt-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap'>{post.content}</p>
                    <div className='mt-4 flex items-center gap-4 text-xs font-bold text-zinc-500 uppercase tracking-widest'>
                      <span className='flex items-center gap-1'><Heart className='w-3.5 h-3.5'/> {post.likes?.[0]?.count ?? post.likes?.length ?? 0} Beğeni</span>
                      <span className='flex items-center gap-1'><MessageCircle className='w-3.5 h-3.5'/> {post.comments?.[0]?.count ?? post.comments?.length ?? 0} Yorum</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {currentParams.tab === 'comments' && (
            <div className='space-y-4'>
              {initialComments.length === 0 ? (
                <div className='py-24 text-center text-zinc-500 font-mono text-sm'>Aramanızla eşleşen yorum bulunamadı.</div>
              ) : (
                initialComments.map((comment: any) => (
                  <div key={comment.id} className={`p-5 rounded-2xl border transition-all ${comment.is_deleted ? 'bg-red-500/5 border-red-500/10 opacity-70' : 'bg-white/5 border-white/5 hover:border-cyan-500/20 hover:bg-white/10'}`}>
                    <div className='flex items-start justify-between gap-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-8 h-8 rounded-full bg-zinc-800 overflow-hidden shrink-0 border border-white/10'>
                          {comment.profiles?.avatar_url ? <img src={comment.profiles.avatar_url} className='w-full h-full object-cover'/> : <User className='w-4 h-4 text-zinc-500 m-auto mt-2'/>}
                        </div>
                        <div>
                          <div className='flex items-center gap-2'>
                            <span className='text-sm font-black text-white'>@{comment.profiles?.username}</span>
                            {comment.is_deleted && <span className='px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] font-black uppercase tracking-widest'>Silinmiş</span>}
                          </div>
                          <span className='text-[10px] text-zinc-500 uppercase tracking-widest'>{formatDate(comment.created_at)}</span>
                        </div>
                      </div>
                      <div className='flex items-center gap-2 shrink-0'>
                        <button onClick={() => setDetailModal({ type: 'comment', data: comment })} className='p-2 bg-[#060d18] hover:bg-white/5 text-cyan-400 rounded-lg transition-colors border border-white/5' title='Detay'><Eye className='w-4 h-4'/></button>
                        {comment.is_deleted ? (
                          <button onClick={() => setConfirmModal({ action: () => handleAction(adminRestoreCommentAction, comment.id), title: 'Yorumu Geri Al', type: 'warning', message: 'Bu yorumu geri almak istediğinize emin misiniz?' })} className='p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded-lg transition-colors border border-amber-500/10' title='Geri Al'><RotateCcw className='w-4 h-4'/></button>
                        ) : (
                          <button onClick={() => setConfirmModal({ action: () => handleAction(adminDeleteCommentAction, comment.id), title: 'Yorumu Sil', type: 'danger', message: 'Bu yorumu silmek istediğinize emin misiniz?' })} className='p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/10' title='Sil'><Trash2 className='w-4 h-4'/></button>
                        )}
                      </div>
                    </div>
                    <p className='mt-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap'>{comment.content}</p>
                  </div>
                ))
              )}
            </div>
          )}

        </div>

        {/* Pagination */}
        <div className='p-4 md:p-6 bg-[#0a1628] border-t border-white/5 flex items-center justify-between shrink-0'>
          <span className='text-xs font-bold text-zinc-500 uppercase tracking-widest'>Sayfa {currentParams.page} / {totalPages}</span>
          <div className='flex gap-2'>
            <button 
              onClick={() => updateParams({ page: Math.max(1, currentParams.page - 1) })}
              disabled={currentParams.page <= 1}
              className='w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white disabled:opacity-30 disabled:pointer-events-none transition-colors'
            >
              <ChevronLeft className='w-5 h-5'/>
            </button>
            <button 
              onClick={() => updateParams({ page: Math.min(totalPages, currentParams.page + 1) })}
              disabled={currentParams.page >= totalPages}
              className='w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-white disabled:opacity-30 disabled:pointer-events-none transition-colors'
            >
              <ChevronRight className='w-5 h-5'/>
            </button>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden shadow-2xl'>
            <div className={`flex items-center gap-3 p-5 border-b border-white/5 ${confirmModal.type === 'danger' ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
              <AlertTriangle className={`w-5 h-5 ${confirmModal.type === 'danger' ? 'text-red-400' : 'text-amber-400'}`} />
              <h2 className={`text-sm font-black tracking-widest uppercase ${confirmModal.type === 'danger' ? 'text-red-400' : 'text-amber-400'}`}>
                {confirmModal.title}
              </h2>
            </div>
            <div className='p-6 bg-[#060d18]'>
              <p className='text-sm text-zinc-300 leading-relaxed mb-6'>{confirmModal.message}</p>
              <div className='flex gap-3'>
                <button onClick={() => setConfirmModal({ isOpen: false })} className='flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-colors'>VAZGEÇ</button>
                <button onClick={confirmModal.action} disabled={loading} className={`flex-1 py-3 rounded-xl text-xs font-black flex justify-center items-center gap-2 transition-colors ${confirmModal.type === 'danger' ? 'bg-red-500 hover:bg-red-400 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)]'}`}>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} ONAYLA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto'>
          <div className='card-surface w-full max-w-2xl my-8 rounded-2xl border border-white/10 overflow-hidden shadow-2xl'>
            <div className='flex justify-between items-center p-5 border-b border-white/5 bg-[#0a1628]'>
              <h2 className='text-sm font-black text-white tracking-widest uppercase'>
                {detailModal.type === 'post' ? 'Gönderi Detayı' : 'Yorum Detayı'}
              </h2>
              <button onClick={() => setDetailModal(null)} className='text-zinc-400 hover:text-white p-1 bg-white/5 rounded-lg'><X className='w-5 h-5'/></button>
            </div>
            
            <div className='p-6 bg-[#060d18] space-y-6'>
              {/* User Info */}
              <div className='flex items-center gap-4 bg-white/5 p-4 rounded-xl border border-white/5'>
                <div className='w-14 h-14 rounded-full bg-zinc-800 overflow-hidden shrink-0 border-2 border-white/10'>
                  {detailModal.data.profiles?.avatar_url ? <img src={detailModal.data.profiles.avatar_url} className='w-full h-full object-cover'/> : <User className='w-6 h-6 text-zinc-500 m-auto mt-4'/>}
                </div>
                <div>
                  <Link href={`/oyuncular/${detailModal.data.profiles?.username}`} target="_blank" className='text-base font-black text-white hover:text-cyan-400 transition-colors block'>@{detailModal.data.profiles?.username}</Link>
                  {detailModal.data.profiles?.primary_position && (
                    <span className='text-[10px] font-bold text-cyan-400 uppercase tracking-widest'>{detailModal.data.profiles.primary_position}</span>
                  )}
                  <div className='text-[10px] text-zinc-500 mt-1 font-mono'>{formatDate(detailModal.data.created_at)}</div>
                </div>
              </div>

              {/* Connected Post (if it's a comment) */}
              {detailModal.type === 'comment' && detailModal.data.posts && (
                <div className='space-y-2'>
                  <h4 className='text-[10px] font-black text-zinc-500 uppercase tracking-widest'>Bağlı Gönderi (Alıntı)</h4>
                  <div className='p-4 bg-white/5 rounded-xl border border-white/10 border-l-2 border-l-cyan-500 opacity-70'>
                    <p className='text-sm text-zinc-300 italic line-clamp-2'>"{detailModal.data.posts.content}"</p>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className='space-y-2'>
                <h4 className='text-[10px] font-black text-zinc-500 uppercase tracking-widest'>İçerik</h4>
                <div className={`p-5 rounded-xl border border-white/5 text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap ${detailModal.data.is_deleted ? 'bg-red-500/10' : 'bg-black/50'}`}>
                  {detailModal.data.content}
                </div>
              </div>

              {/* Status / Link */}
              <div className='flex items-center justify-between pt-4 border-t border-white/5'>
                <div className='flex items-center gap-2'>
                  <span className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest'>Durum:</span>
                  {detailModal.data.is_deleted ? (
                    <span className='px-2 py-1 rounded bg-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest'>Silinmiş</span>
                  ) : (
                    <span className='px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest'>Aktif</span>
                  )}
                </div>
                {detailModal.type === 'post' && !detailModal.data.is_deleted && (
                  <Link href={`/sosyal?post=${detailModal.data.id}`} target="_blank" className='text-[10px] font-black text-cyan-400 hover:text-cyan-300 uppercase tracking-widest bg-cyan-500/10 px-3 py-1.5 rounded-lg'>
                    Public Önizleme ↗
                  </Link>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
