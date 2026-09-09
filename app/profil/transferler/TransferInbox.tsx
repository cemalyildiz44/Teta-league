'use client';

import { useTransition, useState } from 'react';
import { respondToTransfer } from './actions';
import TeamLogo from '@/components/TeamLogo';

export function TransferInbox({ transfers }: { transfers: any[] }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  const handleResponse = (transferId: string, accept: boolean) => {
    if (!confirm(accept ? 'Teklifi kabul etmek istiyor musunuz?' : 'Teklifi reddetmek istiyor musunuz?')) return;
    
    startTransition(async () => {
      const formData = new FormData();
      formData.append('transferId', transferId);
      formData.append('accept', accept.toString());
      
      const res = await respondToTransfer(formData);
      if (res?.error) {
        setMessage(res.error);
      } else {
        setMessage(accept ? 'Teklif kabul edildi. Yönetici onayı bekleniyor.' : 'Teklif reddedildi.');
      }
    });
  };

  const getStatusMessage = (status: string) => {
    switch(status) {
      case 'PENDING_ADMIN': return <span className="text-purple-500 font-bold text-sm">Transfer kabul edildi, yönetici onayı bekleniyor.</span>;
      case 'APPROVED': return <span className="text-green-500 font-bold text-sm">Transfer tamamlandı.</span>;
      case 'REJECTED': return <span className="text-red-500 font-bold text-sm">Teklif reddedildi.</span>;
      case 'CANCELLED': return <span className="text-gray-500 font-bold text-sm">Teklif iptal edildi.</span>;
      default: return null;
    }
  };

  if (transfers.length === 0) {
    return (
      <div className="card-surface rounded-xl p-8 text-center border border-white/5">
        <span className="text-gray-500 font-medium italic">Gelen transfer teklifi bulunmuyor.</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {message && (
        <div className="p-3 bg-[#00e5ff]/10 border border-[#00e5ff]/30 rounded text-sm text-[#00e5ff] font-bold">
          {message}
        </div>
      )}

      {transfers.map((tx) => {
        const txTeam = Array.isArray(tx.teams) ? tx.teams[0] : tx.teams;
        const txSeason = Array.isArray(tx.seasons) ? tx.seasons[0] : tx.seasons;
        return (
        <div key={tx.id} className="card-surface p-6 rounded-xl border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <TeamLogo src={(txTeam as any)?.logo_url} name={(txTeam as any)?.name} size="xl" className="w-16 h-16" />
            
            <div>
              <h4 className="text-xl font-black text-white">{(txTeam as any)?.name}</h4>
              <div className="text-xs font-medium text-gray-400 mt-1 flex items-center gap-2">
                <span className="text-[#00e5ff]">{(txSeason as any)?.name}</span>
                <span>•</span>
                <span>{new Date(tx.created_at).toLocaleDateString('tr-TR')}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {tx.status === 'PENDING_PLAYER' ? (
              <>
                <button
                  onClick={() => handleResponse(tx.id, false)}
                  disabled={isPending}
                  className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded font-bold text-xs tracking-widest transition-colors disabled:opacity-50"
                >
                  REDDET
                </button>
                <button
                  onClick={() => handleResponse(tx.id, true)}
                  disabled={isPending}
                  className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/30 rounded font-bold text-xs tracking-widest transition-colors disabled:opacity-50"
                >
                  KABUL ET
                </button>
              </>
            ) : (
              getStatusMessage(tx.status)
            )}
          </div>
        </div>
      )})}
    </div>
  );
}
