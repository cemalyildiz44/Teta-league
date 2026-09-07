
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Search, Plus, Filter, Edit2, Shield, Users,
  CheckCircle2, Trash2, AlertTriangle, X, Loader2, BookOpen, Upload
} from 'lucide-react';
import { 
  createLeague, editLeague, 
  updateLeagueStatus, assignTeamToLeague, removeTeamFromLeague 
} from './actions';
import { LeagueRulesModal } from './LeagueRulesModal';
import imageCompression from 'browser-image-compression';

export function LeaguesManager({ initialLeagues, seasons, allTeams, initialLeagueTeams }: any) {
  const router = useRouter();
  const [leagues, setLeagues] = useState(initialLeagues);
  const [leagueTeams, setLeagueTeams] = useState(initialLeagueTeams);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  
  useEffect(() => {
    setLeagues(initialLeagues);
    setLeagueTeams(initialLeagueTeams);
  }, [initialLeagues, initialLeagueTeams]);

  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [rulesModal, setRulesModal] = useState<any>(null);
  const [manageTeamsModal, setManageTeamsModal] = useState<any>(null);
  const [assignTeamModal, setAssignTeamModal] = useState<any>(null); // holds league info

  // League Image States
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

  const filtered = leagues.filter((l: any) => {
    const s = l.name.toLowerCase().includes(search.toLowerCase());
    const f = filter === 'ALL' || l.status === filter;
    return s && f;
  });

  const totalLeagues = leagues.length;
  const activeLeagues = leagues.filter((l: any) => l.status === 'ACTIVE').length;
  const totalTeams = leagueTeams.length;
  
  // Empty Slots (kapasite)
  let totalCapacity = 0;
  let usedCapacity = 0;
  leagues.forEach((l: any) => {
    if (l.max_teams) {
      totalCapacity += l.max_teams;
      usedCapacity += leagueTeams.filter((lt: any) => lt.league_id === l.id).length;
    }
  });
  const emptySlots = totalCapacity > 0 ? (totalCapacity - usedCapacity) : 'Sınırsız';

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };

  const closeConfirm = () => setConfirmModal({ ...confirmModal, isOpen: false });

  // Image compression and selection handler
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

    showFeedback('Görsel optimize ediliyor...', 'success');

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
      showFeedback('Görsel optimize edildi.', 'success');
    } catch (err) {
      showFeedback('Görsel optimize edilirken hata oluştu.', 'error');
    } finally {
      if (isEdit) setEditOptimizing(false);
      else setCreateOptimizing(false);
    }
  };

  // Handlers
  const handleCreate = async (e: any) => {
    e.preventDefault();
    if (createOptimizing) {
      showFeedback('Lütfen görsel optimizasyonunun tamamlanmasını bekleyin.', 'error');
      return;
    }
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    if (createImageFile) {
      formData.append('image_file', createImageFile, createImageFile.name || 'league.webp');
    }
    const res = await createLeague(formData);
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
      showFeedback('Lütfen görsel optimizasyonunun tamamlanmasını bekleyin.', 'error');
      return;
    }
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    if (editImageFile) {
      formData.append('image_file', editImageFile, editImageFile.name || 'league.webp');
    }
    if (editRemoveImage) {
      formData.append('remove_image', 'true');
    }
    const res = await editLeague(formData);
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

  const handleStatus = (l: any) => {
    const isDeactivating = l.status === 'ACTIVE';
    setConfirmModal({
      isOpen: true,
      title: isDeactivating ? 'Ligi Pasif Yap' : 'Ligi Aktif Yap',
      message: isDeactivating 
        ? 'Bu ligi pasif (INACTIVE) yapmak istediğinize emin misiniz? Ligdeki takımlar, maçlar ve fikstür verileri SİLİNMEYECEKTİR, sadece lig durumu değişecektir.' 
        : 'Bu ligi aktif yapmak istediğinize emin misiniz?',
      type: isDeactivating ? 'warning' : 'info',
      action: async () => {
        setLoading(true);
        const res = await updateLeagueStatus(l.id, isDeactivating ? 'INACTIVE' : 'ACTIVE');
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || "", "success"); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  const handleAssignTeam = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const res = await assignTeamToLeague(assignTeamModal.id, assignTeamModal.season_id, formData.get('team_id') as string);
    if (res.error) showFeedback(res.error, 'error');
    else { 
      showFeedback(res.success || "", "success"); 
      setAssignTeamModal(null);
      router.refresh(); 
    }
    setLoading(false);
  };

  const handleRemoveTeam = (lt: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Takımı Ligden Çıkar',
      message: lt.teams.name + ' adlı takımı bu ligden çıkarmak istediğinize emin misiniz? Takımın bu ligde verisi varsa işlem engellenecektir.',
      type: 'danger',
      action: async () => {
        setLoading(true);
        const res = await removeTeamFromLeague(lt.league_id, lt.team_id);
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || "", "success"); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: any = {
      ACTIVE: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
      UPCOMING: 'bg-amber-500/10 text-amber-400 ring-amber-500/30',
      INACTIVE: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30',
    };
    return <span className={'inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold ring-1 inset-ring ' + (styles[status] || styles.INACTIVE)}>{status}</span>;
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
          <p className='text-xs text-zinc-400 font-medium mb-1'>TOPLAM LİG</p>
          <p className='text-2xl font-black text-white'>{totalLeagues}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-emerald-400 font-medium mb-1'>AKTİF LİG</p>
          <p className='text-2xl font-black text-white'>{activeLeagues}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-cyan-400 font-medium mb-1'>TOPLAM TAKIM</p>
          <p className='text-2xl font-black text-white'>{totalTeams}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-amber-400 font-medium mb-1'>BOŞ KONTENJAN</p>
          <p className='text-2xl font-black text-white'>{emptySlots}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className='flex flex-col md:flex-row gap-4 items-start md:items-center justify-between'>
        <div className='flex items-center gap-2 w-full md:w-auto'>
          <div className='relative w-full md:w-64'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500' />
            <input 
              type='text' placeholder='Lig Ara...' 
              value={search} onChange={e => setSearch(e.target.value)}
              className='w-full pl-9 pr-4 py-2 bg-[#060d18] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-cyan-500/50'
            />
          </div>
          <div className='flex bg-[#060d18] rounded-lg border border-white/10 p-1'>
            {['ALL', 'ACTIVE', 'INACTIVE', 'UPCOMING'].map(f => (
              <button 
                key={f} onClick={() => setFilter(f)}
                className={'px-3 py-1.5 text-[10px] font-bold rounded-md transition-colors ' + 
                  (filter === f ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300')}
              >
                {f === 'ALL' ? 'TÜMÜ' : f}
              </button>
            ))}
          </div>
        </div>
        
        <button onClick={() => setCreateModal(true)} className='flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg text-sm font-black transition-colors w-full md:w-auto justify-center'>
          <Plus className='w-4 h-4' /> YENİ LİG EKLE
        </button>
      </div>

      {/* Table */}
      <div className='card-surface rounded-xl border border-white/5 overflow-x-auto'>
        <table className='w-full text-left text-sm text-zinc-400'>
          <thead className='bg-[#0a1628] border-b border-white/5 text-xs uppercase font-black text-cyan-400'>
            <tr>
              <th className='px-4 py-4'>Lig</th>
              <th className='px-4 py-4'>Sezon</th>
              <th className='px-4 py-4'>Seviye</th>
              <th className='px-4 py-4'>Durum</th>
              <th className='px-4 py-4'>Takım</th>
              <th className='px-4 py-4 text-right'>İşlemler</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-white/5'>
            {filtered.map((l: any) => {
              const count = leagueTeams.filter((lt: any) => lt.league_id === l.id).length;
              return (
                <tr key={l.id} className='hover:bg-white/5 transition-colors group'>
                  <td className='px-4 py-4'>
                    <div className='flex items-center gap-3'>
                      <div className='w-8 h-8 rounded-lg border border-white/10 bg-[#060d18] overflow-hidden flex items-center justify-center shrink-0'>
                        {l.image_url ? (
                          <img src={l.image_url} alt={l.name} className='w-full h-full object-contain' />
                        ) : (
                          <Shield className='w-4 h-4 text-zinc-600' />
                        )}
                      </div>
                      <Link href={'/admin/leagues/' + l.id} className='font-bold text-white hover:text-cyan-400 transition-colors'>
                        {l.name}
                      </Link>
                    </div>
                  </td>
                  <td className='px-4 py-4'>{l.seasons?.name}</td>
                  <td className='px-4 py-4'>{l.level}. Seviye</td>
                  <td className='px-4 py-4'><StatusBadge status={l.status} /></td>
                  <td className='px-4 py-4 font-mono text-xs text-white'>
                    {count} {l.max_teams ? '/ ' + l.max_teams : ''}
                  </td>
                  <td className='px-4 py-4'>
                    <div className='flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                      <button onClick={() => setManageTeamsModal(l)} className='p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 rounded-md text-indigo-400' title='Takımları Yönet'>
                        <Users className='w-4 h-4' />
                      </button>
                      <button onClick={() => setRulesModal(l)} className='p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-zinc-300' title='Kurallar'>
                        <BookOpen className='w-4 h-4' />
                      </button>
                      <button 
                        onClick={() => {
                          setEditData(l);
                          setEditImagePreview(l.image_url || null);
                          setEditImageFile(null);
                          setEditRemoveImage(false);
                        }} 
                        className='p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-zinc-300' 
                        title='Düzenle'
                      >
                        <Edit2 className='w-4 h-4' />
                      </button>
                      <button onClick={() => handleStatus(l)} className='p-1.5 bg-amber-500/10 hover:bg-amber-500/20 rounded-md text-amber-400' title='Durum Değiştir'>
                        <Shield className='w-4 h-4' />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className='px-4 py-12 text-center text-zinc-500'>
                  {leagues.length === 0 ? 'Henüz lig oluşturulmadı.' : 'Kriterlere uygun lig bulunamadı.'}
                </td>
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
              <h2 className='text-sm font-black text-white tracking-widest'>YENİ LİG EKLE</h2>
              <button onClick={() => setCreateModal(false)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleCreate} className='p-6 space-y-4'>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Lig Adı</label>
                <input name='name' required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Sezon</label>
                <select name='season_id' required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm'>
                  <option value=''>Seçiniz...</option>
                  {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
                </select>
              </div>

              {/* Lig Görseli */}
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>
                  Lig Görseli
                </label>
                {createImagePreview ? (
                  <div className='flex items-center gap-4 p-3 bg-[#060d18] border border-white/10 rounded-xl'>
                    <div className='w-14 h-14 rounded-lg bg-black/50 border border-cyan-500/30 overflow-hidden flex items-center justify-center shrink-0'>
                      <img src={createImagePreview} alt='Önizleme' className='w-full h-full object-contain' />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='text-xs font-bold text-white truncate'>Görsel Seçildi</p>
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
                        {createOptimizing ? 'Görsel optimize ediliyor...' : 'Görsel Seç veya Yükle'}
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

              <div className='flex gap-4'>
                <div className='flex-1'>
                  <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Seviye</label>
                  <input name='level' type='number' min={1} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
                </div>
                <div className='flex-1'>
                  <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Kapasite</label>
                  <input name='max_teams' type='number' min={2} placeholder='12' className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
                </div>
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Durum</label>
                <select name='status' className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm'>
                  <option value='UPCOMING'>YAKLAŞAN (UPCOMING)</option>
                  <option value='ACTIVE'>AKTİF (ACTIVE)</option>
                  <option value='INACTIVE'>PASİF (INACTIVE)</option>
                </select>
              </div>
              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => setCreateModal(false)} className='flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors'>İPTAL</button>
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
              <h2 className='text-sm font-black text-white tracking-widest'>LİGİ DÜZENLE</h2>
              <button onClick={() => setEditData(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleEdit} className='p-6 space-y-4'>
              <input type='hidden' name='id' value={editData.id} />
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Lig Adı</label>
                <input name='name' defaultValue={editData.name} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
              </div>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Sezon</label>
                <select name='season_id' defaultValue={editData.season_id} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm'>
                  {seasons.map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}
                </select>
                <p className='text-[10px] text-amber-500 mt-1'>Sezon değiştirmek lig ilişkilerini etkileyebilir, dikkatli olun.</p>
              </div>

              {/* Lig Görseli */}
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>
                  Lig Görseli
                </label>
                {editImagePreview && !editRemoveImage ? (
                  <div className='flex items-center gap-4 p-3 bg-[#060d18] border border-white/10 rounded-xl'>
                    <div className='w-14 h-14 rounded-lg bg-black/50 border border-cyan-500/30 overflow-hidden flex items-center justify-center shrink-0'>
                      <img src={editImagePreview} alt='Önizleme' className='w-full h-full object-contain' />
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='text-xs font-bold text-white truncate'>Mevcut Görsel</p>
                      <p className='text-[10px] text-cyan-400'>
                        {editImageFile ? 'Yeni görsel optimize edildi' : 'Kayıtlı görsel'}
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
                        {editOptimizing ? 'Görsel optimize ediliyor...' : 'Görsel Seç veya Yükle'}
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

              <div className='flex gap-4'>
                <div className='flex-1'>
                  <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Seviye</label>
                  <input name='level' type='number' defaultValue={editData.level} min={1} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
                </div>
                <div className='flex-1'>
                  <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Kapasite</label>
                  <input name='max_teams' type='number' defaultValue={editData.max_teams || ''} min={2} className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
                </div>
              </div>
              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => setEditData(null)} className='flex-1 py-2 bg-white/5 text-white rounded-lg text-xs font-bold'>İPTAL</button>
                <button type='submit' disabled={loading || editOptimizing} className='flex-1 py-2 bg-cyan-500 text-black rounded-lg text-xs font-black flex justify-center items-center gap-2'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} GÜNCELLE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Teams Modal */}
      {manageTeamsModal && !assignTeamModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-lg rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-[80vh]'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <div>
                <h2 className='text-sm font-black text-white tracking-widest'>TAKIMLARI YÖNET</h2>
                <p className='text-xs text-cyan-400'>{manageTeamsModal.name}</p>
              </div>
              <button onClick={() => setManageTeamsModal(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <div className='p-4 border-b border-white/5 flex justify-between items-center'>
              <span className='text-sm text-zinc-400'>
                Kayıtlı: {leagueTeams.filter((lt:any) => lt.league_id === manageTeamsModal.id).length}
                {manageTeamsModal.max_teams && ' / ' + manageTeamsModal.max_teams}
              </span>
              <button onClick={() => setAssignTeamModal(manageTeamsModal)} className='bg-cyan-500 hover:bg-cyan-400 text-black px-3 py-1.5 rounded text-xs font-black flex items-center gap-2'>
                <Plus className='w-3 h-3' /> TAKIM ATA
              </button>
            </div>
            <div className='flex-1 overflow-y-auto p-2'>
              {leagueTeams.filter((lt:any) => lt.league_id === manageTeamsModal.id).map((lt: any) => (
                <div key={lt.team_id} className='flex items-center justify-between p-3 hover:bg-white/5 rounded-lg group'>
                  <div className='flex items-center gap-3'>
                    <div className='w-8 h-8 bg-[#0a1628] rounded-full border border-white/10 overflow-hidden flex items-center justify-center'>
                      {lt.teams.logo_url ? <img src={lt.teams.logo_url} className='w-full h-full object-cover' /> : <Shield className='w-4 h-4 text-zinc-500'/>}
                    </div>
                    <span className='text-sm font-bold text-white'>{lt.teams.name}</span>
                  </div>
                  <button onClick={() => handleRemoveTeam(lt)} className='text-red-400 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded transition-all' title='Çıkar'>
                    <Trash2 className='w-4 h-4' />
                  </button>
                </div>
              ))}
              {leagueTeams.filter((lt:any) => lt.league_id === manageTeamsModal.id).length === 0 && (
                <div className='p-8 text-center text-zinc-500 text-sm'>Bu ligde henüz takım bulunmuyor.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assign Team Modal */}
      {assignTeamModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden flex flex-col'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <h2 className='text-sm font-black text-white tracking-widest'>TAKIM ATA</h2>
              <button onClick={() => setAssignTeamModal(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleAssignTeam} className='p-6 space-y-4'>
              <p className='text-xs text-zinc-400 mb-4'>Lütfen <strong className='text-cyan-400'>{assignTeamModal.name}</strong> ligine atamak istediğiniz takımı seçin.</p>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Takım</label>
                <select name='team_id' required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
                  <option value=''>Seçiniz...</option>
                  {allTeams.map((t: any) => {
                    const alreadyInLeague = leagueTeams.find((lt:any) => lt.league_id === assignTeamModal.id && lt.team_id === t.id);
                    return <option key={t.id} value={t.id} disabled={!!alreadyInLeague}>{t.name} {alreadyInLeague ? '(Zaten Ekli)' : ''}</option>
                  })}
                </select>
              </div>
              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => setAssignTeamModal(null)} className='flex-1 py-2 bg-white/5 text-white rounded-lg text-xs font-bold'>İPTAL</button>
                <button type='submit' disabled={loading} className='flex-1 py-2 bg-cyan-500 text-black rounded-lg text-xs font-black flex justify-center items-center gap-2'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} ATA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal.isOpen && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
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

      {rulesModal && <LeagueRulesModal league={rulesModal} onClose={() => setRulesModal(null)} />}
    </div>
  );
}

