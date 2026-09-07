
'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  Search, Shield, AlertTriangle, CheckCircle2, Loader2, ArrowRight,
  Database, RefreshCw, XCircle, FileCheck2, Info
} from 'lucide-react';
import { fetchEaPreviewAction, importEaMatchAction, EAPreviewMatch } from './actions';
import { useRouter } from 'next/navigation';

export function EAImportManager({ seasons, leagues, recentImports }: any) {
  const router = useRouter();

  const [seasonId, setSeasonId] = useState(seasons.find((s:any)=>s.status==='ACTIVE')?.id || seasons[0]?.id || '');
  const [leagueId, setLeagueId] = useState('');
  const [week, setWeek] = useState<number>(1);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewMatches, setPreviewMatches] = useState<EAPreviewMatch[]>([]);
  
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, match?: EAPreviewMatch, loading: boolean, success: boolean }>({ isOpen: false, loading: false, success: false });

  const availableLeagues = useMemo(() => leagues.filter((l:any) => l.season_id === seasonId), [leagues, seasonId]);

  const handleFetch = async () => {
    if (!leagueId) { setError('Lütfen lig seçin.'); return; }
    setLoading(true);
    setError('');
    setPreviewMatches([]);

    try {
      const res = await fetchEaPreviewAction(leagueId, week);
      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        setPreviewMatches(res.data);
      }
    } catch (e: any) {
      setError('Sunucu ile iletişimde beklenmeyen bir hata oluştu: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!confirmModal.match) return;
    setConfirmModal(prev => ({ ...prev, loading: true }));
    
    // Update local state optimistic
    const targetId = confirmModal.match.ea_match_id;
    setPreviewMatches(prev => prev.map(p => p.ea_match_id === targetId ? { ...p, match_status: 'IMPORTING' as any } : p));
    
    const res = await importEaMatchAction(confirmModal.match, seasonId, leagueId);
    
    if (res.error) {
      setConfirmModal(prev => ({ ...prev, loading: false }));
      setError(res.error);
      setPreviewMatches(prev => prev.map(p => p.ea_match_id === targetId ? { ...p, match_status: 'READY' } : p));
      setConfirmModal({ isOpen: false, loading: false, success: false });
    } else {
      setPreviewMatches(prev => prev.map(p => p.ea_match_id === targetId ? { ...p, match_status: 'IMPORTED' as any } : p));
      setConfirmModal(prev => ({ ...prev, loading: false, success: true }));
      router.refresh();
    }
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'READY': return <span className='px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded ring-1 inset-ring ring-emerald-500/30 flex items-center gap-1 w-fit'><CheckCircle2 className='w-3 h-3'/> İÇE AKTARILABİLİR</span>;
      case 'UNMATCHED': return <span className='px-2 py-1 bg-red-500/10 text-red-400 text-[10px] font-bold rounded ring-1 inset-ring ring-red-500/30 flex items-center gap-1 w-fit'><XCircle className='w-3 h-3'/> TAKIM EŞLEŞMEDİ</span>;
      case 'AMBIGUOUS': return <span className='px-2 py-1 bg-amber-500/10 text-amber-400 text-[10px] font-bold rounded ring-1 inset-ring ring-amber-500/30 flex items-center gap-1 w-fit'><AlertTriangle className='w-3 h-3'/> BELİRSİZ EŞLEŞME</span>;
      case 'DUPLICATE_EA_MATCH': return <span className='px-2 py-1 bg-zinc-500/10 text-zinc-400 text-[10px] font-bold rounded ring-1 inset-ring ring-zinc-500/30 flex items-center gap-1 w-fit'><FileCheck2 className='w-3 h-3'/> ÖNCEDEN EKLENMİŞ</span>;
      case 'FIXTURE_ALREADY_HAS_MATCH': return <span className='px-2 py-1 bg-indigo-500/10 text-indigo-400 text-[10px] font-bold rounded ring-1 inset-ring ring-indigo-500/30 flex items-center gap-1 w-fit'><Database className='w-3 h-3'/> FİKSTÜR DOLU</span>;
      case 'IMPORTED': return <span className='px-2 py-1 bg-cyan-500/10 text-cyan-400 text-[10px] font-bold rounded ring-1 inset-ring ring-cyan-500/30 flex items-center gap-1 w-fit'><CheckCircle2 className='w-3 h-3'/> BAŞARILI</span>;
      case 'IMPORTING': return <span className='px-2 py-1 bg-amber-500/10 text-amber-400 text-[10px] font-bold rounded ring-1 inset-ring ring-amber-500/30 flex items-center gap-1 w-fit'><Loader2 className='w-3 h-3 animate-spin'/> İŞLENİYOR</span>;
      default: return <span className='px-2 py-1 bg-zinc-500/10 text-zinc-400 text-[10px] font-bold rounded ring-1 inset-ring ring-zinc-500/30'>{status}</span>;
    }
  };

  return (
    <div className='flex flex-col lg:flex-row gap-6 items-start'>
      
      {/* LEFT & CENTER PANEL: Fetch & Preview */}
      <div className='flex-1 space-y-6 w-full'>
        
        {/* Fetch Controls */}
        <div className='card-surface p-6 rounded-xl border border-white/5'>
          <h2 className='text-xs font-black text-cyan-400 tracking-widest uppercase mb-4'>VERİ GİRİŞİ (EA API)</h2>
          <div className='flex flex-wrap gap-4 items-end'>
            <div className='flex-1 min-w-[200px]'>
              <label className='block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2'>SEZON</label>
              <select value={seasonId} onChange={e => { setSeasonId(e.target.value); setLeagueId(''); }} className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
                {seasons.map((s:any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className='flex-1 min-w-[200px]'>
              <label className='block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2'>LİG</label>
              <select value={leagueId} onChange={e => setLeagueId(e.target.value)} className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none'>
                <option value=''>Lig Seçin...</option>
                {availableLeagues.map((l:any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className='w-24'>
              <label className='block text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2'>HAFTA</label>
              <input type='number' min='1' max='38' value={week} onChange={e => setWeek(parseInt(e.target.value)||1)} className='w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-cyan-500/50 focus:outline-none text-center' />
            </div>
            <button onClick={handleFetch} disabled={loading || !leagueId} className='px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg text-sm font-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2 h-9'>
              {loading ? <Loader2 className='w-4 h-4 animate-spin' /> : <RefreshCw className='w-4 h-4' />} EA'DEN ÇEK
            </button>
          </div>
        </div>

        {error && (
          <div className='p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-bold flex items-center gap-3'>
            <AlertTriangle className='w-5 h-5 shrink-0' /> {error}
          </div>
        )}

        {/* Previews */}
        {previewMatches.length > 0 && (
          <div className='space-y-4'>
            <h2 className='text-xs font-black text-white tracking-widest uppercase flex items-center gap-2'>
              <Database className='w-4 h-4 text-cyan-500' /> BULUNAN MAÇLAR ({previewMatches.length})
            </h2>
            
            <div className='grid grid-cols-1 gap-6'>
              {previewMatches.map((m, idx) => {
                const totalPlayers = m.home_team.players.length + m.away_team.players.length;
                const unmatched = m.match_status !== 'READY';

                return (
                  <div key={idx} className={'card-surface rounded-xl border overflow-hidden ' + (unmatched ? 'border-red-500/20' : 'border-emerald-500/20')}>
                    
                    {/* Header */}
                    <div className={'p-4 border-b flex flex-wrap items-center justify-between gap-4 ' + (unmatched ? 'bg-red-500/5 border-red-500/10' : 'bg-emerald-500/5 border-emerald-500/10')}>
                      <div className='flex items-center gap-4'>
                        {getStatusDisplay(m.match_status)}
                        <span className='text-xs font-mono text-zinc-500'>ID: {m.ea_match_id}</span>
                        <span className='text-xs font-mono text-zinc-400'>{new Date(m.played_at).toLocaleString('tr-TR')}</span>
                      </div>
                      
                      {m.match_status === 'READY' && (
                        <button onClick={() => setConfirmModal({ isOpen: true, match: m, loading: false, success: false })} className='px-4 py-1.5 bg-emerald-500 text-black text-xs font-black uppercase tracking-widest rounded hover:bg-emerald-400 transition-colors flex items-center gap-2'>
                          İÇE AKTAR <ArrowRight className='w-3 h-3' />
                        </button>
                      )}
                    </div>

                    {/* Match Info */}
                    <div className='p-6 flex flex-col md:flex-row items-center gap-8 justify-center'>
                      <div className='flex-1 flex flex-col items-center gap-2 text-center'>
                        <span className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest'>EV SAHİBİ</span>
                        <span className='text-xl font-black text-white'>{m.home_team.ea_club_name}</span>
                        <span className='text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded'>CLUB ID: {m.home_team.ea_club_id}</span>
                      </div>
                      <div className='flex flex-col items-center justify-center'>
                        <div className='text-4xl font-black text-white px-6 py-2 bg-[#060d18] border border-white/5 rounded-xl shadow-inner flex items-center gap-4'>
                          <span className={m.is_reversed ? 'text-amber-400' : ''}>{m.home_team.score}</span>
                          <span className='text-zinc-600'>-</span>
                          <span className={m.is_reversed ? 'text-amber-400' : ''}>{m.away_team.score}</span>
                        </div>
                        {m.is_reversed && <span className='text-[10px] text-amber-500 mt-2 font-bold'>TERSTEN EŞLEŞTİ</span>}
                      </div>
                      <div className='flex-1 flex flex-col items-center gap-2 text-center'>
                        <span className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest'>DEPLASMAN</span>
                        <span className='text-xl font-black text-white'>{m.away_team.ea_club_name}</span>
                        <span className='text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded'>CLUB ID: {m.away_team.ea_club_id}</span>
                      </div>
                    </div>

                    {/* Stats Summary */}
                    <div className='px-6 py-4 bg-[#060d18] border-t border-white/5 flex flex-wrap gap-6 items-center justify-between'>
                      <div className='flex gap-6'>
                        <div>
                          <p className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest'>Eşleşen Fikstür</p>
                          <p className='text-xs font-bold text-white'>{m.fixture_id ? 'VAR (Hafta ' + week + ')' : 'YOK'}</p>
                        </div>
                        <div>
                          <p className='text-[10px] font-bold text-zinc-500 uppercase tracking-widest'>Oyuncu Verisi</p>
                          <p className='text-xs font-bold text-white'>{totalPlayers} Oyuncu işlenecek</p>
                        </div>
                      </div>
                      
                      {unmatched && m.match_status === 'DUPLICATE_EA_MATCH' && (
                        <div className='text-[10px] font-bold text-zinc-400 flex items-center gap-1'>
                          <Info className='w-3 h-3' /> Bu maç EA verisiyle sistemde zaten kayıtlı.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANEL: System Status & Recent Imports */}
      <div className='w-full lg:w-80 flex flex-col gap-6 shrink-0'>
        <div className='card-surface p-4 rounded-xl border border-white/5'>
          <h3 className='text-xs font-black text-white tracking-widest uppercase mb-4'>IMPORT DURUMU</h3>
          <div className='space-y-3'>
            <div className='flex items-center justify-between'>
              <span className='text-xs text-zinc-400'>API Bağlantısı</span>
              <span className='text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded ring-1 inset-ring ring-emerald-500/30'>AKTİF</span>
            </div>
            <div className='flex items-center justify-between'>
              <span className='text-xs text-zinc-400'>Eşleştirme</span>
              <span className='text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded ring-1 inset-ring ring-emerald-500/30'>AKTİF</span>
            </div>
            <div className='flex items-center justify-between'>
              <span className='text-xs text-zinc-400'>Onay Akışı</span>
              <span className='text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded ring-1 inset-ring ring-amber-500/30'>PENDING_REVIEW</span>
            </div>
          </div>
          <div className='mt-4 p-3 bg-cyan-500/5 rounded-lg border border-cyan-500/10 text-[10px] text-cyan-400 leading-relaxed'>
            EA'den içeri aktarılan maçlar otomatik onaylanmaz. Puan durumuna yansıması için MAÇLAR sekmesinden onaylanmalıdır.
          </div>
        </div>

        <div className='card-surface rounded-xl border border-white/5 overflow-hidden flex flex-col'>
          <div className='p-4 border-b border-white/5 bg-[#0a1628] flex items-center justify-between'>
            <h3 className='text-xs font-black text-white tracking-widest uppercase flex items-center gap-2'>
              <Database className='w-4 h-4 text-emerald-500' /> SON İÇE AKTARILANLAR
            </h3>
          </div>
          <div className='divide-y divide-white/5 p-0'>
            {recentImports && recentImports.length > 0 ? (
              recentImports.map((r:any) => (
                <div key={r.id} className='p-4 hover:bg-white/5 transition-colors'>
                  <div className='flex justify-between items-center mb-2'>
                    <span className='text-[10px] font-bold text-zinc-500'>{new Date(r.played_at).toLocaleDateString('tr-TR')}</span>
                    {r.status === 'APPROVED' ? <CheckCircle2 className='w-3 h-3 text-emerald-500'/> : <AlertTriangle className='w-3 h-3 text-amber-500'/>}
                  </div>
                  <div className='flex justify-between items-center text-xs font-bold text-white'>
                    <span className='truncate max-w-[40%]'>{r.home?.name}</span>
                    <span className='text-cyan-400 px-2 py-0.5 bg-[#060d18] rounded'>{r.home_score} - {r.away_score}</span>
                    <span className='truncate max-w-[40%] text-right'>{r.away?.name}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className='p-6 text-center text-xs text-zinc-500'>Son işlem bulunmuyor.</div>
            )}
          </div>
          <div className='p-4 border-t border-white/5 bg-[#060d18] text-center'>
            <Link href='/admin/matches' className='text-xs font-black text-cyan-400 hover:underline tracking-widest'>MAÇLARI YÖNET</Link>
          </div>
        </div>
      </div>

      {/* CONFIRMATION / IMPORT PROGRESS MODAL */}
      {confirmModal.isOpen && confirmModal.match && (
        <div className='fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm'>
          <div className='card-surface w-full max-w-md rounded-2xl border border-white/10 overflow-hidden flex flex-col'>
            {confirmModal.success ? (
              <div className='p-8 flex flex-col items-center justify-center text-center'>
                <div className='w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-4'>
                  <CheckCircle2 className='w-8 h-8' />
                </div>
                <h2 className='text-xl font-black text-white mb-2'>İÇE AKTARMA BAŞARILI</h2>
                <p className='text-sm text-zinc-400 mb-8'>Maç kaydı ve oyuncu istatistikleri güvenli şekilde veritabanına eklendi.</p>
                <div className='flex gap-3 w-full'>
                  <button onClick={() => setConfirmModal({ isOpen: false, loading: false, success: false })} className='flex-1 py-2 bg-white/5 text-white text-xs font-bold rounded-lg'>KAPAT</button>
                  <Link href='/admin/matches' className='flex-1 py-2 bg-cyan-500 text-black text-xs font-black rounded-lg flex items-center justify-center'>ONAYA GİT</Link>
                </div>
              </div>
            ) : (
              <>
                <div className='p-4 border-b border-white/5 bg-[#0a1628]'>
                  <h2 className='text-sm font-black text-white tracking-widest'>ONAY GEREKİYOR</h2>
                </div>
                <div className='p-6 space-y-6'>
                  <div className='p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl'>
                    <div className='flex items-center gap-3 mb-2 text-emerald-400 font-bold text-sm'>
                      <CheckCircle2 className='w-5 h-5' /> Doğrulamalar Tamam
                    </div>
                    <ul className='text-xs text-emerald-400/80 space-y-1 list-disc list-inside'>
                      <li>EA API verisi doğrulandı</li>
                      <li>Club ID eşleşmeleri başarılı</li>
                      <li>Hafta fikstürü eşleştirildi</li>
                      <li>Duplicate kaydı tespit edilmedi</li>
                    </ul>
                  </div>
                  
                  <p className='text-sm text-zinc-300'>
                    Bu işlem, seçili maçı ve <strong>{confirmModal.match.home_team.players.length + confirmModal.match.away_team.players.length} oyuncunun istatistiğini</strong> Teta League veritabanına PENDING_REVIEW statüsüyle ekleyecektir.
                  </p>

                  <div className='flex gap-3 pt-2'>
                    <button onClick={() => setConfirmModal({ isOpen: false, loading: false, success: false })} disabled={confirmModal.loading} className='flex-1 py-2 bg-white/5 text-white rounded-lg text-xs font-bold disabled:opacity-50'>VAZGEÇ</button>
                    <button onClick={handleImport} disabled={confirmModal.loading} className='flex-1 py-2 bg-cyan-500 text-black rounded-lg text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50'>
                      {confirmModal.loading ? <Loader2 className='w-4 h-4 animate-spin' /> : 'MAÇI İÇE AKTAR'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

