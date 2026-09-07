'use client';

import { useTransition, useState } from 'react';
import { leaveTeamAction } from './actions';

export function LeaveTeamButton({ seasonId, isWindowOpen }: { seasonId: string, isWindowOpen: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  const handleLeave = () => {
    if (!confirm('Takımdan ayrılmak istediğinize emin misiniz? Bu işlem geri alınamaz.')) return;
    
    startTransition(async () => {
      const formData = new FormData();
      formData.append('seasonId', seasonId);
      
      const res = await leaveTeamAction(formData);
      if (res?.error) {
        setMessage(res.error);
      }
    });
  };

  return (
    <div className="mt-6 border-t border-white/5 pt-6">
      {message && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-500 font-bold">
          {message}
        </div>
      )}
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0a1628] p-4 rounded-lg border border-white/5">
        <div>
          <h4 className="text-sm font-bold text-white mb-1">Takımdan Ayrıl</h4>
          <p className="text-xs text-gray-400 font-medium">Aktif takımdan ayrılarak Free Agent (Serbest Oyuncu) statüsüne geçersiniz.</p>
        </div>
        
        {isWindowOpen ? (
          <button
            onClick={handleLeave}
            disabled={isPending}
            className="px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded text-xs font-black tracking-widest transition-colors disabled:opacity-50 shrink-0"
          >
            {isPending ? 'İŞLENİYOR...' : 'AYRIL'}
          </button>
        ) : (
          <div className="text-xs font-bold text-red-500 px-3 py-1.5 bg-red-500/10 rounded border border-red-500/20">
            TRANSFER PENCERESİ KAPALI
          </div>
        )}
      </div>
    </div>
  );
}
