'use client';

import { useActionState, useState } from 'react';
import { createPostAction } from './actions';

export function PostForm({ userProfile }: { userProfile?: any }) {
  const [state, formAction] = useActionState(createPostAction as any, { error: '', success: '' } as any);
  const [isPending, setIsPending] = useState(false);
  const [content, setContent] = useState('');

  return (
    <div className="client-glass p-5 md:p-6 rounded-xl border border-white/5 bg-[#01060b] shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
      <form 
        action={(fd: FormData) => {
          setIsPending(true);
          (formAction as any)(fd);
          setTimeout(() => {
            setIsPending(false);
            if (!state?.error) setContent('');
          }, 500);
        }}
      >
        {state?.error && (
          <div className="mb-4 text-[12px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 p-3 rounded-lg">
            {state.error}
          </div>
        )}
        
        <div className="flex gap-4 items-start">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden bg-black border border-white/10 shrink-0">
            {userProfile?.avatar_url ? (
              <img src={userProfile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[14px] font-bold text-[#00e5ff]">
                {userProfile?.username?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <textarea
              name="content"
              required
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Toplulukla bir şeyler paylaş..."
              className="w-full bg-transparent text-[14px] md:text-[15px] text-white placeholder:text-gray-500 focus:outline-none resize-none min-h-[50px]"
            />
            
            <div className="mt-2 pt-3 border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-500">
                <button type="button" className="p-2 hover:bg-white/5 rounded-lg hover:text-[#00e5ff] transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path></svg>
                </button>
              </div>
              
              <button
                type="submit"
                disabled={isPending || content.trim().length === 0}
                className="px-5 py-2 bg-[#00e5ff] text-black font-[900] tracking-widest text-[11px] uppercase rounded-xl hover:bg-white transition-colors disabled:opacity-50 disabled:hover:bg-[#00e5ff] shadow-[0_0_15px_rgba(0,229,255,0.2)]"
              >
                {isPending ? 'PAYLAŞILIYOR...' : 'PAYLAŞ'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
