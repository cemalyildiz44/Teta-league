'use client';

import { useState, useTransition } from 'react';
import { searchPlayers, invitePlayer } from './actions';

export function PlayerSearch({ 
  teamId, 
  seasonId, 
  transferWindowId, 
  isWindowOpen 
}: { 
  teamId: string, 
  seasonId: string, 
  transferWindowId: string | null,
  isWindowOpen: boolean 
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length >= 3) {
      startTransition(async () => {
        const res = await searchPlayers(val, seasonId);
        setResults(res);
      });
    } else {
      setResults([]);
    }
  };

  const handleInvite = async (playerId: string) => {
    if (!transferWindowId) return;
    
    const formData = new FormData();
    formData.append('playerId', playerId);
    formData.append('teamId', teamId);
    formData.append('seasonId', seasonId);
    formData.append('transferWindowId', transferWindowId);

    const res = await invitePlayer(formData);
    if (res?.error) {
      setMessage(res.error);
    } else {
      setMessage('Transfer teklifi başarıyla gönderildi.');
      setQuery('');
      setResults([]);
    }
  };

  if (!isWindowOpen) {
    return (
      <div className="card-surface p-6 rounded-xl border border-white/5 text-center">
        <span className="text-gray-400 font-medium text-sm italic">Transfer penceresi şu anda kapalı. Yeni oyuncu davet edemezsiniz.</span>
      </div>
    );
  }

  return (
    <div className="card-surface p-6 rounded-xl border border-white/5 space-y-4">
      <h3 className="text-lg font-black text-white tracking-widest">OYUNCU DAVET ET</h3>
      
      {message && (
        <div className="p-3 bg-[#00e5ff]/10 border border-[#00e5ff]/30 rounded text-sm text-[#00e5ff] font-bold">
          {message}
        </div>
      )}

      <div className="relative">
        <input 
          type="text" 
          value={query}
          onChange={handleSearch}
          placeholder="Oyuncu adı veya EA ID ile ara (min 3 harf)..."
          className="w-full bg-[#0d1a2d] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
        />
        {isPending && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {results.map((player) => (
            <div key={player.id} className="flex items-center justify-between p-3 bg-[#060d18] border border-white/5 rounded-lg hover:border-[#00e5ff]/30 transition-colors">
              <div className="flex items-center gap-3">
                {player.avatar_url ? (
                  <img src={player.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#0a1628] flex items-center justify-center text-xs font-bold text-gray-500">
                    {player.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-bold text-white text-sm">{player.username}</div>
                  <div className="text-[10px] font-medium text-gray-400 flex items-center gap-2">
                    <span className="text-[#00e5ff]">{player.current_ea_player_id || 'EA ID Yok'}</span>
                    <span>•</span>
                    <span>{player.team_name}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleInvite(player.id)}
                className="px-4 py-1.5 bg-[#00e5ff]/10 hover:bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30 rounded text-xs font-bold tracking-widest transition-colors"
              >
                DAVET ET
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
