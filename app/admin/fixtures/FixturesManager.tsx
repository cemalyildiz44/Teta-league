
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Search, Plus, Calendar, Shield, X, AlertTriangle, CheckCircle2, Loader2, Trash2, Edit2, Play
} from 'lucide-react';
import { 
  generateLeagueFixturesAction, updateFixtureDateAction, cancelFixtureAction, deleteFixtureAction
} from './actions';

export function FixturesManager({ initialFixtures, seasons, leagues, leagueTeams, teams }: any) {
  const router = useRouter();
  const [fixtures, setFixtures] = useState(initialFixtures);
  useEffect(() => { setFixtures(initialFixtures); }, [initialFixtures]);

  const [filterSeason, setFilterSeason] = useState(seasons[0]?.id || '');
  const [filterLeague, setFilterLeague] = useState('ALL');
  
  // Modals
  const [createModal, setCreateModal] = useState(false);
  const [dateModal, setDateModal] = useState<any>(null); // holds fixture info
  const [confirmModal, setConfirmModal] = useState<any>({ isOpen: false });
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const showFeedback = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 5000);
  };
  const closeConfirm = () => setConfirmModal({ ...confirmModal, isOpen: false });

  // Filtered
  const filteredFixtures = useMemo(() => {
    return fixtures.filter((f: any) => {
      if (filterSeason && f.season_id !== filterSeason) return false;
      if (filterLeague !== 'ALL' && f.league_id !== filterLeague) return false;
      return true;
    });
  }, [fixtures, filterSeason, filterLeague]);

  const total = fixtures.length;
  const scheduled = fixtures.filter((f:any) => f.status === 'SCHEDULED').length;
  const completed = fixtures.filter((f:any) => f.status === 'COMPLETED').length;
  const cancelled = fixtures.filter((f:any) => f.status === 'CANCELLED').length;

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: any = {
      SCHEDULED: 'bg-cyan-500/10 text-cyan-400 ring-cyan-500/30',
      COMPLETED: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30',
      CANCELLED: 'bg-red-500/10 text-red-400 ring-red-500/30'
    };
    return <span className={'inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold ring-1 inset-ring ' + (styles[status] || 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30')}>{status}</span>;
  };

  // Group by week for display
  const weeks = Array.from(new Set(filteredFixtures.map((f:any) => f.week_number))).sort((a:any, b:any) => a - b);

  // Date Modal Handler
  const handleUpdateDate = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await updateFixtureDateAction(dateModal.id, fd.get('scheduled_at') as string);
    if (res.error) showFeedback(res.error, 'error');
    else { showFeedback(res.success || '', 'success'); setDateModal(null); router.refresh(); }
    setLoading(false);
  };

  // Cancel Handler
  const handleCancel = (f: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Fikstürü İptal Et',
      message: 'Hafta ' + f.week_number + ' - ' + f.home?.name + ' vs ' + f.away?.name + ' karşılaşmasını iptal etmek istediğinize emin misiniz?',
      type: 'warning',
      action: async () => {
        setLoading(true);
        const res = await cancelFixtureAction(f.id);
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || '', 'success'); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
  };

  const handleDelete = (f: any) => {
    setConfirmModal({
      isOpen: true,
      title: 'Fikstürü Sil',
      message: 'Hafta ' + f.week_number + ' - ' + f.home?.name + ' vs ' + f.away?.name + ' fikstürünü tamamen silmek istiyorsunuz. Bu fikstüre bağlı maç varsa silinemez.',
      type: 'danger',
      action: async () => {
        setLoading(true);
        const res = await deleteFixtureAction(f.id);
        if (res.error) showFeedback(res.error, 'error');
        else { showFeedback(res.success || '', 'success'); router.refresh(); }
        setLoading(false);
        closeConfirm();
      }
    });
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
          <p className='text-xs text-zinc-400 font-medium mb-1'>TOPLAM FİKSTÜR</p>
          <p className='text-2xl font-black text-white'>{total}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-cyan-400 font-medium mb-1'>PLANLANMIŞ</p>
          <p className='text-2xl font-black text-white'>{scheduled}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-emerald-400 font-medium mb-1'>TAMAMLANAN</p>
          <p className='text-2xl font-black text-white'>{completed}</p>
        </div>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <p className='text-xs text-red-400 font-medium mb-1'>İPTAL EDİLEN</p>
          <p className='text-2xl font-black text-white'>{cancelled}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className='flex flex-col md:flex-row gap-4 items-start md:items-center justify-between'>
        <div className='flex items-center gap-4 w-full md:w-auto'>
          <select value={filterSeason} onChange={e => { setFilterSeason(e.target.value); setFilterLeague('ALL'); }} className='bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
            {seasons.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filterLeague} onChange={e => setFilterLeague(e.target.value)} className='bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
            <option value='ALL'>Tüm Ligler</option>
            {leagues.filter((l:any) => l.season_id === filterSeason).map((l:any) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        
        <button onClick={() => setCreateModal(true)} className='flex items-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-lg text-sm font-black transition-colors w-full md:w-auto justify-center'>
          <Play className='w-4 h-4' /> FİKSTÜR OLUŞTUR
        </button>
      </div>

      {/* Main Fixtures View */}
      {filteredFixtures.length === 0 ? (
        <div className='card-surface p-12 rounded-xl border border-white/5 flex flex-col items-center justify-center text-center'>
          <Calendar className='w-12 h-12 text-zinc-600 mb-4' />
          <h3 className='text-lg font-black text-white mb-2 tracking-widest'>HENÜZ FİKSTÜR OLUŞTURULMADI</h3>
          <p className='text-sm text-zinc-400 max-w-md'>Seçilen sezon ve lig için fikstür bulunamadı. Hemen yeni bir fikstür jeneratörü başlatabilirsiniz.</p>
          <button onClick={() => setCreateModal(true)} className='mt-6 flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors'>
            <Plus className='w-4 h-4' /> FİKSTÜR OLUŞTUR
          </button>
        </div>
      ) : (
        <div className='space-y-6'>
          {weeks.map((week: any) => {
            const weekFixtures = filteredFixtures.filter((f:any) => f.week_number === week);
            return (
              <div key={week as any} className='card-surface rounded-xl border border-white/5 overflow-hidden'>
                <div className='px-4 py-3 border-b border-white/5 bg-[#0a1628] flex items-center justify-between'>
                  <h3 className='text-xs font-black text-cyan-400 tracking-widest uppercase'>HAFTA {week as any}</h3>
                  <span className='text-[10px] font-bold text-zinc-500'>{weekFixtures.length} Maç</span>
                </div>
                <div className='divide-y divide-white/5'>
                  {weekFixtures.map((f:any) => (
                    <div key={f.id} className='p-4 hover:bg-white/5 transition-colors flex flex-col md:flex-row items-center justify-between gap-4 group'>
                      <div className='flex items-center flex-1 gap-6'>
                        <div className='flex items-center gap-3 w-40 justify-end'>
                          <span className='font-bold text-white text-sm truncate'>{f.home?.name || 'BYE'}</span>
                          <div className='w-8 h-8 rounded-full border border-white/10 bg-[#060d18] overflow-hidden flex items-center justify-center shrink-0'>
                            {f.home?.logo_url ? <img src={f.home.logo_url} className='w-full h-full object-cover' /> : <Shield className='w-4 h-4 text-zinc-600' />}
                          </div>
                        </div>
                        <div className='flex flex-col items-center justify-center w-24'>
                          <span className='text-[10px] font-mono text-zinc-500 mb-1'>{new Date(f.scheduled_at).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}</span>
                          <span className='text-xs font-black text-zinc-600'>VS</span>
                          <span className='text-[10px] font-mono text-zinc-500 mt-1'>{new Date(f.scheduled_at).toLocaleDateString('tr-TR')}</span>
                        </div>
                        <div className='flex items-center gap-3 w-40'>
                          <div className='w-8 h-8 rounded-full border border-white/10 bg-[#060d18] overflow-hidden flex items-center justify-center shrink-0'>
                            {f.away?.logo_url ? <img src={f.away.logo_url} className='w-full h-full object-cover' /> : <Shield className='w-4 h-4 text-zinc-600' />}
                          </div>
                          <span className='font-bold text-white text-sm truncate'>{f.away?.name || 'BYE'}</span>
                        </div>
                      </div>
                      
                      <div className='flex items-center gap-4 md:w-auto w-full justify-between md:justify-end'>
                        <StatusBadge status={f.status} />
                        <div className='flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity'>
                          <button onClick={() => setDateModal(f)} className='p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-zinc-300' title='Tarihi Değiştir'>
                            <Calendar className='w-4 h-4' />
                          </button>
                          {f.status !== 'CANCELLED' && (
                            <button onClick={() => handleCancel(f)} className='p-1.5 bg-amber-500/10 hover:bg-amber-500/20 rounded-md text-amber-400' title='İptal Et'>
                              <X className='w-4 h-4' />
                            </button>
                          )}
                          <button onClick={() => handleDelete(f)} className='p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-md text-red-400' title='Tamamen Sil'>
                            <Trash2 className='w-4 h-4' />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {createModal && <CreateFixtureModal 
        onClose={() => setCreateModal(false)} 
        seasons={seasons} 
        leagues={leagues} 
        leagueTeams={leagueTeams} 
        teams={teams}
        fixtures={fixtures}
        onSuccess={(msg:string) => { showFeedback(msg, 'success'); setCreateModal(false); router.refresh(); }}
        onError={(msg:string) => showFeedback(msg, 'error')}
      />}

      {/* Date Modal */}
      {dateModal && (
        <div className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-sm rounded-2xl border border-white/10 overflow-hidden'>
            <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
              <h2 className='text-sm font-black text-white tracking-widest'>TARİHİ DEĞİŞTİR</h2>
              <button onClick={() => setDateModal(null)} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
            </div>
            <form onSubmit={handleUpdateDate} className='p-6 space-y-4'>
              <p className='text-xs text-zinc-400'>
                <strong className='text-white'>Hafta {dateModal.week_number}</strong><br/>
                {dateModal.home?.name} vs {dateModal.away?.name}
              </p>
              <div>
                <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Yeni Tarih ve Saat</label>
                <input name='scheduled_at' type='datetime-local' defaultValue={new Date(dateModal.scheduled_at).toISOString().slice(0,16)} required className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
              </div>
              <div className='pt-4 flex gap-2'>
                <button type='button' onClick={() => setDateModal(null)} className='flex-1 py-2 bg-white/5 text-white rounded-lg text-xs font-bold'>İPTAL</button>
                <button type='submit' disabled={loading} className='flex-1 py-2 bg-cyan-500 text-black rounded-lg text-xs font-black flex justify-center items-center gap-2'>
                  {loading && <Loader2 className='w-4 h-4 animate-spin' />} GÜNCELLE
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
    </div>
  );
}

// Separate component for Create Modal to handle local state (preview)
function CreateFixtureModal({ onClose, seasons, leagues, leagueTeams, teams, fixtures, onSuccess, onError }: any) {
  const [seasonId, setSeasonId] = useState(seasons[0]?.id || '');
  const [leagueId, setLeagueId] = useState('');
  const [doubleRound, setDoubleRound] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);

  const availableLeagues = leagues.filter((l:any) => l.season_id === seasonId);
  const teamCount = leagueTeams.filter((lt:any) => lt.league_id === leagueId).length;
  const existingFixtures = fixtures.filter((f:any) => f.season_id === seasonId && f.league_id === leagueId).length;

  // Simple local generator for preview
  function generatePreview() {
    if (teamCount < 2) return [];
    const participants = leagueTeams.filter((lt:any) => lt.league_id === leagueId).map((lt:any) => lt.team_id);
    if (participants.length % 2 !== 0) participants.push('BYE');
    const rounds = participants.length - 1;
    let totalRounds = doubleRound ? rounds * 2 : rounds;
    return totalRounds;
  }

  const handleCreate = async () => {
    if (teamCount < 2) { onError('En az 2 aktif takım gerekiyor.'); return; }
    if (existingFixtures > 0) { onError('Bu lig için mevcut fikstür bulunuyor.'); return; }
    if (!startDate) { onError('Başlangıç tarihi zorunludur.'); return; }

    setLoading(true);
    const res = await generateLeagueFixturesAction(seasonId, leagueId, startDate, doubleRound);
    if (res.error) onError(res.error);
    else onSuccess(res.success || '');
    setLoading(false);
  };

  return (
    <div className='fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
      <div className='card-surface w-full max-w-lg rounded-2xl border border-white/10 overflow-hidden flex flex-col max-h-[90vh]'>
        <div className='flex justify-between items-center p-4 border-b border-white/5 bg-[#0a1628]'>
          <h2 className='text-sm font-black text-white tracking-widest'>YENİ FİKSTÜR OLUŞTUR</h2>
          <button onClick={onClose} className='text-zinc-400 hover:text-white'><X className='w-5 h-5'/></button>
        </div>
        
        {!confirmStep ? (
          <div className='p-6 space-y-4 overflow-y-auto'>
            <div>
              <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Sezon</label>
              <select value={seasonId} onChange={e => { setSeasonId(e.target.value); setLeagueId(''); }} className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
                {seasons.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>Lig</label>
              <select value={leagueId} onChange={e => setLeagueId(e.target.value)} className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
                <option value=''>Lig Seçin...</option>
                {availableLeagues.map((l:any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>

            {leagueId && (
              <div className='p-4 rounded-lg bg-[#060d18] border border-white/5 space-y-4'>
                <div className='flex justify-between items-center'>
                  <span className='text-xs font-bold text-zinc-400'>AKTİF TAKIM SAYISI:</span>
                  <span className={'text-sm font-black ' + (teamCount < 2 ? 'text-red-400' : 'text-emerald-400')}>{teamCount}</span>
                </div>
                {teamCount < 2 && <p className='text-[10px] text-red-400 font-bold'>Fikstür oluşturmak için ligde en az 2 aktif takım bulunmalıdır.</p>}
                
                {existingFixtures > 0 && (
                  <div className='flex items-center gap-2 text-amber-400 bg-amber-500/10 p-2 rounded-md'>
                    <AlertTriangle className='w-4 h-4' />
                    <span className='text-xs font-bold'>Bu lig için zaten fikstür oluşturulmuş!</span>
                  </div>
                )}
                
                {teamCount >= 2 && existingFixtures === 0 && (
                  <>
                    <div className='pt-2 border-t border-white/5'>
                      <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2'>Sistem</label>
                      <div className='flex gap-4'>
                        <label className='flex items-center gap-2 text-sm text-zinc-300 cursor-pointer'>
                          <input type='radio' checked={!doubleRound} onChange={() => setDoubleRound(false)} className='accent-cyan-500' />
                          Tek Devre
                        </label>
                        <label className='flex items-center gap-2 text-sm text-zinc-300 cursor-pointer'>
                          <input type='radio' checked={doubleRound} onChange={() => setDoubleRound(true)} className='accent-cyan-500' />
                          Çift Devre
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className='block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1'>İlk Hafta Başlangıç Tarihi</label>
                      <input type='datetime-local' value={startDate} onChange={e => setStartDate(e.target.value)} className='w-full bg-[#0a1628] border border-white/10 rounded-lg px-3 py-2 text-white text-sm' />
                    </div>
                    
                    {startDate && (
                      <div className='p-3 bg-cyan-500/10 rounded-lg text-cyan-400 text-xs mt-2 font-medium'>
                        <strong>ÖN İZLEME:</strong> {generatePreview()} haftalık bir fikstür ağacı oluşturulacak ve 1. Hafta maçları {new Date(startDate).toLocaleDateString('tr-TR')} tarihinde başlayacak şekilde (+7 gün) dizilecektir.
                      </div>
                    )}
                  </  >
                )}
              </div>
            )}

            <div className='pt-4 flex gap-2'>
              <button onClick={onClose} className='flex-1 py-2 bg-white/5 text-white rounded-lg text-xs font-bold'>İPTAL</button>
              <button 
                onClick={() => setConfirmStep(true)} 
                disabled={teamCount < 2 || existingFixtures > 0 || !leagueId || !startDate} 
                className='flex-1 py-2 bg-cyan-500 text-black rounded-lg text-xs font-black disabled:opacity-50 flex justify-center items-center gap-2'>
                DEVAM ET
              </button>
            </div>
          </div>
        ) : (
          <div className='p-6'>
            <div className='mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20'>
              <h3 className='text-amber-400 text-sm font-black mb-2 flex items-center gap-2'>
                <AlertTriangle className='w-4 h-4' /> ONAY GEREKİYOR
              </h3>
              <p className='text-sm text-zinc-300 mb-2'>
                <strong>{availableLeagues.find((l:any)=>l.id === leagueId)?.name}</strong> için <strong>{generatePreview()}</strong> haftalık fikstür oluşturulacak.
              </p>
              <p className='text-xs text-zinc-400'>
                Bu işlem mevcut takımlar alınarak jeneratörden geçirilecektir. Fikstür oluşturmak otomatik maç kayıtları veya istatistikler yaratmaz, sadece maç takvimini (fixture) planlar.
              </p>
            </div>
            <div className='flex gap-2'>
              <button onClick={() => setConfirmStep(false)} className='flex-1 py-2.5 bg-white/5 text-white rounded-lg text-xs font-bold'>Geri</button>
              <button onClick={handleCreate} disabled={loading} className='flex-1 py-2.5 bg-cyan-500 text-black rounded-lg text-xs font-black flex justify-center items-center gap-2'>
                {loading && <Loader2 className='w-4 h-4 animate-spin' />} FİKSTÜRÜ OLUŞTUR
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

