'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toggleLikeAction, deletePostAction, createCommentAction, deleteCommentAction } from './actions';

function timeAgo(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa`;
  return `${Math.floor(hours / 24)} gün`;
}

interface PostItemProps {
  post: any;
  currentUser: any;
  onDeletePost?: (postId: string) => void;
}

export function PostItem({ post, currentUser, onDeletePost }: PostItemProps) {
  const router = useRouter();

  // Likes state
  const initialHasLiked = Boolean(currentUser && post.likes?.some((l: any) => l.user_id === currentUser.id));
  const initialLikeCount = post.likes?.length || 0;

  const [hasLiked, setHasLiked] = useState<boolean>(initialHasLiked);
  const [likeCount, setLikeCount] = useState<number>(initialLikeCount);
  const [isLiking, setIsLiking] = useState<boolean>(false);

  // Comments state
  const [showComments, setShowComments] = useState<boolean>(false);
  const [comments, setComments] = useState<any[]>(post.comments || []);
  const [commentCount, setCommentCount] = useState<number>(post.comments?.length || 0);
  const [commentText, setCommentText] = useState<string>('');
  const [isSubmittingComment, setIsSubmittingComment] = useState<boolean>(false);
  const [commentError, setCommentError] = useState<string>('');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  // Post delete state
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteError, setDeleteError] = useState<string>('');

  const isAuthor = Boolean(currentUser && post.author?.id === currentUser.id);

  // Sync state if post prop changes (e.g. tab change or pagination)
  useEffect(() => {
    setHasLiked(Boolean(currentUser && post.likes?.some((l: any) => l.user_id === currentUser.id)));
    setLikeCount(post.likes?.length || 0);
  }, [post.id, post.likes, currentUser]);

  useEffect(() => {
    setComments(post.comments || []);
    setCommentCount(post.comments?.length || 0);
  }, [post.id, post.comments]);

  // Handle Like Toggle with Optimistic UI & Rollback
  const handleLike = async () => {
    if (!currentUser || isLiking) return;
    setIsLiking(true);

    const prevHasLiked = hasLiked;
    const prevLikeCount = likeCount;

    // Optimistic UI update
    const nextHasLiked = !prevHasLiked;
    const nextLikeCount = nextHasLiked ? prevLikeCount + 1 : Math.max(0, prevLikeCount - 1);

    setHasLiked(nextHasLiked);
    setLikeCount(nextLikeCount);

    try {
      const res = await toggleLikeAction(post.id);
      if (res?.error) {
        // Rollback on server error
        setHasLiked(prevHasLiked);
        setLikeCount(prevLikeCount);
      } else if (typeof res?.liked === 'boolean') {
        // Sync with verified server outcome
        setHasLiked(res.liked);
        router.refresh();
      }
    } catch {
      // Rollback on network failure
      setHasLiked(prevHasLiked);
      setLikeCount(prevLikeCount);
    } finally {
      setIsLiking(false);
    }
  };

  // Handle Comment Submission without Page Reload
  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || isSubmittingComment) return;

    const trimmed = commentText.trim();
    if (!trimmed) return;

    setIsSubmittingComment(true);
    setCommentError('');

    try {
      const res = await createCommentAction(post.id, trimmed);
      if (res?.error) {
        setCommentError(res.error);
        // Note: commentText is intentionally kept on error so user doesn't lose their input
      } else if (res?.comment) {
        // Clear input on success
        setCommentText('');
        // Add newly created comment directly to current list
        setComments((prev) => [...prev, res.comment]);
        setCommentCount((prev) => prev + 1);
        setShowComments(true);
        router.refresh();
      }
    } catch (err: any) {
      setCommentError(err?.message || 'Yorum gönderilirken bir sorun oluştu.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Handle Delete Comment without Page Reload
  const handleDeleteComment = async (commentId: string) => {
    if (deletingCommentId) return;
    if (!confirm('Yorumu silmek istediğinize emin misiniz?')) return;
    setDeletingCommentId(commentId);

    try {
      const res = await deleteCommentAction(commentId);
      if (res?.error) {
        alert('Yorum silinemedi: ' + res.error);
      } else {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        setCommentCount((prev) => Math.max(0, prev - 1));
        router.refresh();
      }
    } catch {
      alert('Yorum silinirken hata oluştu.');
    } finally {
      setDeletingCommentId(null);
    }
  };

  // Handle Delete Post
  const handleDelete = async () => {
    if (!confirm('Bu gönderiyi kalıcı olarak silmek istediğinize emin misiniz?')) return;
    setIsDeleting(true);
    setDeleteError('');
    const res = await deletePostAction(post.id);
    if (res?.error) {
      setDeleteError(res.error);
      setIsDeleting(false);
    } else {
      onDeletePost?.(post.id);
      router.refresh();
    }
  };

  return (
    <div id={`post-${post.id}`} className="client-glass p-5 md:p-6 rounded-xl border border-white/5 bg-[#01060b] hover:border-white/10 transition-colors shadow-[0_4px_20px_rgba(0,0,0,0.3)] min-w-0">
      {deleteError && (
        <div className="mb-4 text-[12px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 p-2 rounded-lg">
          {deleteError}
        </div>
      )}

      {/* HEADER */}
      <div className="flex justify-between items-start mb-3">
        <Link href={`/oyuncular/${post.author?.username}`} className="flex items-center gap-3 group min-w-0 flex-1">
          <div className="w-10 h-10 md:w-11 md:h-11 rounded-full overflow-hidden bg-black border border-white/10 shrink-0 group-hover:border-[#00e5ff]/50 transition-colors shadow-sm">
            {post.author?.avatar_url ? (
              <img src={post.author.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-[#00e5ff] text-[14px]">
                {post.author?.username?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-[800] text-white text-[14px] group-hover:text-[#00e5ff] transition-colors truncate">
                {post.author?.username}
              </h3>
              {post.author?.primary_position && (
                <span className="px-1.5 py-0.5 rounded bg-[#00e5ff]/10 border border-[#00e5ff]/20 text-[9px] font-[900] tracking-widest text-[#00e5ff] uppercase shrink-0">
                  {post.author.primary_position}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
              {post.author?.full_name && (
                <span className="text-gray-400 font-medium truncate uppercase tracking-wide">
                  {post.author.full_name}
                </span>
              )}
              {post.author?.full_name && <span className="text-gray-600 font-black">·</span>}
              <span className="text-gray-500 font-bold uppercase tracking-widest block">
                {timeAgo(post.created_at)}
              </span>
            </div>
          </div>
        </Link>

        {isAuthor && (
          <button 
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-[10px] text-gray-600 hover:text-red-400 font-bold tracking-widest p-2 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 shrink-0 ml-2"
            title="Gönderiyi Sil"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
          </button>
        )}
      </div>

      {/* CONTENT */}
      <div className="pl-0 md:pl-14">
        <p className="text-gray-200 text-[14px] md:text-[15px] leading-relaxed break-words whitespace-pre-wrap mb-4">
          {post.content}
        </p>

        {/* ACTIONS */}
        <div className="flex items-center gap-6 border-t border-white/5 pt-3">
          <button 
            onClick={handleLike}
            disabled={!currentUser || isLiking}
            className={`flex items-center gap-2 text-[12px] font-bold tracking-widest transition-colors group ${hasLiked ? 'text-pink-500' : 'text-gray-500 hover:text-pink-400'} disabled:opacity-75`}
            title={!currentUser ? 'Beğenmek için giriş yapın' : (hasLiked ? 'Beğeniyi geri al' : 'Beğen')}
          >
            <div className={`p-2 rounded-lg transition-colors ${hasLiked ? 'bg-pink-500/10' : 'group-hover:bg-pink-500/10'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={hasLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>
            </div>
            {likeCount > 0 ? likeCount : ''}
          </button>

          <button 
            onClick={() => setShowComments(!showComments)}
            className={`flex items-center gap-2 text-[12px] font-bold tracking-widest transition-colors group ${showComments ? 'text-[#00e5ff]' : 'text-gray-500 hover:text-[#00e5ff]'}`}
          >
            <div className={`p-2 rounded-lg transition-colors ${showComments ? 'bg-[#00e5ff]/10' : 'group-hover:bg-[#00e5ff]/10'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={showComments ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
            </div>
            {commentCount > 0 ? commentCount : ''}
          </button>

          <button 
            className="flex items-center gap-2 text-[12px] font-bold tracking-widest transition-colors group text-gray-500 hover:text-emerald-400"
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: `${post.author?.username} Gönderisi`, url: `${window.location.origin}/sosyal#post-${post.id}` });
              } else {
                navigator.clipboard.writeText(`${window.location.origin}/sosyal#post-${post.id}`);
                alert('Gönderi bağlantısı kopyalandı.');
              }
            }}
          >
            <div className="p-2 rounded-lg transition-colors group-hover:bg-emerald-400/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" x2="12" y1="2" y2="15"></line></svg>
            </div>
          </button>
        </div>

        {/* COMMENTS SECTION */}
        {showComments && (
          <div className="mt-4 pt-4 border-t border-white/5 space-y-4">
            
            {/* New Comment Input */}
            {currentUser ? (
              <div className="space-y-2">
                {commentError && (
                  <div className="text-[12px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 p-2 rounded-lg">
                    {commentError}
                  </div>
                )}
                <form onSubmit={handleCommentSubmit} className="flex gap-3">
                  <input
                    type="text"
                    name="content"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    disabled={isSubmittingComment}
                    required
                    placeholder="Yorum yaz..."
                    className="flex-1 bg-[#03070c] border border-white/10 rounded-lg px-4 py-2.5 text-[13px] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors disabled:opacity-50"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingComment || commentText.trim().length === 0}
                    className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-[11px] font-[900] text-white hover:bg-white hover:text-black uppercase tracking-widest transition-colors shrink-0 disabled:opacity-50 disabled:hover:bg-white/5 disabled:hover:text-white flex items-center gap-2"
                  >
                    {isSubmittingComment ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        GÖNDERİLİYOR...
                      </>
                    ) : (
                      'GÖNDER'
                    )}
                  </button>
                </form>
              </div>
            ) : (
              <p className="text-[11px] text-gray-500 italic uppercase tracking-widest">Yorum yapmak için giriş yapın.</p>
            )}

            {/* Comments List */}
            <div className="space-y-3 mt-4">
              {comments.map((comment: any) => (
                <div key={comment.id} className="flex items-start gap-3 group/comment bg-white/[0.02] p-3 rounded-lg border border-white/5">
                  <Link href={`/oyuncular/${comment.author?.username}`} className="shrink-0">
                    {comment.author?.avatar_url ? (
                      <img src={comment.author.avatar_url} alt="" className="w-8 h-8 rounded-full border border-white/10 object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#0a1628] border border-white/10 flex items-center justify-center font-bold text-[10px] text-[#00e5ff]">
                        {comment.author?.username?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/oyuncular/${comment.author?.username}`} className="font-bold text-white text-[12px] hover:text-[#00e5ff] transition-colors truncate">
                        {comment.author?.username}
                      </Link>
                      <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest shrink-0">
                        {timeAgo(comment.created_at)}
                      </span>
                    </div>
                    <p className="text-gray-300 text-[13px] mt-0.5 break-words whitespace-pre-wrap">{comment.content}</p>
                  </div>
                  {currentUser && comment.author?.id === currentUser.id && (
                    <button
                      type="button"
                      onClick={() => handleDeleteComment(comment.id)}
                      disabled={deletingCommentId === comment.id}
                      className="opacity-0 group-hover/comment:opacity-100 transition-opacity text-gray-500 hover:text-red-400 p-1 disabled:opacity-50"
                      title="Sil"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
