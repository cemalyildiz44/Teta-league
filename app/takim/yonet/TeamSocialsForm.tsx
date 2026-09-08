'use client';

import { useState, useTransition } from 'react';
import { updateTeamSocialsAction } from './actions';

interface Props {
  teamId: string;
  initialStreamUrl?: string | null;
  initialInstagramUrl?: string | null;
}

export function TeamSocialsForm({ teamId, initialStreamUrl, initialInstagramUrl }: Props) {
  const [streamUrl, setStreamUrl] = useState(initialStreamUrl || '');
  const [instagramUrl, setInstagramUrl] = useState(initialInstagramUrl || '');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);

    const formData = new FormData();
    formData.append('teamId', teamId);
    formData.append('stream_url', streamUrl);
    formData.append('instagram_url', instagramUrl);

    startTransition(async () => {
      const res = await updateTeamSocialsAction(formData);
      if (res?.error) {
        setMessage({ type: 'error', text: res.error });
      } else {
        setMessage({ type: 'success', text: 'Takım sosyal bağlantıları başarıyla güncellendi.' });
      }
    });
  };

  return (
    <div className="card-surface p-6 rounded-2xl border border-white/5 relative overflow-hidden">
      <div className="flex items-center gap-3 mb-6">
        <span className="w-1.5 h-6 bg-[#00e5ff] rounded-full inline-block" />
        <div>
          <h3 className="text-[14px] font-[900] text-white tracking-widest uppercase">
            SOSYAL MEDYA & YAYIN BAĞLANTILARI
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Takım profilinde görünecek canlı yayın ve sosyal medya linklerini buradan yönetin.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
            Yayın Kanalı Linki (Twitch / Kick / YouTube vb.)
          </label>
          <div className="relative">
            <input
              type="url"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              placeholder="https://twitch.tv/... veya https://kick.com/..."
              className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all text-xs placeholder:text-gray-600"
            />
          </div>
          <span className="text-[10px] text-gray-500 mt-1 block">
            Örnek: https://kick.com/takimadi veya https://twitch.tv/takimadi
          </span>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
            Instagram Profili Linki
          </label>
          <div className="relative">
            <input
              type="url"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              placeholder="https://instagram.com/..."
              className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all text-xs placeholder:text-gray-600"
            />
          </div>
          <span className="text-[10px] text-gray-500 mt-1 block">
            Örnek: https://instagram.com/takimadi
          </span>
        </div>

        {message && (
          <div
            className={`p-3 rounded-lg text-xs font-bold text-center ${
              message.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="px-6 py-2.5 bg-[#00e5ff] hover:bg-[#00b8d4] text-black text-xs font-black rounded-lg transition-all tracking-wider disabled:opacity-50 shadow-[0_0_15px_rgba(0,229,255,0.2)]"
          >
            {isPending ? 'KAYDEDİLİYOR...' : 'BAĞLANTILARI KAYDET'}
          </button>
        </div>
      </form>
    </div>
  );
}
