'use client';

import { useTransition, useState } from 'react';
import { kickPlayerAction } from './actions';

export function RosterManagement({ 
  memberships, 
  seasonId, 
  isWindowOpen,
  captainId
}: { 
  memberships: any[], 
  seasonId: string, 
  isWindowOpen: boolean,
  captainId: string
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  const handleKick = (playerId: string) => {
    if (!confirm('Bu oyuncuyu takımdan çıkarmak istediğinize emin misiniz?')) return;
    
    startTransition(async () => {
      const formData = new FormData();
      formData.append('playerId', playerId);
      formData.append('seasonId', seasonId);
      
      const res = await kickPlayerAction(formData);
      if (res?.error) {
        setMessage(res.error);
      } else {
        setMessage('Oyuncu takımdan çıkarıldı.');
      }
    });
  };

  return (
    <div className="card-surface p-6 rounded-xl border border-white/5 space-y-4">
      <h3 className="text-lg font-black text-white tracking-widest">KADRO</h3>
      
      {message && (
        <div className="p-3 bg-[#00e5ff]/10 border border-[#00e5ff]/30 rounded text-sm text-[#00e5ff] font-bold">
          {message}
        </div>
      )}

      <div className="space-y-2">
        {memberships.map((mem) => {
          const profile = mem.profiles;
          const isCaptain = profile.id === captainId;
          // In a real app we'd also check if they are another captain, but for now we rely on DB throwing if we kick a captain.
          
          return (
            <div key={mem.id} className="flex items-center justify-between p-3 bg-[#060d18] border border-white/5 rounded-lg">
              <div className="flex items-center gap-3">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#0a1628] flex items-center justify-center text-xs font-bold text-gray-500">
                    {profile.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-bold text-white text-sm flex items-center gap-2">
                    {profile.username}
                    {isCaptain && <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-500 text-[9px] rounded uppercase tracking-wider">Kaptan</span>}
                  </div>
                  <div className="text-[10px] font-medium text-gray-400 flex items-center gap-2">
                    <span>EA ID: {profile.current_ea_player_id || '-'}</span>
                    <span>•</span>
                    <span>Katılım: {new Date(mem.joined_at).toLocaleDateString('tr-TR')}</span>
                  </div>
                </div>
              </div>
              
              {!isCaptain && isWindowOpen && (
                <button 
                  onClick={() => handleKick(profile.id)}
                  disabled={isPending}
                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded text-xs font-bold tracking-widest transition-colors disabled:opacity-50"
                >
                  KICK
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
