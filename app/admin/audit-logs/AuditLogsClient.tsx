'use client';

import React, { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Shield,
  Search,
  Filter,
  RefreshCw,
  Clock,
  User,
  Globe,
  Database,
  ArrowRight,
  Eye,
  X,
  FileCode,
  Layers,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check
} from 'lucide-react';
import { AuditLogItem } from '@/types/audit';

interface AuditLogsClientProps {
  logs: AuditLogItem[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  currentFilters: {
    entityType?: string;
    action?: string;
    search?: string;
  };
  stats: {
    totalLogs: number;
    last24hCount: number;
    distinctEntitiesCount: number;
  };
}

const ENTITY_OPTIONS = [
  { value: '', label: 'Tüm Varlıklar' },
  { value: 'player_achievements', label: 'Başarılar (player_achievements)' },
  { value: 'news', label: 'Haberler (news)' },
  { value: 'user_roles', label: 'Yönetici Rolleri (user_roles)' },
  { value: 'profiles', label: 'Oyuncu Profilleri (profiles)' },
  { value: 'matches', label: 'Maçlar (matches)' },
  { value: 'teams', label: 'Takımlar (teams)' },
  { value: 'league_teams', label: 'Lig Takımları (league_teams)' },
  { value: 'leagues', label: 'Ligler (leagues)' },
  { value: 'seasons', label: 'Sezonlar (seasons)' },
  { value: 'fixtures', label: 'Fikstürler (fixtures)' },
  { value: 'team_penalties', label: 'Cezalar (team_penalties)' },
  { value: 'transfer_windows', label: 'Transfer Pencereleri' },
  { value: 'tournaments', label: 'Turnuvalar (tournaments)' },
  { value: 'posts', label: 'Sosyal Gönderiler (posts)' },
  { value: 'comments', label: 'Sosyal Yorumlar (comments)' },
];

const ACTION_OPTIONS = [
  { value: '', label: 'Tüm Eylemler' },
  { value: 'CREATE', label: 'Oluşturma (CREATE / ADD)' },
  { value: 'UPDATE', label: 'Güncelleme (UPDATE / EDIT)' },
  { value: 'DELETE', label: 'Silme / Arşivleme (DELETE)' },
  { value: 'APPROVE', label: 'Onaylama (APPROVE)' },
  { value: 'PENALTY', label: 'Ceza İşlemleri (PENALTY)' },
  { value: 'ROLE', label: 'Yetkilendirme (ROLE / GRANT)' },
];

function getActionBadgeStyle(action: string) {
  const upper = action.toUpperCase();
  if (upper.includes('CREATE') || upper.includes('ADD') || upper.includes('GRANT') || upper.includes('APPROVE')) {
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  }
  if (upper.includes('DELETE') || upper.includes('REVOKE') || upper.includes('EXPULSION') || upper.includes('BAN')) {
    return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
  }
  if (upper.includes('UPDATE') || upper.includes('REVIEW') || upper.includes('EDIT')) {
    return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
  }
  if (upper.includes('PENALTY') || upper.includes('WARN')) {
    return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  }
  return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
}

function formatDateTR(dateString: string) {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);
  } catch {
    return dateString;
  }
}

