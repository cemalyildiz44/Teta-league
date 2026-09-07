
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Search, Plus, Edit2, Shield, Users, Crown,
  CheckCircle2, Trash2, AlertTriangle, X, Loader2, Upload
} from 'lucide-react';
import { 
  createTeam, editTeam, updateTeamStatus,
  assignCaptain, addPlayerToTeam, removePlayerFromTeam, uploadTeamLogoAction
} from './actions';

import imageCompression from 'browser-image-compression';

export function TeamsManager({ initialTeams, initialCaptains, initialMemberships, initialLeagueTeams, allProfiles }: any) {
  const router = useRouter();
  const [teams, setTeams] = useState(initialTeams);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  
  useEffect(() => { setTeams(initialTeams); }, [initialTeams]);

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [rosterModal, setRosterModal] = useState<any>(null); // holds team info
  const [captainModal, setCaptainModal] = useState<any>(null); // holds team info
  const [addPlayerModal, setAddPlayerModal] = useState<any>(null); // holds team info
  const [logoModal, setLogoModal] = useState<any>(null); // holds team info
  
  // Team Logo States
  const [createImageFile, setCreateImageFile] = useState<File | null>(null);
  const [createImagePreview, setCreateImagePreview] = useState<string | null>(null);
  const [createOptimizing, setCreateOptimizing] = useState(false);

  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editRemoveImage, setEditRemoveImage] = useState(false);
  const [editOptimizing, setEditOptimizing] = useState(false);

  const [confirmModal, setConfirmModal] = useState<any>({ isOpen: false });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const filtered = teams.filter((t: any) => {
    const s = t.name.toLowerCase().includes(search.toLowerCase());
    let f = true;
    if (filter === 'ACTIVE') f = t.is_active === true;
    if (filter === 'INACTIVE') f = t.is_active === false;
    if (filter === 'NO_CAPTAIN') f = !initialCaptains.find((c:any) => c.team_id === t.id);
    return s && f;
  });

  const totalTeams = teams.length;
  const activeTeams = teams.filter((t: any) => t.is_active).length;
  const withCaptain = initialCaptains.length;
  const withoutCaptain = totalTeams - withCaptain;

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };
  const closeConfirm = () => setConfirmModal({ ...confirmModal, isOpen: false });

  // Logo compression and selection handler
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      showFeedback('Dosya boyutu çok yüksek (maksimum 25MB).', 'error');
      return;
    }
    if (!file.type.startsWith('image/')) {
      showFeedback('Lütfen geçerli bir görsel formatı (PNG, JPG, WEBP) seçin.', 'error');
      return;
    }

    if (isEdit) setEditOptimizing(true);
    else setCreateOptimizing(true);

    showFeedback('Logo optimize ediliyor...', 'success');

    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 512,
        useWebWorker: true,
        fileType: 'image/webp' as any,
        initialQuality: 0.85,
      };

      let compressed = await imageCompression(file, options);
      if (compressed.size > 1024 * 1024) {
        options.initialQuality = 0.70;
        compressed = await imageCompression(file, options);
      }

      const previewUrl = URL.createObjectURL(compressed);

      if (isEdit) {
        setEditImageFile(compressed);
        setEditImagePreview(previewUrl);
        setEditRemoveImage(false);
      } else {
        setCreateImageFile(compressed);
        setCreateImagePreview(previewUrl);
      }
      showFeedback('Logo optimize edildi.', 'success');
    } catch (err) {
      showFeedback('Logo optimize edilirken hata oluştu.', 'error');
    } finally {
      if (isEdit) setEditOptimizing(false);
      else setCreateOptimizing(false);
    }
  };

  // Handlers
  const handleCreate = async (e: any) => {
    e.preventDefault();
    if (createOptimizing) {
      showFeedback('Lütfen logo optimizasyonunun tamamlanmasını bekleyin.', 'error');
      return;
    }
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    if (createImageFile) {
      formData.append('logo_file', createImageFile, createImageFile.name || 'logo.webp');
    }
    const res = await createTeam(formData);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || '', 'success');
      setCreateModal(false);
      setCreateImageFile(null);
      setCreateImagePreview(null);
      router.refresh();
    }
    setLoading(false);
  };

  const handleEdit = async (e: any) => {
    e.preventDefault();
    if (editOptimizing) {
      showFeedback('Lütfen logo optimizasyonunun tamamlanmasını bekleyin.', 'error');
      return;
    }
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    if (editImageFile) {
      formData.append('logo_file', editImageFile, editImageFile.name || 'logo.webp');
    }
    if (editRemoveImage) {
      formData.append('remove_logo', 'true');
    }
    const res = await editTeam(formData);
    if (res.error) {
      showFeedback(res.error, 'error');
    } else {
      showFeedback(res.success || '', 'success');
      setEditData(null);
      setEditImageFile(null);
      setEditImagePreview(null);
      setEditRemoveImage(false);
      router.refresh();
    }
    setLoading(false);
  };

  const handleStatus = (t: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Durum Değiştir',
      message: t.name + ' takımının durumunu ' + (t.is_active ? 'PASİF' : 'AKTİF') + ' yapmak istiyor musunuz?',
      type: 'warning',
      action: async () => {
        setLoading(true);
        const res = await updateTeamStatus(t.id, !t.is_active);
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || '', 'success'); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  const handleAssignCaptain = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const res = await assignCaptain(captainModal.id, new FormData(e.currentTarget).get('user_id') as string);
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback(res.success || '', 'success'); setCaptainModal(null); router.refresh(); }
    setLoading(false);
  };

  const handleAddPlayer = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const leagueSeason = fd.get('league_season') as string;
    if (!leagueSeason) {
      showFeedback('Lütfen lig seçin', 'error');
      setLoading(false);
      return;
    }
    const [league_id, season_id] = leagueSeason.split('|');
    const res = await addPlayerToTeam(addPlayerModal.id, fd.get('player_id') as string, league_id, season_id);
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback(res.success || '', 'success'); setAddPlayerModal(null); router.refresh(); }
    setLoading(false);
  };

  const handleRemovePlayer = async (membership: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'KADRO DIŞI BIRAK',
      message: `${membership.profiles?.username} adlı oyuncuyu takımdan çıkarmak istediğinize emin misiniz? Oyuncu geçmiş kadroya düşecektir.`,
      type: 'danger',
      action: async () => {
        setLoading(true);
        const res = await removePlayerFromTeam(membership.id);
        setLoading(false);
        if (res.error) alert(res.error);
        else closeConfirm();
      }
    });
  };

  const handleUploadLogo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fileInput = e.currentTarget.elements.namedItem('file') as HTMLInputElement;
      const file = fileInput.files?.[0];
      if (!file) throw new Error("Dosya seçilmedi.");

      if (file.size > 25 * 1024 * 1024) throw new Error("Dosya boyutu çok yüksek (maksimum 25MB).");
      if (!file.type.startsWith('image/')) throw new Error("Geçerli bir görsel formatı yükleyin.");

      showFeedback('Logo optimize ediliyor...', 'success');

      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 512,
        useWebWorker: true,
        fileType: 'image/webp',
        initialQuality: 0.85,
      };

      let compressedFile = await imageCompression(file, options);
      if (compressedFile.size > 1024 * 1024) {
        options.initialQuality = 0.70;
        compressedFile = await imageCompression(file, options);
      }

      const fd = new FormData();
      fd.append('teamId', logoModal.id);
      fd.append('file', compressedFile, compressedFile.name || 'logo.webp');

      const res = await uploadTeamLogoAction(fd);
      if (res.error) {
        showFeedback(res.error, 'error');
      } else {
        setLogoModal(null);
        showFeedback('Logo başarıyla yüklendi.', 'success');
        router.refresh();
      }
    } catch (error: any) {
      showFeedback(error.message || 'Yükleme hatası.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='space-y-6'>
      {feedback && (
        <div className={'fixed top-4 right-4 z-50 p-4 rounded-xl border shadow-xl flex items-center gap-3 transition-all ' + 
          (feedback.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400')}>
          {feedback.type === 'error' ? <AlertTriangle className='w-5 h-5' /> : <CheckCircle2 className='w-5 h-5' />}
          <p className='text-sm font-medium'>{feedback.msg}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-zinc-400 font-medium mb-1'>TOPLAM TAKIM</p>
          <p className='text-2xl font-black text-white'>{totalTeams}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-emerald-400 font-medium mb-1'>AKTİF TAKIM</p>
          <p className='text-2xl font-black text-white'>{activeTeams}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-cyan-400 font-medium mb-1'>KAPTANI OLAN</p>
          <p className='text-2xl font-black text-white'>{withCaptain}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-amber-400 font-medium mb-1'>KAPTANSIZ</p>
          <p className='text-2xl font-black text-white'>{withoutCaptain}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className='flex flex-col md:flex-row gap-4 items-start md:items-center justify-between'>
        <div className='flex items-center gap-2 w-full md:w-auto'>
          <div className='relative w-full md:w-64'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500' />
            <input 
              type='text' placeholder='Takım Ara...' 
              value={search} onChange={e => setSearch(e.target.value)}
              className='w-full pl-9 pr-4 py-2 bg-[#060d18] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50'
            />
          </div>
          <div className='flex bg-[#060d18] rounded-lg border border-white/10 p-1'>
            {['ALL', 'ACTIVE', 'INACTIVE', 'NO_CAPTAIN'].map(f => (
              <button 
                key={f} onClick={() => setFilter(f)}
                className={'px-3 py-1.5 text-[10px] font-bold rounded-md transition-colors ' + 
                  (filter === f ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300')}
              >
                {f === 'ALL' ? 'TÜMÜ' : f === 'NO_CAPTAIN' ? 'KAPTANSIZ' : f}
              </button>
            ))}
          </div>
        </div>
        
        <button onClick={() => setCreateModal(true)} className='flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg text-sm font-black transition-colors w-full md:w-auto justify-center'>
          <Plus className='w-4 h-4' /> YENİ TAKIM
        </button>
      </div>

      {/* Table */}
      <div className='card-surface rounded-xl border border-white/5 overflow-x-auto'>
        <table className='w-full text-left text-sm text-zinc-400'>
          <thead className='bg-[#0a1628] border-b border-white/5 text-xs uppercase font-black text-cyan-400'>
            <tr>
              <th className='px-4 py-4'>Takım</th>
              <th className='px-4 py-4'>Kaptan</th>
              <th className='px-4 py-4'>Lig / Sezon</th>
              <th className='px-4 py-4'>Kadro</th>
              <th className='px-4 py-4'>Durum</th>
              <th className='px-4 py-4 text-right'>İşlemler</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-white/5'>
            {filtered.map((t: any) => {
              const cap = initialCaptains.find((c:any) => c.team_id === t.id);
              const mems = initialMemberships.filter((m:any) => m.team_id === t.id && !m.left_at);
              const lts = initialLeagueTeams.filter((l:any) => l.team_id === t.id);

              return (
                <tr key={t.id} className='hover:bg-white/5 transition-colors group'>
                  <td className='px-4 py-4'>
                    <div className='flex items-center gap-3'>
                      <div className='w-8 h-8 rounded-full border border-white/10 bg-[#060d18] overflow-hidden flex items-center justify-center'>
                        {t.logo_url ? <img src={t.logo_url} className='w-full h-full object-cover' /> : <Shield className='w-4 h-4 text-zinc-600' />}
                      </div>
                      <Link href={'/takim/' + t.slug} target='_blank' className='font-bold text-white hover:text-cyan-400 transition-colors'>{t.name}</Link>
                    </div>
                  </td>
                  <td className='px-4 py-4'>
                    {cap ? (
                      <span className='inline-flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 text-amber-400 rounded-md text-[10px] font-bold'>
                        <Crown className='w-3 h-3' /> {cap.profiles?.username}
                      </span>
                    ) : <span className='text-[10px] font-bold text-zinc-600 uppercase'>Yok</span>}
                  </td>
                  <td className='px-4 py-4'>
                    {lts.length > 0 ? (
                      <div className='flex flex-col gap-1'>
                        {lts.map((l:any, i:number) => (
                          <div key={i} className='text-xs'><span className='text-white font-medium'>{l.leagues?.name}</span> <span className='text-zinc-500'>({l.seasons?.name})</span></div>
                        ))}
                      </div>
                    ) : <span className='text-[10px] font-bold text-zinc-600 uppercase'>Atanmamış</span>}
                  </td>
                  <td className='px-4 py-4 font-mono text-xs text-white'>{mems.length} Oyuncu</td>
                  <td className='px-4 py-4'>
                    <button onClick={() => handleStatus(t)} className={'px-2 py-1 rounded-md text-[10px] font-bold ring-1 inset-ring ' + (t.is_active ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30' : 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30')}>
                      {t.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </button>
                  </td>
                  <td className='px-4 py-4'>
                    <div className='flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                      <button onClick={() => setLogoModal(t)} className='p-1.5 bg-pink-500/10 hover:bg-pink-500/20 rounded-md text-pink-400' title='Logo Yükle'>
                        <Upload className='w-4 h-4' />
                      </button>
                      <button onClick={() => setCaptainModal(t)} className='p-1.5 bg-amber-500/10 hover:bg-amber-500/20 rounded-md text-amber-400' title='Kaptan Ata'>
                        <Crown className='w-4 h-4' />
                      </button>
                      <button onClick={() => setRosterModal(t)} className='p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md text-indigo-400' title='Kadro Yönetimi'>
                        <Users className='w-4 h-4' />
                      </button>
                      <button 
                        onClick={() => {
                          setEditData(t);
                          setEditImagePreview(t.logo_url || null);
                          setEditImageFile(null);
                          setEditRemoveImage(false);
                        }} 
                        className='p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-zinc-300' 
                        title='Düzenle'
                      >
                        <Edit2 className='w-4 h-4' />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className='px-4 py-12 text-center text-zinc-500'>HENÜZ TAKIM OLUŞTURULMADI VEYA BULUNAMADI</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {createModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-md rounded-2xl border border-white/10 overflow-hidden'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <h2 className='text-sm font-black text-white tracking-widest'>YENİ TAKIM</h2>
              <button onClick={() => { setCreateModal(false); setCreateImageFile(null); setCreateImagePreview(null); }} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleCreate} className='p-6 space-y-4'>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Takım Adı</label>
                <input name='name' required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>
                  Takım Kısaltması <span className='normal-case text-zinc-600 font-normal'>(2–5 karakter, örn: ABR)</span>
                </label>
                <input
                  name='ea_club_name'
                  placeholder='ABR'
                  maxLength={5}
                  className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm uppercase placeholder:normal-case placeholder:text-zinc-600'
                />
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Slug (Opsiyonel)</label>
                <input name='slug' placeholder='Otomatik oluşturulur' className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>EA Club ID</label>
                <input name='ea_club_id' type='number' className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
              </div>

              {/* Takım Logosu */}
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>
                  Takım Logosu
                </label>
                {createImagePreview ? (
                  <div className='flex items-center gap-4 p-3 bg-[#060d18] border border-white/10 rounded-xl'>
                    <div className='w-14 h-14 rounded-lg bg-black/50 border border-cyan-500/30 overflow-hidden flex items-center justify-center shrink-0'>
                      <img src={createImagePreview} alt='Önizleme' className='w-full h-full object-contain' />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='text-xs font-bold text-white truncate'>Logo Seçildi</p>
                      <p className='text-[10px] text-cyan-400'>WebP optimize edildi</p>
                    </div>
                    <div className='flex gap-2 shrink-0'>
                      <label className='cursor-pointer px-2.5 py-1.5 bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold rounded-md transition-colors'>
                        Değiştir
                        <input
                          type='file'
                          accept='image/png,image/jpeg,image/webp'
                          className='hidden'
                          onChange={(e) => handleImageSelect(e, false)}
                          disabled={createOptimizing}
                        />
                      </label>
                      <button
                        type='button'
                        onClick={() => {
                          setCreateImageFile(null);
                          setCreateImagePreview(null);
                        }}
                        className='px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold rounded-md transition-colors'
                      >
                        Kaldır
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className='flex items-center justify-center gap-3 p-4 bg-[#060d18] border border-dashed border-white/15 hover:border-cyan-500/50 rounded-xl cursor-pointer transition-colors group'>
                    <div className='w-8 h-8 rounded-lg bg-white/5 group-hover:bg-cyan-500/10 flex items-center justify-center text-zinc-400 group-hover:text-cyan-400 transition-colors'>
                      <Upload className='w-4 h-4' />
                    </div>
                    <div className='text-left'>
                      <p className='text-xs font-bold text-white group-hover:text-cyan-400 transition-colors'>
                        {createOptimizing ? 'Logo optimize ediliyor...' : 'Logo Seç veya Yükle'}
                      </p>
                      <p className='text-[10px] text-zinc-500'>PNG, JPG, WEBP (Otomatik optimize edilir)</p>
                    </div>
                    <input
                      type='file'
                      accept='image/png,image/jpeg,image/webp'
                      className='hidden'
                      onChange={(e) => handleImageSelect(e, false)}
                      disabled={createOptimizing}
                    />
                  </label>
                )}
              </div>

              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => { setCreateModal(false); setCreateImageFile(null); setCreateImagePreview(null); }} className='flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors'>İPTAL</button>
                <button type='submit' disabled={loading || createOptimizing} className='flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-xs font-black transition-colors disabled:opacity-50 flex justify-center items-center gap-2'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} OLUŞTUR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editData && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-md rounded-2xl border border-white/10 overflow-hidden'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <h2 className='text-sm font-black text-white tracking-widest'>TAKIM DÜZENLE</h2>
              <button onClick={() => { setEditData(null); setEditImageFile(null); setEditImagePreview(null); setEditRemoveImage(false); }} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleEdit} className='p-6 space-y-4'>
              <input type='hidden' name='id' value={editData.id} />
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Takım Adı</label>
                <input name='name' defaultValue={editData.name} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>
                  Takım Kısaltması <span className='normal-case text-zinc-600 font-normal'>(2–5 karakter, örn: ABR)</span>
                </label>
                <input
                  name='ea_club_name'
                  defaultValue={editData.ea_club_name || ''}
                  placeholder='ABR'
                  maxLength={5}
                  className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm uppercase placeholder:normal-case placeholder:text-zinc-600'
                />
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Slug</label>
                <input name='slug' defaultValue={editData.slug} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>EA Club ID</label>
                <input name='ea_club_id' type='number' defaultValue={editData.ea_club_id || ''} className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
              </div>

              {/* Takım Logosu */}
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>
                  Takım Logosu
                </label>
                {editImagePreview && !editRemoveImage ? (
                  <div className='flex items-center gap-4 p-3 bg-[#060d18] border border-white/10 rounded-xl'>
                    <div className='w-14 h-14 rounded-lg bg-black/50 border border-cyan-500/30 overflow-hidden flex items-center justify-center shrink-0'>
                      <img src={editImagePreview} alt='Önizleme' className='w-full h-full object-contain' />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='text-xs font-bold text-white truncate'>Mevcut Logo</p>
                      <p className='text-[10px] text-cyan-400'>
                        {editImageFile ? 'Yeni logo optimize edildi' : 'Kayıtlı logo'}
                      </p>
                    </div>
                    <div className='flex gap-2 shrink-0'>
                      <label className='cursor-pointer px-2.5 py-1.5 bg-white/10 hover:bg-white/15 text-white text-[10px] font-bold rounded-md transition-colors'>
                        Değiştir
                        <input
                          type='file'
                          accept='image/png,image/jpeg,image/webp'
                          className='hidden'
                          onChange={(e) => handleImageSelect(e, true)}
                          disabled={editOptimizing}
                        />
                      </label>
                      <button
                        type='button'
                        onClick={() => {
                          setEditImageFile(null);
                          setEditImagePreview(null);
                          setEditRemoveImage(true);
                        }}
                        className='px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-[10px] font-bold rounded-md transition-colors'
                      >
                        Kaldır
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className='flex items-center justify-center gap-3 p-4 bg-[#060d18] border border-dashed border-white/15 hover:border-cyan-500/50 rounded-xl cursor-pointer transition-colors group'>
                    <div className='w-8 h-8 rounded-lg bg-white/5 group-hover:bg-cyan-500/10 flex items-center justify-center text-zinc-400 group-hover:text-cyan-400 transition-colors'>
                      <Upload className='w-4 h-4' />
                    </div>
                    <div className='text-left'>
                      <p className='text-xs font-bold text-white group-hover:text-cyan-400 transition-colors'>
                        {editOptimizing ? 'Logo optimize ediliyor...' : 'Logo Seç veya Yükle'}
                      </p>
                      <p className='text-[10px] text-zinc-500'>PNG, JPG, WEBP (Otomatik optimize edilir)</p>
                    </div>
                    <input
                      type='file'
                      accept='image/png,image/jpeg,image/webp'
                      className='hidden'
                      onChange={(e) => handleImageSelect(e, true)}
                      disabled={editOptimizing}
                    />
                  </label>
                )}
              </div>

              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => { setEditData(null); setEditImageFile(null); setEditImagePreview(null); setEditRemoveImage(false); }} className='flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors'>İPTAL</button>
                <button type='submit' disabled={loading || editOptimizing} className='flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-xs font-black transition-colors disabled:opacity-50 flex justify-center items-center gap-2'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} GÜNCELLE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Captain Modal */}
      {captainModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden flex flex-col'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <div>
                <h2 className='text-sm font-black text-white tracking-widest'>KAPTAN ATA</h2>
                <p className='text-xs text-cyan-400'>{captainModal.name}</p>
              </div>
              <button onClick={() => setCaptainModal(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleAssignCaptain} className='p-6 space-y-4'>
              <p className='text-xs text-amber-500'>Mevcut kaptanlık yetkisi alınacak ve seçtiğiniz kullanıcıya verilecektir.</p>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Kullanıcı Seçin</label>
                <select name='user_id' required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm custom-scrollbar'>
                  <option value=''>Seçiniz...</option>
                  {allProfiles.map((p: any) => <option key={p.id} value={p.id}>{p.username}</option>)}
                </select>
              </div>
              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => setCaptainModal(null)} className='flex-1 py-2 bg-white/5 text-white rounded-lg text-xs font-bold'>İPTAL</button>
                <button type='submit' disabled={loading} className='flex-1 py-2 bg-cyan-500 text-black rounded-lg text-xs font-black flex justify-center items-center gap-2'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} KAPTAN ATA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Player Modal (Opens over Roster Modal) */}
      {addPlayerModal && (
        <div className='fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <h2 className='text-sm font-black text-white tracking-widest'>OYUNCU EKLE</h2>
              <button onClick={() => setAddPlayerModal(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleAddPlayer} className='p-6 space-y-4'>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Lig / Sezon</label>
                <select name='league_season' required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm'>
                  <option value=''>Seçiniz...</option>
                  {initialLeagueTeams.filter((lt:any) => lt.team_id === addPlayerModal.id).map((lt:any) => (
                    <option key={lt.league_id + lt.season_id} value={lt.league_id + '|' + lt.season_id}>
                      {lt.leagues?.name} ({lt.seasons?.name})
                    </option>
                  ))}
                </select>
                {initialLeagueTeams.filter((lt:any) => lt.team_id === addPlayerModal.id).length === 0 && (
                  <p className='text-xs text-red-400 mt-1'>Takımın atanmış aktif bir ligi bulunmuyor. Önce LİGLER ekranından takım ataması yapın.</p>
                )}
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Oyuncu</label>
                <select name='player_id' required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm'>
                  <option value=''>Seçiniz...</option>
                  {allProfiles.map((p: any) => <option key={p.id} value={p.id}>{p.username}</option>)}
                </select>
              </div>
              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => setAddPlayerModal(null)} className='flex-1 py-2 bg-white/5 text-white rounded-lg text-xs font-bold'>İPTAL</button>
                <button type='submit' disabled={loading || initialLeagueTeams.filter((lt:any) => lt.team_id === addPlayerModal.id).length === 0} className='flex-1 py-2 bg-cyan-500 text-black rounded-lg text-xs font-black flex justify-center items-center gap-2 disabled:opacity-50'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} EKLE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Roster Modal */}
      {rosterModal && !addPlayerModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-2xl rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-[85vh]'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <div>
                <h2 className='text-sm font-black text-white tracking-widest'>KADRO YÖNETİMİ</h2>
                <p className='text-xs text-cyan-400'>{rosterModal.name}</p>
              </div>
              <button onClick={() => setRosterModal(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <div className='p-4 border-b border-white/5 flex justify-between items-center bg-[#060d18]'>
              <h3 className='text-xs font-bold text-zinc-400 uppercase tracking-widest'>AKTİF OYUNCULAR</h3>
              <button onClick={() => setAddPlayerModal(rosterModal)} className='bg-cyan-500 hover:bg-cyan-400 text-black px-3 py-1.5 rounded text-xs font-black flex items-center gap-2'>
                <Plus className='w-3 h-3' /> OYUNCU EKLE
              </button>
            </div>
            <div className='flex-1 overflow-y-auto'>
              <div className='divide-y divide-white/5'>
                {initialMemberships.filter((m:any) => m.team_id === rosterModal.id && !m.left_at).map((m: any) => (
                  <div key={m.id} className='flex items-center justify-between p-4 hover:bg-white/5 group transition-colors'>
                    <div>
                      <div className='font-bold text-white text-sm'>{m.profiles?.username}</div>
                      <div className='text-xs text-zinc-500 mt-0.5'>{m.leagues?.name} ({m.seasons?.name})</div>
                    </div>
                    <div className='flex items-center gap-4'>
                      <div className='text-xs text-emerald-400 font-mono'>{new Date(m.joined_at).toLocaleDateString('tr-TR')}</div>
                      <button onClick={() => handleRemovePlayer(m)} className='text-red-400 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded transition-all' title='Kadro Dışı Bırak'>
                        <Trash2 className='w-4 h-4' />
                      </button>
                    </div>
                  </div>
                ))}
                {initialMemberships.filter((m:any) => m.team_id === rosterModal.id && !m.left_at).length === 0 && (
                  <div className='p-8 text-center text-zinc-500 text-sm'>BU TAKIMDA HENÜZ OYUNCU YOK</div>
                )}
              </div>
              
              <div className='p-4 border-y border-white/5 bg-[#060d18] mt-4'>
                <h3 className='text-xs font-bold text-zinc-500 uppercase tracking-widest'>GEÇMİŞ OYUNCULAR (HİSTORİCAL)</h3>
              </div>
              <div className='divide-y divide-white/5 opacity-60'>
                {initialMemberships.filter((m:any) => m.team_id === rosterModal.id && m.left_at).map((m: any) => (
                  <div key={m.id} className='flex items-center justify-between p-4'>
                    <div>
                      <div className='font-bold text-zinc-300 text-sm'>{m.profiles?.username}</div>
                      <div className='text-xs text-zinc-500 mt-0.5'>{m.leagues?.name} ({m.seasons?.name})</div>
                    </div>
                    <div className='text-[10px] text-zinc-500 font-mono text-right'>
                      <div>G: {new Date(m.joined_at).toLocaleDateString('tr-TR')}</div>
                      <div>Ç: {new Date(m.left_at).toLocaleDateString('tr-TR')}</div>
                    </div>
                  </div>
                ))}
                {initialMemberships.filter((m:any) => m.team_id === rosterModal.id && m.left_at).length === 0 && (
                  <div className='p-8 text-center text-zinc-700 text-sm'>Geçmiş oyuncu kaydı yok.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logo Modal */}
      {logoModal && (
        <div className='fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <h2 className='text-sm font-black text-white tracking-widest uppercase'>LOGO YÜKLE</h2>
              <button onClick={() => setLogoModal(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleUploadLogo} className='p-6 space-y-6'>
              <div className='flex flex-col items-center gap-4'>
                <div className='w-24 h-24 rounded-2xl border-2 border-dashed border-white/20 bg-[#060d18] flex items-center justify-center overflow-hidden'>
                  {logoModal.logo_url ? <img src={logoModal.logo_url} className='w-full h-full object-cover' /> : <Upload className='w-8 h-8 text-zinc-600' />}
                </div>
                <div className='w-full'>
                  <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2'>Yeni Logo (Max 5MB)</label>
                  <input type='file' name='file' accept='image/jpeg,image/png,image/webp' required className='w-full text-xs text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-pink-500/10 file:text-pink-400 hover:file:bg-pink-500/20' />
                </div>
              </div>
              <div className='flex gap-2 pt-2'>
                <button type='button' onClick={() => setLogoModal(null)} className='flex-1 py-2 bg-white/5 text-white rounded-lg text-xs font-bold'>İPTAL</button>
                <button type='submit' disabled={loading} className='flex-1 py-2 bg-pink-500 hover:bg-pink-400 text-black rounded-lg text-xs font-black flex justify-center items-center gap-2 disabled:opacity-50'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} YÜKLE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className='fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden'>
            <div className={'flex p-4 border-b border-white/5 ' + (confirmModal.type === 'danger' ? 'bg-red-500/10' : confirmModal.type === 'warning' ? 'bg-amber-500/10' : 'bg-[#0a1628]')}>
              <h2 className={'text-sm font-black tracking-widest ' + (confirmModal.type === 'danger' ? 'text-red-400' : confirmModal.type === 'warning' ? 'text-amber-400' : 'text-cyan-400')}>
                {confirmModal.title}
              </h2>
            </div>
            <div className='p-6'>
              <p className='text-sm text-zinc-300 leading-relaxed mb-6'>{confirmModal.message}</p>
              <div className='flex gap-2'>
                <button onClick={closeConfirm} className='flex-1 py-2.5 bg-white/5 text-white rounded-lg text-xs font-bold'>Vazgeç</button>
                <button onClick={confirmModal.action} disabled={loading} className={'flex-1 py-2.5 rounded-lg text-xs font-black flex justify-center items-center gap-2 ' + (confirmModal.type === 'danger' ? 'bg-red-500 text-white' : confirmModal.type === 'warning' ? 'bg-amber-500 text-black' : 'bg-cyan-500 text-black')}>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} Onayla
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

