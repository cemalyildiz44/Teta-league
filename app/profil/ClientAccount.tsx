'use client';

import { useState, useTransition } from 'react';
import { updateProfileAction, changePasswordAction } from './actions';
import { logoutAction } from '@/app/auth/actions';
import { createClient } from '@/utils/supabase/client';
import Link from 'next/link';
import { Crown } from 'lucide-react';
import { acceptTeamInviteAction, rejectTeamInviteAction } from './team-actions';
import { PLATFORM_OPTIONS, POSITION_FILTER_OPTIONS } from '@/app/oyuncular/PlayerRankingsClient';

import imageCompression from 'browser-image-compression';

export default function ClientAccount({ profile, authUser, team, league, isCaptain, achievements, pendingInvites }: any) {
  const supabase = createClient();
  
  // Profile Update State
  const [profilePending, startProfileTransition] = useTransition();
  const [profileMsg, setProfileMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  // Password Update State
  const [passPending, startPassTransition] = useTransition();
  const [passMsg, setPassMsg] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  // Avatar State
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [uploading, setUploading] = useState(false);

  // Pending Invite State
  const [resolvingInvite, setResolvingInvite] = useState<string | null>(null);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      setProfileMsg(null);
      const file = e.target.files?.[0];
      if (!file) return;
      
      // Hard limit for safety
      if (file.size > 25 * 1024 * 1024) throw new Error("Dosya boyutu çok yüksek (maksimum 25MB).");
      if (!file.type.startsWith('image/')) throw new Error("Geçerli bir görsel formatı yükleyin.");

      setProfileMsg({ type: 'success', text: 'Fotoğraf optimize ediliyor...' });

      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 512,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.85,
      };

      let compressedFile = await imageCompression(file, options);
      
      // Failsafe if still over 1MB
      if (compressedFile.size > 1024 * 1024) {
        options.initialQuality = 0.70;
        compressedFile = await imageCompression(file, options);
      }

      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
      const filePath = `${profile.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, compressedFile, {
        cacheControl: '31536000',
        upsert: false
      });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      setAvatarUrl(publicUrl);
      setProfileMsg({ type: 'success', text: 'Görsel yüklendi, kaydetmek için formu gönderin.' });
    } catch (error: any) {
      setProfileMsg({ type: 'error', text: error.message || 'Yükleme hatası.' });
    } finally {
      setUploading(false);
    }
  };

  const handleProfileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileMsg(null);
    const formData = new FormData(e.currentTarget);
    formData.append('avatar_url', avatarUrl);
    
    startProfileTransition(async () => {
      const res = await updateProfileAction(null, formData);
      if (res?.error) setProfileMsg({ type: 'error', text: res.error });
      else if (res?.success) setProfileMsg({ type: 'success', text: 'Profil başarıyla güncellendi.' });
    });
  };

  const handlePasswordSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPassMsg(null);
    const formData = new FormData(e.currentTarget);
    
    startPassTransition(async () => {
      const res = await changePasswordAction(null, formData);
      if (res?.error) setPassMsg({ type: 'error', text: res.error });
      else if (res?.success) {
        setPassMsg({ type: 'success', text: res.success });
        (e.target as HTMLFormElement).reset();
      }
    });
  };

  const handleAcceptInvite = async (transferId: string) => {
    if (!confirm('Bu daveti kabul etmek ve takıma katılmak istiyor musun?')) return;
    setResolvingInvite(transferId);
    const res = await acceptTeamInviteAction(transferId);
    if (res?.error) alert(res.error);
    else if (res?.success) alert(res.success);
    setResolvingInvite(null);
  };

  const handleRejectInvite = async (transferId: string) => {
    if (!confirm('Bu daveti reddetmek istediğine emin misin?')) return;
    setResolvingInvite(transferId);
    const res = await rejectTeamInviteAction(transferId);
    if (res?.error) alert(res.error);
    else if (res?.success) alert(res.success);
    setResolvingInvite(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* 1. HEADER */}
      <section className="bg-[#03070c] border border-white/5 rounded-2xl p-6 lg:p-8 flex flex-col md:flex-row items-center md:items-start gap-6">
        <div className="relative group shrink-0">
          <div className="w-24 h-24 rounded-2xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt={profile?.username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[24px] font-[900] text-[#00e5ff] uppercase">{profile?.username?.substring(0, 2)}</span>
            )}
          </div>
          <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer rounded-2xl backdrop-blur-sm">
            <span className="text-[10px] font-[900] text-white tracking-widest uppercase">{uploading ? 'YÜKLENİYOR' : 'DEĞİŞTİR'}</span>
            <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
          </label>
        </div>
        
        <div className="flex flex-col flex-1 text-center md:text-left min-w-0">
          <h1 className="text-[28px] md:text-[32px] font-[900] text-white tracking-widest uppercase leading-none mb-2 truncate">
            {profile?.username}
          </h1>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-4">
            <span className="px-2.5 py-0.5 bg-white/5 border border-white/10 text-[10px] font-[900] tracking-widest text-gray-400 uppercase rounded">
              {profile?.platform && PLATFORM_OPTIONS.includes(profile.platform) ? profile.platform : 'BELİRTİLMEDİ'}
            </span>
            <span className="px-2.5 py-0.5 bg-[#00e5ff]/10 border border-[#00e5ff]/20 text-[10px] font-[900] tracking-widest text-[#00e5ff] uppercase rounded">{profile?.primary_position || 'BELİRTİLMEDİ'}</span>
            {profile?.current_ea_player_id && (
              <span className="px-2.5 py-0.5 bg-purple-500/10 border border-purple-500/20 text-[10px] font-[900] tracking-widest text-purple-400 uppercase rounded">EA: {profile.current_ea_player_id}</span>
            )}
          </div>
          
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-[12px] font-[700] text-gray-500 uppercase tracking-widest">
            {team ? (
              <Link href={`/takim/${team.slug}`} className="flex items-center gap-2 hover:text-white transition-colors">
                {team.logo_url && <img src={team.logo_url} className="w-4 h-4 object-contain" />}
                {team.name}
              </Link>
            ) : <span>SERBEST OYUNCU</span>}
            {league && <span className="border-l border-white/10 pl-4">{league.name}</span>}
            {isCaptain && (
              <span className="text-amber-400 border-l border-white/10 pl-4 font-black inline-flex items-center gap-1">
                <Crown className="w-3.5 h-3.5" /> KAPTAN
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-col gap-2 w-full md:w-auto">
          {isCaptain && (
            <Link
              href="/takim/yonet"
              className="px-6 py-3 bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/40 text-amber-400 hover:text-amber-300 hover:border-amber-400 hover:bg-amber-500/25 text-[10px] font-[900] tracking-[0.2em] uppercase rounded-xl transition-all text-center flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(245,158,11,0.15)] group"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
              <span>KAPTAN PANELİ</span>
            </Link>
          )}
          <Link href={`/oyuncular/${profile?.username}`} className="px-6 py-3 bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-[#00e5ff] hover:bg-[#00e5ff]/20 text-[10px] font-[900] tracking-[0.2em] uppercase rounded-xl transition-all text-center">
            PROFİLİMİ GÖR
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="w-full px-6 py-3 bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-[10px] font-[900] tracking-[0.2em] uppercase rounded-xl transition-all">
              ÇIKIŞ YAP
            </button>
          </form>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* LEFT COLUMN */}
        <div className="md:col-span-2 space-y-6">

          {/* PENDING INVITES */}
          {pendingInvites && pendingInvites.length > 0 && (
            <section className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 lg:p-8">
              <h2 className="text-[14px] font-[900] text-amber-500 tracking-[0.2em] uppercase mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                BEKLEYEN TAKIM DAVETLERİ ({pendingInvites.length})
              </h2>
              <div className="space-y-3">
                {pendingInvites.map((inv: any) => (
                  <div key={inv.id} className="bg-black/40 border border-amber-500/10 p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="text-[14px] font-[900] text-white uppercase">{inv.team_name}</div>
                      <div className="text-[10px] font-[700] text-amber-500/70 uppercase tracking-widest mt-1">
                        Kaptan: {inv.captain_name} • {new Date(inv.created_at).toLocaleDateString('tr-TR')}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleAcceptInvite(inv.id)} 
                        disabled={resolvingInvite === inv.id}
                        className="px-4 py-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 text-[10px] font-[900] tracking-widest uppercase rounded-lg transition-colors disabled:opacity-50"
                      >
                        {resolvingInvite === inv.id ? '...' : 'KABUL ET'}
                      </button>
                      <button 
                        onClick={() => handleRejectInvite(inv.id)}
                        disabled={resolvingInvite === inv.id} 
                        className="px-4 py-2 bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 text-[10px] font-[900] tracking-widest uppercase rounded-lg transition-colors disabled:opacity-50"
                      >
                        {resolvingInvite === inv.id ? '...' : 'REDDET'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* PROFILE FORM */}
          <section className="bg-[#03070c] border border-white/5 rounded-2xl p-6 lg:p-8">
            <h2 className="text-[14px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-6 pb-4 border-b border-white/5">PROFİL BİLGİLERİ</h2>
            
            {profileMsg && (
              <div className={`p-4 rounded-xl text-[12px] font-[700] mb-6 border ${profileMsg.type === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                {profileMsg.text}
              </div>
            )}

            <form onSubmit={handleProfileSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">KULLANICI ADI</label>
                  <input type="text" name="username" defaultValue={profile?.username} required className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">EA ID (PSN/XBOX/PC)</label>
                  <input type="text" name="current_ea_player_id" defaultValue={profile?.current_ea_player_id || ''} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors" />
                </div>
                <div>
                  <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">PLATFORM</label>
                  <select 
                    name="platform" 
                    defaultValue={profile?.platform && PLATFORM_OPTIONS.includes(profile.platform) ? profile.platform : ''} 
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">Platform seçiniz</option>
                    {PLATFORM_OPTIONS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">ANA POZİSYON</label>
                  <select name="primary_position" defaultValue={profile?.primary_position || 'Belirtilmedi'} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors appearance-none">
                    <option value="Belirtilmedi">Belirtilmedi</option>
                    {POSITION_FILTER_OPTIONS.map(pos => (
                      <option key={pos.value} value={pos.value}>{pos.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">BİYOGRAFİ</label>
                <textarea name="bio" defaultValue={profile?.bio || ''} rows={3} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-[#00e5ff]/50 transition-colors resize-none" />
              </div>
              <div className="pt-4 border-t border-white/5 flex justify-end">
                <button type="submit" disabled={profilePending} className="px-8 py-3 bg-white text-black hover:bg-gray-200 text-[10px] font-[900] tracking-[0.2em] uppercase rounded-xl transition-colors disabled:opacity-50">
                  {profilePending ? 'KAYDEDİLİYOR...' : 'KAYDET'}
                </button>
              </div>
            </form>
          </section>

          {/* PASSWORD FORM */}
          <section className="bg-[#03070c] border border-white/5 rounded-2xl p-6 lg:p-8">
            <h2 className="text-[14px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-6 pb-4 border-b border-white/5">ŞİFRE DEĞİŞTİR</h2>
            
            {passMsg && (
              <div className={`p-4 rounded-xl text-[12px] font-[700] mb-6 border ${passMsg.type === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                {passMsg.text}
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">MEVCUT ŞİFRE</label>
                  <input type="password" name="currentPassword" required className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-white/30 transition-colors" placeholder="Mevcut şifren" />
                </div>
                <div>
                  <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">YENİ ŞİFRE</label>
                  <input type="password" name="password" required minLength={8} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-white/30 transition-colors" placeholder="Yeni şifren" />
                </div>
                <div>
                  <label className="block text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-2">YENİ ŞİFRE (TEKRAR)</label>
                  <input type="password" name="confirmPassword" required minLength={8} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[14px] font-[700] text-white focus:outline-none focus:border-white/30 transition-colors" placeholder="Yeni şifreni tekrar gir" />
                </div>
              </div>
              <div className="pt-4 border-t border-white/5 flex justify-end">
                <button type="submit" disabled={passPending} className="px-8 py-3 bg-white/10 border border-white/20 text-white hover:bg-white/20 text-[10px] font-[900] tracking-[0.2em] uppercase rounded-xl transition-colors disabled:opacity-50">
                  {passPending ? 'GÜNCELLENİYOR...' : 'ŞİFREYİ GÜNCELLE'}
                </button>
              </div>
            </form>
          </section>

        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          
          {/* ACCOUNT DETAILS */}
          <section className="bg-[#03070c] border border-white/5 rounded-2xl p-6">
            <h2 className="text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-4">HESAP DETAYLARI</h2>
            <div className="space-y-4">
              <div>
                <span className="block text-[9px] font-[900] text-gray-600 tracking-widest uppercase mb-1">E-POSTA ADRESİ</span>
                <span className="text-[13px] font-[700] text-white truncate block">{authUser.email}</span>
              </div>
              <div>
                <span className="block text-[9px] font-[900] text-gray-600 tracking-widest uppercase mb-1">DOĞRULAMA DURUMU</span>
                {authUser.email_confirmed_at ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-[900] tracking-widest uppercase rounded">
                    ✓ DOĞRULANDI
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-[900] tracking-widest uppercase rounded">
                    ⚠ DOĞRULANMADI
                  </span>
                )}
              </div>
              <div>
                <span className="block text-[9px] font-[900] text-gray-600 tracking-widest uppercase mb-1">KAYIT TARİHİ</span>
                <span className="text-[12px] font-[700] text-gray-400">{new Date(authUser.created_at).toLocaleDateString('tr-TR')}</span>
              </div>
            </div>
          </section>

          {/* ACHIEVEMENTS */}
          <section className="bg-[#03070c] border border-white/5 rounded-2xl p-6">
            <h2 className="text-[12px] font-[900] text-gray-500 tracking-[0.2em] uppercase mb-4">KUPALAR / BAŞARILAR</h2>
            <div className="flex items-center justify-between p-4 bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20 rounded-xl mb-4">
              <span className="text-[11px] font-[900] text-amber-500 tracking-widest uppercase">TOPLAM KUPA</span>
              <span className="text-[24px] font-[900] text-white">{achievements.totalCups}</span>
            </div>
            {achievements.totalCups > 0 ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-white/[0.02] border border-white/5 rounded-lg py-3">
                  <span className="block text-[16px] font-[900] text-white mb-1">{achievements.type1V1}</span>
                  <span className="block text-[8px] font-[900] text-gray-500 tracking-widest uppercase">1V1</span>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-lg py-3">
                  <span className="block text-[16px] font-[900] text-white mb-1">{achievements.typeKarma}</span>
                  <span className="block text-[8px] font-[900] text-gray-500 tracking-widest uppercase">KARMA</span>
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-lg py-3">
                  <span className="block text-[16px] font-[900] text-white mb-1">{achievements.typeNC}</span>
                  <span className="block text-[8px] font-[900] text-gray-500 tracking-widest uppercase">N. CUP</span>
                </div>
              </div>
            ) : (
              <div className="text-center text-[11px] font-[700] text-gray-500 py-2">Kupa bulunmuyor.</div>
            )}
          </section>

        </div>

      </div>
    </div>
  );
}
