'use client';

import { useActionState } from 'react';
import { updateProfileAction } from '@/app/profil/actions';

export default function ProfileForm({ profile }: { profile: any }) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, null);

  return (
    <div className="client-glass p-6 lg:p-10 rounded-2xl border border-white/5 relative overflow-hidden">
      {/* Decorative Glow */}
      

      <form action={formAction} className="relative z-10 space-y-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Kullanıcı Adı */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Kullanıcı Adı
            </label>
            <input
              type="text"
              name="username"
              defaultValue={profile.username}
              required
              className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all text-sm"
            />
          </div>

          {/* Ad Soyad */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Ad Soyad (Opsiyonel)
            </label>
            <input
              type="text"
              name="full_name"
              defaultValue={profile.full_name || ''}
              className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all text-sm"
            />
          </div>

          {/* EA ID */}
          <div className="md:col-span-2 p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center justify-between mb-4">
              <label className="block text-[13px] font-[700] text-emerald-400 uppercase tracking-widest">
                EA OYUNCU ADI / ID
              </label>
              {profile.current_ea_player_id ? (
                <span className="flex items-center gap-1 text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded uppercase tracking-widest">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  EA Hesabı Bağlı
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-black text-gray-500 bg-white/5 px-2 py-1 rounded uppercase tracking-widest">
                  <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                  EA Hesabı Bağlı Değil
                </span>
              )}
            </div>
            
            <input
              type="text"
              name="current_ea_player_id"
              defaultValue={profile.current_ea_player_id || ''}
              className="w-full bg-[#060d18] border border-emerald-500/30 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all text-[15px] font-[700] tracking-wider"
              placeholder="Örn: Mr_Ssv96"
            />
            <p className="text-[11px] text-gray-400 mt-2 font-medium">
              EA hesabınızdaki oyuncu adını tam olarak girin. Örnek: <strong className="text-white">Mr_Ssv96</strong><br/>
              <span className="text-gray-500">Bu alan kesinlikle sayısal bir ID değildir, oyundaki görünen EA profil adınızdır.</span>
            </p>
          </div>

          {/* Platform */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Platform
            </label>
            <select
              name="platform"
              defaultValue={profile.platform || 'common-gen5'}
              className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all text-sm appearance-none"
            >
              <option value="common-gen5">Yeni Nesil (PS5 / Xbox Series / PC)</option>
              <option value="ps4">PS4</option>
              <option value="xbox-one">Xbox One</option>
            </select>
          </div>

          {/* Ana Pozisyon */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Ana Mevki
            </label>
            <select
              name="primary_position"
              defaultValue={profile.primary_position || ''}
              className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all text-sm appearance-none"
            >
              <option value="">Seçiniz</option>
              <option value="GK">GK (Kaleci)</option>
              <option value="CB">CB (Stoper)</option>
              <option value="LB">LB (Sol Bek)</option>
              <option value="RB">RB (Sağ Bek)</option>
              <option value="CDM">CDM (Defansif Orta Saha)</option>
              <option value="CM">CM (Merkez Orta Saha)</option>
              <option value="CAM">CAM (Ofansif Orta Saha)</option>
              <option value="LM">LM (Sol Kanat)</option>
              <option value="RM">RM (Sağ Kanat)</option>
              <option value="LW">LW (Sol Açık)</option>
              <option value="RW">RW (Sağ Açık)</option>
              <option value="ST">ST (Santrafor)</option>
            </select>
          </div>

          {/* Avatar URL */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Profil Fotoğrafı URL (Opsiyonel)
            </label>
            <input
              type="url"
              name="avatar_url"
              defaultValue={profile.avatar_url || ''}
              className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all text-sm placeholder:text-gray-600"
              placeholder="https://..."
            />
          </div>
        </div>

        {/* Biyografi */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Hakkımda (Biyografi)
          </label>
          <textarea
            name="bio"
            defaultValue={profile.bio || ''}
            rows={3}
            maxLength={300}
            className="w-full bg-[#060d18] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all text-sm resize-none"
            placeholder="Kendinden bahset..."
          />
        </div>

        {/* Sosyal Medya */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Twitter Kullanıcı Adı
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3 text-gray-500">@</span>
              <input
                type="text"
                name="twitter"
                defaultValue={profile.social_links?.twitter || ''}
                className="w-full bg-[#060d18] border border-white/10 rounded-lg pl-9 pr-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              Twitch Kanalı
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3 text-gray-500">twitch.tv/</span>
              <input
                type="text"
                name="twitch"
                defaultValue={profile.social_links?.twitch || ''}
                className="w-full bg-[#060d18] border border-white/10 rounded-lg pl-24 pr-4 py-3 text-white focus:outline-none focus:border-[#00e5ff]/50 focus:ring-1 focus:ring-[#00e5ff]/50 transition-all text-sm"
              />
            </div>
          </div>
        </div>

        {/* Messages */}
        {state?.error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-center text-[13px] font-[700] text-red-500">
            {state.error}
          </div>
        )}
        {state?.success && (
          <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-3 text-center text-[13px] font-[700] text-emerald-500">
            {state.success}
          </div>
        )}

        {/* Submit */}
        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="flat-button flat-button-solid px-8 py-4 disabled:opacity-50"
          >
            {isPending ? 'KAYDEDİLİYOR...' : 'DEĞİŞİKLİKLERİ KAYDET'}
          </button>
        </div>

      </form>
    </div>
  );
}