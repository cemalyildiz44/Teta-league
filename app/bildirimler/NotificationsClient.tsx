'use client';

import { useState } from 'react';
import { markNotificationReadAction } from '@/app/profil/team-actions';
import { acceptTeamInviteAction, rejectTeamInviteAction } from '@/app/profil/team-actions';

export default function NotificationsClient({ notifications }: { notifications: any[] }) {
  const [localNotifs, setLocalNotifs] = useState(notifications);
  const [resolving, setResolving] = useState<string | null>(null);

  const handleMarkRead = async (id: string, isRead: boolean) => {
    if (isRead) return;
    setLocalNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    await markNotificationReadAction(id);
  };

  const handleAccept = async (e: React.MouseEvent, transferId: string, notifId: string) => {
    e.stopPropagation();
    if (!confirm('Bu daveti kabul etmek ve takıma katılmak istiyor musun?')) return;
    setResolving(transferId);
    const res = await acceptTeamInviteAction(transferId);
    if (res?.error) alert(res.error);
    else if (res?.success) {
      alert(res.success);
      setLocalNotifs(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true, transfer: { ...n.transfer, status: 'APPROVED' } } : n));
    }
    setResolving(null);
  };

  const handleReject = async (e: React.MouseEvent, transferId: string, notifId: string) => {
    e.stopPropagation();
    if (!confirm('Bu daveti reddetmek istediğine emin misin?')) return;
    setResolving(transferId);
    const res = await rejectTeamInviteAction(transferId);
    if (res?.error) alert(res.error);
    else if (res?.success) {
      alert(res.success);
      setLocalNotifs(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true, transfer: { ...n.transfer, status: 'REJECTED' } } : n));
    }
    setResolving(null);
  };

  if (localNotifs.length === 0) {
    return (
      <div className="bg-[#03070c] border border-white/5 rounded-2xl p-8 text-center">
        <div className="text-[14px] font-[700] text-gray-500 uppercase tracking-widest">Henüz bildirimin bulunmuyor.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {localNotifs.map(n => {
        const isTransferOffer = n.type === 'TRANSFER_OFFER' && n.transfer;
        const isPendingTransfer = isTransferOffer && n.transfer.status === 'PENDING_PLAYER';

        return (
          <div 
            key={n.id} 
            onClick={() => handleMarkRead(n.id, n.is_read)}
            className={`cursor-pointer transition-all border p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${n.is_read ? 'bg-[#03070c] border-white/5 opacity-70 hover:opacity-100' : 'bg-white/5 border-white/10 shadow-[0_0_15px_rgba(255,255,255,0.03)]'}`}
          >
            <div className="flex items-start gap-4">
              {!n.is_read && <div className="w-2 h-2 rounded-full bg-[#00e5ff] mt-2 shrink-0 animate-pulse"></div>}
              <div>
                <h3 className={`text-[14px] font-[900] tracking-widest uppercase mb-1 ${!n.is_read ? 'text-white' : 'text-gray-400'}`}>
                  {n.title}
                </h3>
                <p className="text-[12px] font-[700] text-gray-500">{n.body}</p>
                <div className="text-[10px] font-[900] text-gray-600 tracking-widest uppercase mt-3">
                  {new Date(n.created_at).toLocaleDateString('tr-TR')} • {new Date(n.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {isPendingTransfer && (
              <div className="flex gap-2 shrink-0">
                <button 
                  onClick={(e) => handleAccept(e, n.reference_id, n.id)}
                  disabled={resolving === n.reference_id}
                  className="px-6 py-2.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 text-[10px] font-[900] tracking-widest uppercase rounded-xl transition-colors disabled:opacity-50"
                >
                  {resolving === n.reference_id ? '...' : 'KABUL ET'}
                </button>
                <button 
                  onClick={(e) => handleReject(e, n.reference_id, n.id)}
                  disabled={resolving === n.reference_id}
                  className="px-6 py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-[10px] font-[900] tracking-widest uppercase rounded-xl transition-colors disabled:opacity-50"
                >
                  {resolving === n.reference_id ? '...' : 'REDDET'}
                </button>
              </div>
            )}
            
            {isTransferOffer && !isPendingTransfer && (
              <div className="px-4 py-2 bg-white/5 border border-white/10 text-gray-400 text-[10px] font-[900] tracking-widest uppercase rounded-lg">
                YANTLANDI ({n.transfer.status})
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
