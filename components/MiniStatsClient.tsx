'use client';

import { useState } from 'react';
import Link from 'next/link';

export function MiniStatsClient({
  topScorers,
  topAssisters,
  cleanSheetPlayers,
  topRatedPlayers = []
}: {
  topScorers: any[],
  topAssisters: any[],
  cleanSheetPlayers: any[],
  topRatedPlayers?: any[]
}) {
  const [activeTab, setActiveTab] = useState<'gol' | 'asist' | 'cleansheet' | 'rating'>('gol');

  const renderList = (players: any[], valueKey: string) => (
    <div className="divide-y divide-white/5">
      {players && players.length > 0 ? players.map((player, idx) => (
        <div key={idx} className="flex items-center justify-between p-4 hover:bg-[#00E5FF]/5 hover:shadow-[inset_4px_0_0_#00E5FF] transition-colors">
          <div className="flex items-center gap-4">
            <span className={`text-[24px] font-[900] w-8 text-center ${idx === 0 ? 'text-[#00e5ff]' : 'text-gray-600'}`}>
              {idx + 1}
            </span>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#0a1628] border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                {player.teamLogo ? <img src={player.teamLogo} alt="" className="w-full h-full object-cover" /> : <span className="text-xs font-black text-[#00e5ff]">{player.teamName.charAt(0)}</span>}
              </div>
              <div>
                <div className="text-[16px] font-[800] text-white tracking-wide">{player.playerName}</div>
                <div className="data-label truncate max-w-[120px]">{player.teamName}</div>
              </div>
            </div>
          </div>
          <div className="data-value text-[24px] text-[#00E5FF]">{player[valueKey]}</div>
        </div>
      )) : (
        <div className="empty-state !py-12"><span className="empty-state-title text-[18px]">Veri Yok</span></div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-[28px] font-[800] tracking-wide text-white">MİNİ İSTATİSTİKLER</h2>
      
      <div className="client-glass rounded-xl overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-white/5">
          <button
            onClick={() => setActiveTab('gol')}
            className={`flex-1 py-3 text-[11px] sm:text-[13px] font-[800] tracking-widest uppercase transition-colors ${activeTab === 'gol' ? 'text-[#00e5ff] border-b-2 border-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            GOL
          </button>
          <button
            onClick={() => setActiveTab('asist')}
            className={`flex-1 py-3 text-[11px] sm:text-[13px] font-[800] tracking-widest uppercase transition-colors ${activeTab === 'asist' ? 'text-[#00e5ff] border-b-2 border-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            ASİST
          </button>
          <button
            onClick={() => setActiveTab('cleansheet')}
            className={`flex-1 py-3 text-[11px] sm:text-[13px] font-[800] tracking-widest uppercase transition-colors ${activeTab === 'cleansheet' ? 'text-[#00e5ff] border-b-2 border-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            CLEAN SHEET
          </button>
          <button
            onClick={() => setActiveTab('rating')}
            className={`flex-1 py-3 text-[11px] sm:text-[13px] font-[800] tracking-widest uppercase transition-colors ${activeTab === 'rating' ? 'text-[#00e5ff] border-b-2 border-[#00E5FF] drop-shadow-[0_0_8px_rgba(0,229,255,0.4)]' : 'text-gray-500 hover:text-gray-300'}`}
          >
            ORT. REYTİNG
          </button>
        </div>

        {/* Content */}
        <div className="p-0">
          {activeTab === 'gol' && renderList(topScorers, 'goals')}
          {activeTab === 'asist' && renderList(topAssisters, 'assists')}
          {activeTab === 'cleansheet' && renderList(cleanSheetPlayers, 'cleanSheets')}
          {activeTab === 'rating' && renderList(topRatedPlayers, 'ratingFormatted')}
        </div>
        
        {/* Footer Link */}
        
      </div>
    </div>
  );
}
