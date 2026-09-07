"use client";

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { updateProfileAction } from './actions';
import { PLATFORM_OPTIONS, POSITION_OPTIONS } from '../oyuncular/PlayerRankingsClient';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export type ProfileDashboardProps = {
  profile: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    current_ea_player_id: string | null;
    platform: string | null;
    primary_position: string | null;
    alternative_positions: string[] | null;
    bio: string | null;
  };
  stats: {
    matches: number;
    wins: number;
    assists: number;
    avgRating: number;
  };
  team: {
    id: string;
    name: string;
    logo_url: string | null;
    joined_at: string;
  } | null;
  performanceHistory: {
    season: string;
    team: { name: string; logo: string | null };
    matches: number;
    goals: number;
    assists: number;
    avgRating: number;
    contributionPerMatch: number;
  }[];
  transferHistory: {
    teamName: string;
    logo: string | null;
    joinedAt: string;
  }[];
  isOwnProfile: boolean;
};

export default function ProfileDashboardClient({
  profile,
  stats,
  team,
  performanceHistory,
  transferHistory,
  isOwnProfile
}: ProfileDashboardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState('');

  // Modal State
  const [editPlatform, setEditPlatform] = useState(profile.platform || '');
  const [editPrimaryPos, setEditPrimaryPos] = useState(profile.primary_position || '');
  const [editAltPos, setEditAltPos] = useState<string[]>(profile.alternative_positions || []);
  const [editBio, setEditBio] = useState(profile.bio || '');

  // Avatar Upload State
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const supabase = createClient();

  const toggleAltPos = (pos: string) => {
    if (editAltPos.includes(pos)) {
      setEditAltPos(editAltPos.filter(p => p !== pos));
    } else {
      if (editAltPos.length < 3) {
        setEditAltPos([...editAltPos, pos]);
      }
    }
  };


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Dosya boyutu 5 MB\'dan küçük olmalıdır.');
      return;
    }

    // Validate type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Desteklenmeyen dosya türü. Sadece JPG, PNG veya WEBP yükleyebilirsiniz.');
      return;
    }

    setErrorMsg('');
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handlePrimaryPosChange = (pos: string) => {
    setEditPrimaryPos(pos);
    // If it was in alt positions, remove it
    if (editAltPos.includes(pos)) {
      setEditAltPos(editAltPos.filter(p => p !== pos));
    }
  };

  const handleSave = async (formData: FormData) => {
    setErrorMsg('');
    
    // Validate if file upload is needed
    let finalAvatarUrl = profile.avatar_url || '';
    if (avatarFile) {
      startTransition(async () => {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${profile.id}/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(filePath, avatarFile, { upsert: true });

        if (uploadError) {
          setErrorMsg('Görsel yüklenirken bir hata oluştu: ' + uploadError.message);
          return;
        }

        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(filePath);

        finalAvatarUrl = publicUrl;
        
        // Proceed with save
        finishSave(formData, finalAvatarUrl);
      });
    } else {
      startTransition(() => finishSave(formData, finalAvatarUrl));
    }
  };

  const finishSave = async (formData: FormData, avatarUrl: string) => {
    formData.append('platform', editPlatform);
    formData.append('primary_position', editPrimaryPos);
    formData.append('alternative_positions', JSON.stringify(editAltPos));
    formData.append('username', profile.username);
    formData.append('avatar_url', avatarUrl);

    const res = await updateProfileAction(null, formData);
    if (res?.error) {
      setErrorMsg(res.error);
    } else {
      setIsModalOpen(false);
      router.refresh();
    }
  };

  return (
    <div className="w-full">
      {/* Top Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        
        {/* Left: Profile Card */}
        <div className="lg:col-span-8 client-glass rounded-2xl border border-white/5 p-8 relative overflow-hidden flex flex-col md:flex-row items-center md:items-start gap-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#00e5ff]/5 blur-[100px] pointer-events-none" />
          
          {/* Avatar */}
          <div className="w-40 h-40 shrink-0 rounded-2xl bg-[#060d18] border border-white/10 p-2 relative shadow-[0_0_30px_rgba(0,229,255,0.15)] flex items-center justify-center overflow-hidden">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <span className="text-5xl font-black text-[#00e5ff] opacity-80">{profile.username.substring(0, 2).toUpperCase()}</span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left z-10 w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between w-full mb-2">
              <h1 className="text-4xl font-[900] text-white tracking-tight drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] break-words min-w-0">{profile.username}</h1>
              {isOwnProfile && (
                <button 
                  onClick={() => setIsModalOpen(true)}
                  className="mt-4 md:mt-0 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white text-[11px] font-[800] tracking-widest uppercase transition-all flex items-center gap-2 mx-auto md:mx-0"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  Profili Düzenle
                </button>
              )}
            </div>
            
            <p className="text-[#00e5ff] text-[14px] font-[600] tracking-wider mb-5">
              {profile.full_name || 'İsimsiz Oyuncu'}
            </p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-6">
              {/* Platform */}
              {profile.platform && (
                <span className="data-label !text-[11px] border border-white/10 !bg-white/5">{profile.platform}</span>
              )}
              {/* Primary Pos */}
              {profile.primary_position && (
                <span className="data-label !text-[11px] !bg-[#00e5ff]/20 !text-[#00e5ff] border border-[#00e5ff]/30 shadow-[0_0_10px_rgba(0,229,255,0.2)]">
                  {profile.primary_position}
                </span>
              )}
              {/* Alt Pos */}
              {profile.alternative_positions?.map(pos => (
                <span key={pos} className="data-label !text-[11px] !bg-emerald-500/10 !text-emerald-400 border border-emerald-500/30">
                  {pos}
                </span>
              ))}
            </div>

            <div className="text-gray-400 text-[13px] leading-relaxed max-w-xl break-words min-w-0 whitespace-pre-wrap">
              {profile.bio || "Kendinden bahset..."}
            </div>
          </div>
        </div>

        {/* Right: Stats & Current Team */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Stats Grid */}
          <div className="client-glass rounded-2xl border border-white/5 p-6 grid grid-cols-2 gap-4">
            <div className="bg-[#03070c] rounded-xl border border-white/5 p-4 text-center flex flex-col justify-center">
              <span className="text-[10px] text-gray-500 font-[900] tracking-widest uppercase mb-1">MAÇ</span>
              <span className="text-2xl font-[900] text-white">{stats.matches}</span>
            </div>
            <div className="bg-[#03070c] rounded-xl border border-[#00e5ff]/20 p-4 text-center flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-[#00e5ff]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="text-[10px] text-[#00e5ff] font-[900] tracking-widest uppercase mb-1">GALİBİYET</span>
              <span className="text-2xl font-[900] text-[#00e5ff] drop-shadow-[0_0_8px_rgba(0,229,255,0.5)]">{stats.wins}</span>
            </div>
            <div className="bg-[#03070c] rounded-xl border border-white/5 p-4 text-center flex flex-col justify-center">
              <span className="text-[10px] text-gray-500 font-[900] tracking-widest uppercase mb-1">ASİST</span>
              <span className="text-2xl font-[900] text-white">{stats.assists}</span>
            </div>
            <div className="bg-[#03070c] rounded-xl border border-white/5 p-4 text-center flex flex-col justify-center">
              <span className="text-[10px] text-gray-500 font-[900] tracking-widest uppercase mb-1">ORT. RATING</span>
              <span className="text-2xl font-[900] text-white">{stats.avgRating.toFixed(2)}</span>
            </div>
          </div>

          {/* Current Team */}
          <div className="client-glass rounded-2xl border border-white/5 p-6 flex-1 flex flex-col justify-center">
            <h3 className="text-[10px] font-[900] text-gray-500 tracking-widest uppercase mb-4 text-center">Mevcut Takım</h3>
            {team ? (
              <div className="flex items-center justify-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-black border border-white/10 p-1 flex items-center justify-center shrink-0">
                  {team.logo_url ? (
                    <Image src={team.logo_url} alt={team.name} width={48} height={48} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-xl font-bold text-gray-500">{team.name.substring(0,2).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[16px] font-[800] text-white truncate min-w-0">{team.name}</span>
                  <span className="text-[11px] text-[#00e5ff] font-[600] mt-1">Sözleşmeli Oyuncu</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <span className="inline-block px-3 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-[800] text-gray-400 tracking-widest uppercase">
                  SERBEST OYUNCU
                </span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Performance */}
        <div className="lg:col-span-8 client-glass rounded-2xl border border-white/5 p-8">
          <div className="flex items-center gap-3 mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#00e5ff]"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
            <h2 className="text-[14px] font-[900] text-white tracking-[0.2em] uppercase">PERFORMANS</h2>
          </div>

          {performanceHistory.length === 0 ? (
            <div className="empty-state !py-12"><span className="empty-state-title text-[15px]">Kayıt Yok</span><span className="empty-state-desc">Henüz performans verisi bulunmuyor.</span></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="py-4 pr-6 text-[10px] font-[900] text-gray-500 tracking-[0.2em] uppercase">SEZON</th>
                    <th className="py-4 px-6 text-[10px] font-[900] text-gray-500 tracking-[0.2em] uppercase">TAKIM</th>
                    <th className="py-4 px-4 text-[10px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center">MAÇ</th>
                    <th className="py-4 px-4 text-[10px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center">GOL</th>
                    <th className="py-4 px-4 text-[10px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center">ASİST</th>
                    <th className="py-4 px-4 text-[10px] font-[900] text-[#00e5ff] tracking-[0.2em] uppercase text-center">ORT.</th>
                    <th className="py-4 pl-6 text-[10px] font-[900] text-gray-500 tracking-[0.2em] uppercase text-center">KATKI/MAÇ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {performanceHistory.map((perf, idx) => (
                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-4 pr-6 text-[13px] font-[700] text-gray-300">{perf.season}</td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded bg-black flex items-center justify-center overflow-hidden">
                            {perf.team.logo ? <Image src={perf.team.logo} alt={perf.team.name} width={24} height={24} /> : <span className="text-[8px] font-bold text-gray-500">{perf.team.name.substring(0,2)}</span>}
                          </div>
                          <span className="text-[13px] font-[700] text-white">{perf.team.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center text-[13px] font-[700] text-gray-400">{perf.matches}</td>
                      <td className="py-4 px-4 text-center text-[13px] font-[700] text-gray-300">{perf.goals}</td>
                      <td className="py-4 px-4 text-center text-[13px] font-[700] text-gray-300">{perf.assists}</td>
                      <td className="py-4 px-4 text-center text-[14px] font-[800] text-[#00e5ff] drop-shadow-[0_0_5px_rgba(0,229,255,0.3)]">{perf.avgRating.toFixed(2)}</td>
                      <td className="py-4 pl-6 text-center text-[13px] font-[700] text-emerald-400">{perf.contributionPerMatch.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Transfer History */}
        <div className="lg:col-span-4 client-glass rounded-2xl border border-white/5 p-8 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
            <h2 className="text-[14px] font-[900] text-white tracking-[0.2em] uppercase">TRANSFER GEÇMİŞİ</h2>
          </div>
          
          <div className="flex-1 flex flex-col overflow-y-auto pr-2 custom-scrollbar">
            {transferHistory.length === 0 ? (
              <div className="empty-state flex-1"><span className="empty-state-title text-[14px]">Transfer Yok</span><span className="empty-state-desc">Transfer geçmişi bulunmuyor.</span></div>
            ) : (
              <div className="flex flex-col gap-4 relative before:absolute before:inset-y-0 before:left-[19px] before:w-px before:bg-white/10 pl-2 py-2">
                {transferHistory.map((th, idx) => (
                  <div key={idx} className="relative flex items-center gap-4 group">
                    <div className="w-8 h-8 rounded-full bg-[#03070c] border border-white/20 flex items-center justify-center shrink-0 z-10 p-1 group-hover:border-[#00e5ff]/50 transition-colors">
                      {th.logo ? <Image src={th.logo} alt={th.teamName} width={24} height={24} className="object-contain" /> : <span className="text-[9px] font-bold text-gray-500">{th.teamName.substring(0,2)}</span>}
                    </div>
                    <div className="flex flex-col min-w-0 bg-white/[0.02] border border-white/5 rounded-xl p-3 flex-1">
                      <span className="text-[13px] font-[800] text-white truncate min-w-0 group-hover:text-[#00e5ff] transition-colors">{th.teamName}</span>
                      <span className="text-[10px] text-gray-500 font-medium mt-1">Katılım - {th.joinedAt}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          
          <div className="relative w-full max-w-3xl bg-[#060d18] border border-[#00e5ff]/30 shadow-[0_0_50px_rgba(0,229,255,0.15)] rounded-3xl p-6 md:p-10 max-h-[90vh] overflow-y-auto custom-scrollbar">
            
            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <h2 className="text-2xl font-[900] text-white tracking-widest uppercase mb-8">PROFİLİ DÜZENLE</h2>
            
            <form action={handleSave} className="space-y-8">
              
              {/* Names */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-[900] text-gray-500 tracking-widest uppercase ml-1">GERÇEK AD</label>
                  <input type="text" name="full_name" defaultValue={profile.full_name || ''} className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white focus:border-[#00e5ff]/50 focus:outline-none transition-colors" />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-[900] text-gray-500 tracking-widest uppercase ml-1">EA ID</label>
                  <input type="text" name="current_ea_player_id" defaultValue={profile.current_ea_player_id || ''} className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white focus:border-[#00e5ff]/50 focus:outline-none transition-colors" />
                </div>
              </div>

              {/* Platform */}
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-[900] text-gray-500 tracking-widest uppercase ml-1">PLATFORM (Birini Seçin)</label>
                <div className="flex flex-wrap gap-3">
                  {PLATFORM_OPTIONS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEditPlatform(p)}
                      className={`px-6 py-2.5 rounded-lg border text-[12px] font-[800] tracking-wider transition-all ${editPlatform === p ? 'bg-[#00e5ff]/10 border-[#00e5ff] text-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.3)]' : 'bg-[#03070c] border-white/10 text-gray-400 hover:border-white/30'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Primary Position */}
              <div className="flex flex-col gap-3">
                <label className="text-[10px] font-[900] text-gray-500 tracking-widest uppercase ml-1">ANA POZİSYON (Birini Seçin)</label>
                <div className="flex flex-wrap gap-2">
                  {POSITION_OPTIONS.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePrimaryPosChange(p)}
                      className={`w-14 h-10 rounded-lg border flex items-center justify-center text-[12px] font-[800] transition-all ${editPrimaryPos === p ? 'bg-[#00e5ff] border-[#00e5ff] text-black shadow-[0_0_10px_rgba(0,229,255,0.5)]' : 'bg-[#03070c] border-white/10 text-gray-400 hover:border-white/30'}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alternative Positions */}
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-[10px] font-[900] text-gray-500 tracking-widest uppercase">ALTERNATİF POZİSYONLAR</label>
                  <span className="text-[10px] font-bold text-gray-400">{editAltPos.length} / 3</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {POSITION_OPTIONS.map(p => {
                    const isSelected = editAltPos.includes(p);
                    const isDisabled = p === editPrimaryPos || (!isSelected && editAltPos.length >= 3);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleAltPos(p)}
                        disabled={isDisabled}
                        className={`w-14 h-10 rounded-lg border flex items-center justify-center text-[12px] font-[800] transition-all ${isSelected ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : isDisabled ? 'bg-black/50 border-white/5 text-gray-700 cursor-not-allowed' : 'bg-[#03070c] border-white/10 text-gray-400 hover:border-white/30'}`}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Avatar Upload */}
              <div className="flex flex-col gap-4">
                <label className="text-[10px] font-[900] text-gray-500 tracking-widest uppercase ml-1">PROFİL FOTOĞRAFI</label>
                <div className="client-glass border border-white/10 rounded-2xl p-4 flex flex-col md:flex-row items-center gap-6 bg-[#01060b]/50">
                  <div className="relative w-24 h-24 rounded-full overflow-hidden bg-black border-2 border-white/10 shrink-0 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-[900] text-[#00e5ff] text-[32px]">
                        {profile.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-left">
                    <label className="cursor-pointer group relative overflow-hidden rounded-xl">
                      <input 
                        type="file" 
                        accept="image/jpeg, image/jpg, image/png, image/webp" 
                        className="hidden" 
                        onChange={handleFileChange} 
                        disabled={isPending}
                      />
                      <div className="px-6 py-2.5 bg-[#00e5ff]/10 border border-[#00e5ff]/30 text-[#00e5ff] text-[12px] font-[900] tracking-widest uppercase group-hover:bg-[#00e5ff]/20 transition-all flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        Görseli Değiştir
                      </div>
                    </label>
                    <p className="text-[10px] font-bold text-gray-500 tracking-widest uppercase mt-3">Sadece JPG, PNG, WEBP • Max 5 MB</p>
                  </div>
                </div>
              </div>

              {/* Bio */}
              <div className="flex flex-col gap-2 relative">
                <label className="text-[10px] font-[900] text-gray-500 tracking-widest uppercase ml-1">BİOGRAFİ</label>
                <textarea
                  name="bio"
                  value={editBio}
                  onChange={e => setEditBio(e.target.value)}
                  maxLength={248}
                  rows={4}
                  placeholder="Kendinden bahset..."
                  className="w-full bg-[#03070c] border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white focus:border-[#00e5ff]/50 focus:outline-none transition-colors resize-none"
                />
                <span className="absolute bottom-3 right-4 text-[10px] font-bold text-gray-500">
                  {editBio.length} / 248
                </span>
              </div>

              {errorMsg && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-[13px] font-bold text-red-400 text-center">
                  {errorMsg}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-4 pt-4 border-t border-white/10">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded-xl border border-white/10 text-[12px] font-[800] tracking-widest uppercase text-gray-400 hover:bg-white/5 hover:text-white transition-all">
                  VAZGEÇ
                </button>
                <button type="submit" disabled={isPending} className="flat-button flat-button-solid px-8 py-3 !text-[12px]">
                  {isPending ? 'KAYDEDİLİYOR...' : 'DEĞİŞİKLİKLERİ KAYDET'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