export default function AuditLogsClient({
  logs,
  totalCount,
  currentPage,
  pageSize,
  currentFilters,
  stats,
}: AuditLogsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [modalTab, setModalTab] = useState<'diff' | 'raw'>('diff');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(currentFilters.search || '');

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const updateFilters = (newParams: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([key, val]) => {
      if (val === undefined || val === '') {
        params.delete(key);
      } else {
        params.set(key, String(val));
      }
    });
    router.push(`${pathname}?${params.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: searchInput.trim() || undefined, page: 1 });
  };

  const handleEntityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilters({ entity_type: e.target.value || undefined, page: 1 });
  };

  const handleActionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilters({ action: e.target.value || undefined, page: 1 });
  };

  const handleResetFilters = () => {
    setSearchInput('');
    router.push(pathname);
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Breadcrumb Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1.5 rounded-lg bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20">
              <Shield className="w-5 h-5" />
            </span>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-wide uppercase">
              Denetim Kayıtları (Audit Log)
            </h1>
          </div>
          <p className="text-sm text-gray-400">
            Yönetici eylemleri, kritik veritabanı değişiklikleri ve sistem aktivitelerinin değişmez (immutable) kayıtları.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Kayıtlar Değiştirilemez (Append-Only)</span>
          </div>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0a1628] border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[#00e5ff]">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Toplam Denetim Kaydı</div>
            <div className="text-2xl font-black text-white mt-0.5">{stats.totalLogs.toLocaleString('tr-TR')}</div>
          </div>
        </div>

        <div className="bg-[#0a1628] border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Son 24 Saat Eylemleri</div>
            <div className="text-2xl font-black text-white mt-0.5">{stats.last24hCount.toLocaleString('tr-TR')}</div>
          </div>
        </div>

        <div className="bg-[#0a1628] border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">İzlenen Varlık Türü</div>
            <div className="text-2xl font-black text-white mt-0.5">{stats.distinctEntitiesCount} Kategori</div>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-[#0a1628] border border-white/5 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Açıklama veya hedef varlıkta ara..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full bg-[#060d18] border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00e5ff] transition-colors"
            />
          </form>

          {/* Entity Dropdown */}
          <div className="md:col-span-3">
            <select
              value={currentFilters.entityType || ''}
              onChange={handleEntityChange}
              className="w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#00e5ff] transition-colors"
            >
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#0a1628] text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Action Dropdown */}
          <div className="md:col-span-3">
            <select
              value={currentFilters.action || ''}
              onChange={handleActionChange}
              className="w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#00e5ff] transition-colors"
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-[#0a1628] text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters */}
          <div className="md:col-span-1 flex justify-end">
            <button
              type="button"
              onClick={handleResetFilters}
              title="Filtreleri Temizle"
              className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#0a1628] border border-white/5 rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02] text-[11px] font-black uppercase tracking-wider text-gray-400">
                <th className="py-3.5 px-4">Tarih / Saat</th>
                <th className="py-3.5 px-4">Yönetici (Aktör)</th>
                <th className="py-3.5 px-4">Eylem</th>
                <th className="py-3.5 px-4">Hedef Varlık</th>
                <th className="py-3.5 px-4">Açıklama</th>
                <th className="py-3.5 px-4">IP Adresi</th>
                <th className="py-3.5 px-4 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm text-gray-300">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500 font-medium">
                    <Database className="w-10 h-10 mx-auto mb-2 text-gray-600" />
                    Kriterlere uygun herhangi bir denetim kaydı bulunamadı.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const actorName = log.actor?.username
                    ? `@${log.actor.username}`
                    : log.actor?.full_name || (log.actor_id ? 'Yönetici' : 'Sistem / DB Trigger');

                  const targetLabel = log.entity_label || log.new_data?._meta?.entity_label || (log.entity_id ? `#${log.entity_id.substring(0, 8)}` : '-');

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                      onClick={() => {
                        setSelectedLog(log);
                        setModalTab('diff');
                      }}
                    >
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-gray-400 font-mono">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-500" />
                          <span>{formatDateTR(log.created_at)}</span>
                        </div>
                      </td>

                      {/* Actor */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-xs font-bold text-[#00e5ff]">
                            {log.actor?.username ? log.actor.username[0].toUpperCase() : <User className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white group-hover:text-[#00e5ff] transition-colors">
                              {actorName}
                            </div>
                            {log.actor?.full_name && (
                              <div className="text-[10px] text-gray-500">{log.actor.full_name}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider border ${getActionBadgeStyle(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* Entity / Target */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-gray-200">{targetLabel}</span>
                          <span className="text-[10px] text-gray-500 font-mono uppercase">{log.entity_type}</span>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="py-3.5 px-4 max-w-xs truncate text-xs text-gray-300">
                        {log.description || '-'}
                      </td>

                      {/* IP Address */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs font-mono text-gray-400">
                        {log.ip_address ? (
                          <span className="px-2 py-0.5 rounded bg-black/40 border border-white/5 text-[11px]">
                            {log.ip_address}
                          </span>
                        ) : (
                          <span className="text-gray-600">-</span>
                        )}
                      </td>

                      {/* Detail CTA */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                            setModalTab('diff');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-[#00e5ff]/10 text-gray-300 hover:text-[#00e5ff] border border-white/10 hover:border-[#00e5ff]/30 text-xs font-semibold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>İncele</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-white/5 bg-white/[0.01]">
          <div className="text-xs text-gray-400">
            Toplam <span className="font-bold text-white">{totalCount}</span> kayıttan{' '}
            <span className="font-bold text-white">
              {totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalCount)}
            </span>{' '}
            arası gösteriliyor. (Sayfa {currentPage} / {totalPages})
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => updateFilters({ page: currentPage - 1 })}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-xs font-semibold transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Önceki</span>
            </button>

            <span className="text-xs font-mono px-3 py-1 rounded bg-[#060d18] border border-white/10 text-[#00e5ff]">
              {currentPage}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => updateFilters({ page: currentPage + 1 })}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 text-xs font-semibold transition-colors"
            >
              <span>Sonraki</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* DETAIL MODAL */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0a1628] border border-[#00e5ff]/30 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4 bg-white/[0.02]">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span
                    className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-wider border ${getActionBadgeStyle(
                      selectedLog.action
                    )}`}
                  >
                    {selectedLog.action}
                  </span>
                  <span className="text-xs font-mono text-gray-400 bg-black/40 px-2 py-0.5 rounded border border-white/5">
                    {selectedLog.entity_type}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDateTR(selectedLog.created_at)}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mt-1">
                  {selectedLog.entity_label || selectedLog.new_data?._meta?.entity_label || 'Denetim Kaydı Detayı'}
                </h3>
                {selectedLog.description && (
                  <p className="text-xs text-gray-300">{selectedLog.description}</p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Executive Info Meta */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-[#060d18] border-b border-white/5 text-xs">
              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold tracking-wider">İşlemi Yapan</span>
                <span className="font-semibold text-white mt-0.5 block truncate">
                  {selectedLog.actor?.username ? `@${selectedLog.actor.username}` : (selectedLog.actor_id ? 'Yönetici' : 'Sistem / DB')}
                </span>
                {selectedLog.actor_id && (
                  <span className="text-[10px] text-gray-500 font-mono truncate block">{selectedLog.actor_id}</span>
                )}
              </div>

              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold tracking-wider">Hedef Varlık ID</span>
                <span className="font-mono text-gray-300 mt-0.5 block truncate">
                  {selectedLog.entity_id || 'Belirtilmedi'}
                </span>
              </div>

              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold tracking-wider">IP Adresi</span>
                <span className="font-mono text-gray-300 mt-0.5 block truncate">
                  {selectedLog.ip_address || '-'}
                </span>
              </div>

              <div>
                <span className="text-gray-500 block text-[10px] uppercase font-bold tracking-wider">Kayıt Kimliği (UUID)</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="font-mono text-[10px] text-gray-400 truncate block">{selectedLog.id}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedLog.id, 'log-id')}
                    title="Kopyala"
                    className="text-gray-500 hover:text-[#00e5ff]"
                  >
                    {copiedKey === 'log-id' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center border-b border-white/10 px-6 bg-[#0a1628]">
              <button
                type="button"
                onClick={() => setModalTab('diff')}
                className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                  modalTab === 'diff'
                    ? 'border-[#00e5ff] text-[#00e5ff]'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Değişiklik Detayı (Diff Karşılaştırma)</span>
              </button>

              <button
                type="button"
                onClick={() => setModalTab('raw')}
                className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition-colors ${
                  modalTab === 'raw'
                    ? 'border-[#00e5ff] text-[#00e5ff]'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <FileCode className="w-4 h-4" />
                <span>Ham JSON Yükü (Raw Payload)</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {modalTab === 'diff' ? (
                <DiffViewer oldData={selectedLog.old_data} newData={selectedLog.new_data} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Old Data JSON */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-rose-400 font-bold uppercase tracking-wider">
                      <span>Önceki Durum (old_data)</span>
                      {selectedLog.old_data && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(JSON.stringify(selectedLog.old_data, null, 2), 'old_data')}
                          className="text-[11px] text-gray-500 hover:text-white flex items-center gap-1"
                        >
                          {copiedKey === 'old_data' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          Kopyala
                        </button>
                      )}
                    </div>
                    <pre className="p-4 rounded-xl bg-black/60 border border-rose-500/20 text-xs font-mono text-gray-300 max-h-96 overflow-y-auto whitespace-pre-wrap">
                      {selectedLog.old_data
                        ? JSON.stringify(selectedLog.old_data, null, 2)
                        : '// Eski kayıt mevcut değil (Yeni Ekleme)'}
                    </pre>
                  </div>

                  {/* New Data JSON */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-emerald-400 font-bold uppercase tracking-wider">
                      <span>Yeni Durum (new_data)</span>
                      {selectedLog.new_data && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(JSON.stringify(selectedLog.new_data, null, 2), 'new_data')}
                          className="text-[11px] text-gray-500 hover:text-white flex items-center gap-1"
                        >
                          {copiedKey === 'new_data' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          Kopyala
                        </button>
                      )}
                    </div>
                    <pre className="p-4 rounded-xl bg-black/60 border border-emerald-500/20 text-xs font-mono text-gray-300 max-h-96 overflow-y-auto whitespace-pre-wrap">
                      {selectedLog.new_data
                        ? JSON.stringify(selectedLog.new_data, null, 2)
                        : '// Yeni veri mevcut değil (Silme İşlemi)'}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
              <span className="text-[11px] text-gray-500 font-mono">
                PostgreSQL RLS Korumalı Denetim Kaydı
              </span>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-colors"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Intelligent Diff Viewer Component
 * Compares old_data and new_data field-by-field with visual cues
 */
function DiffViewer({ oldData, newData }: { oldData?: Record<string, any> | null; newData?: Record<string, any> | null }) {
  const cleanOld = oldData && typeof oldData === 'object' ? { ...oldData } : null;
  const cleanNew = newData && typeof newData === 'object' ? { ...newData } : null;

  // Filter out internal metadata keys from diff table
  if (cleanNew && cleanNew._meta) delete cleanNew._meta;

  if (!cleanOld && !cleanNew) {
    return (
      <div className="py-8 text-center text-gray-500 text-sm">
        Bu işlem için karşılaştırılabilir veri yükü bulunmuyor.
      </div>
    );
  }

  // Pure INSERT / CREATE case
  if (!cleanOld && cleanNew) {
    return (
      <div className="space-y-4">
        <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4" />
          <span>Yeni Varlık Oluşturuldu — Eklenen Alanlar</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(cleanNew).map(([key, val]) => (
            <div key={key} className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">{key}</div>
              <div className="text-xs font-semibold text-white mt-1 break-words font-mono">
                {formatDiffValue(val)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Pure DELETE case
  if (cleanOld && !cleanNew) {
    return (
      <div className="space-y-4">
        <div className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" />
          <span>Varlık Silindi / Arşive Alındı — Kaldırılan Veriler</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(cleanOld).map(([key, val]) => (
            <div key={key} className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/20">
              <div className="text-[10px] font-mono text-gray-400 uppercase tracking-wider">{key}</div>
              <div className="text-xs font-semibold text-gray-300 mt-1 break-words font-mono line-through decoration-rose-500">
                {formatDiffValue(val)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // UPDATE case: field-by-field diff
  const allKeys = Array.from(new Set([...Object.keys(cleanOld || {}), ...Object.keys(cleanNew || {})]));
  const changedEntries: Array<{ key: string; oldVal: any; newVal: any; status: 'modified' | 'added' | 'removed' }> = [];
  const unchangedEntries: Array<{ key: string; val: any }> = [];

  allKeys.forEach((key) => {
    const oldVal = cleanOld ? cleanOld[key] : undefined;
    const newVal = cleanNew ? cleanNew[key] : undefined;

    const oldStr = JSON.stringify(oldVal);
    const newStr = JSON.stringify(newVal);

    if (oldVal === undefined && newVal !== undefined) {
      changedEntries.push({ key, oldVal, newVal, status: 'added' });
    } else if (oldVal !== undefined && newVal === undefined) {
      changedEntries.push({ key, oldVal, newVal, status: 'removed' });
    } else if (oldStr !== newStr) {
      changedEntries.push({ key, oldVal, newVal, status: 'modified' });
    } else {
      unchangedEntries.push({ key, val: newVal });
    }
  });

  return (
    <div className="space-y-6">
      {/* Changed Fields Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-white">
          <span>Değişen Alanlar ({changedEntries.length})</span>
          <span className="text-[11px] text-gray-400 font-normal">Kırmızı: Önceki • Yeşil: Yeni</span>
        </div>

        {changedEntries.length === 0 ? (
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-gray-400 text-center">
            Alan düzeyinde doğrudan fark tespit edilmedi (Aynı değerler veya ilişkisel kayıt güncellendi).
          </div>
        ) : (
          <div className="space-y-2">
            {changedEntries.map(({ key, oldVal, newVal, status }) => (
              <div
                key={key}
                className="p-3 rounded-xl bg-[#060d18] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="font-mono font-bold text-gray-300 md:w-1/4">
                  {key}
                  <span
                    className={`ml-2 px-1.5 py-0.2 rounded text-[9px] uppercase font-bold ${
                      status === 'added'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : status === 'removed'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-sky-500/20 text-sky-400'
                    }`}
                  >
                    {status === 'added' ? 'YENİ ALAN' : status === 'removed' ? 'KALDIRILDI' : 'GÜNCELLENDİ'}
                  </span>
                </div>

                <div className="flex-1 flex flex-col md:flex-row md:items-center gap-2 font-mono">
                  {/* Old Value */}
                  <div className="flex-1 p-2 rounded bg-rose-500/5 border border-rose-500/20 text-rose-300 break-words">
                    <span className="text-[10px] text-rose-400/60 block uppercase font-bold">Önceki</span>
                    {formatDiffValue(oldVal)}
                  </div>

                  <ArrowRight className="hidden md:block w-4 h-4 text-gray-500 shrink-0" />

                  {/* New Value */}
                  <div className="flex-1 p-2 rounded bg-emerald-500/5 border border-emerald-500/20 text-emerald-300 break-words">
                    <span className="text-[10px] text-emerald-400/60 block uppercase font-bold">Yeni</span>
                    {formatDiffValue(newVal)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Unchanged Fields Accordion (collapsed by default if many) */}
      {unchangedEntries.length > 0 && (
        <details className="group border border-white/5 rounded-xl bg-white/[0.01] p-3 text-xs">
          <summary className="cursor-pointer font-bold text-gray-400 hover:text-white flex items-center justify-between select-none">
            <span>Değişmeyen Diğer Alanlar ({unchangedEntries.length})</span>
            <span className="text-[10px] text-gray-500 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/5 font-mono">
            {unchangedEntries.map(({ key, val }) => (
              <div key={key} className="p-2 rounded bg-black/40 border border-white/5">
                <span className="text-[10px] text-gray-500 block truncate">{key}</span>
                <span className="text-gray-300 text-xs block truncate">{formatDiffValue(val)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function formatDiffValue(val: any): string {
  if (val === undefined) return '(Yok)';
  if (val === null) return 'null';
  if (typeof val === 'boolean') return val ? 'true (Evet)' : 'false (Hayır)';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
