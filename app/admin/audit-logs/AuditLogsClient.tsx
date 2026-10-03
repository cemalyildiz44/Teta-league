'use client';

import React, { useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  Shield,
  Search,
  RefreshCw,
  Clock,
  User,
  Database,
  ArrowRight,
  Eye,
  X,
  Layers,
  Activity,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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

export const ACTION_TITLE_MAP: Record<string, string> = {
  ACHIEVEMENT_AWARD: 'Başarı Verdi',
  ACHIEVEMENT_DELETE: 'Başarıyı Sildi',
  CREATE_TEAM: 'Takım Oluşturdu',
  UPDATE_TEAM: 'Takımı Güncelledi',
  DELETE_TEAM: 'Takımı Sildi',
  ACTIVATE_TEAM: 'Takımı Aktifleştirdi',
  DEACTIVATE_TEAM: 'Takımı Pasife Aldı',
  FORCE_DELETE_TEST_TEAM: 'Test Takımını Sildi',
  ASSIGN_CAPTAIN: 'Kaptan Atadı',
  REMOVE_CAPTAIN: 'Kaptanlığı Kaldırdı',
  ASSIGN_TEAM_TO_LEAGUE: 'Takımı Lige Ekledi',
  REMOVE_TEAM_FROM_LEAGUE: 'Takımı Ligden Çıkardı',
  CREATE_LEAGUE: 'Lig Oluşturdu',
  UPDATE_LEAGUE: 'Ligi Güncelledi',
  UPDATE_LEAGUE_RULES: 'Lig Kurallarını Güncelledi',
  ACTIVATE_LEAGUE: 'Ligi Aktifleştirdi',
  DEACTIVATE_LEAGUE: 'Ligi Tamamladı',
  UPDATE_LEAGUE_STATUS: 'Lig Durumunu Güncelledi',
  CREATE_SEASON: 'Sezon Oluşturdu',
  UPDATE_SEASON: 'Sezonu Güncelledi',
  DELETE_SEASON: 'Sezonu Sildi',
  ACTIVATE_SEASON: 'Sezonu Aktifleştirdi',
  DEACTIVATE_SEASON: 'Sezonu Tamamladı',
  UPDATE_SEASON_STATUS: 'Sezon Durumunu Güncelledi',
  FORCE_UPDATE_SEASON_STATUS: 'Sezonu Zorla Güncelledi',
  GENERATE_LEAGUE_FIXTURES: 'Lig Fikstürü Oluşturdu',
  UPDATE_FIXTURE_DATE: 'Fikstür Tarihini Güncelledi',
  CANCEL_FIXTURE: 'Fikstürü İptal Etti',
  DELETE_FIXTURE: 'Fikstürü Sildi',
  UPDATE_MATCH_SCORE: 'Maç Skorunu Güncelledi',
  DELETE_MATCH: 'Maçı Sildi',
  APPROVE_MATCH: 'Maçı Onayladı',
  REVIEW_MATCH_REJECTED: 'Maçı Reddetti',
  REVIEW_MATCH_PENDING: 'Maçı İncelemeye Aldı',
  NEWS_CREATE: 'Haber Oluşturdu',
  NEWS_UPDATE: 'Haberi Güncelledi',
  NEWS_DELETE: 'Haberi Sildi',
  NEWS_TOGGLE_PUBLISH: 'Haber Yayınını Değiştirdi',
  ISSUE_PENALTY: 'Ceza Verdi',
  REVOKE_PENALTY: 'Cezayı Kaldırdı',
  ADMIN_ROLE_GRANT: 'Yönetici Rolü Verdi',
  ADMIN_ROLE_REVOKE: 'Yönetici Rolünü Kaldırdı',
  UPDATE_ACCOUNT_STATUS: 'Oyuncu Hesabını Güncelledi',
  UPDATE_BETA_STATS: 'Beta İstatistiklerini Güncelledi',
  CREATE_LEGACY_CAREER: 'Kariyer Kaydı Ekledi',
  UPDATE_LEGACY_CAREER: 'Kariyer Kaydını Güncelledi',
  DELETE_LEGACY_CAREER: 'Kariyer Kaydını Sildi',
  CREATE_TOURNAMENT_1V1: '1v1 Turnuva Kazananı Ekledi',
  CREATE_TOURNAMENT_KARMA: 'Karma Turnuva Kazananı Ekledi',
  CREATE_TOURNAMENT_NIGHT_CUP: 'Gece Kupası Oluşturdu',
  UPDATE_TOURNAMENT_APPLICATION: 'Turnuva Başvurusunu Güncelledi',
  ASSIGN_TOURNAMENT_WINNER: 'Turnuva Kazananını Belirledi',
  UPDATE_TOURNAMENT_DETAILS: 'Turnuva Detayını Güncelledi',
  DELETE_TOURNAMENT: 'Turnuvayı Sildi',
  CREATE_TRANSFER_WINDOW: 'Transfer Penceresi Oluşturdu',
  UPDATE_TRANSFER_WINDOW: 'Transfer Penceresini Güncelledi',
  DELETE_TRANSFER_WINDOW: 'Transfer Penceresini Sildi',
  OPEN_TRANSFER_WINDOW: 'Transfer Penceresini Açtı',
  CLOSE_TRANSFER_WINDOW: 'Transfer Penceresini Kapattı',
  DELETE_POST: 'Sosyal Gönderiyi Sildi',
  RESTORE_POST: 'Sosyal Gönderiyi Geri Yükledi',
  DELETE_COMMENT: 'Yorumu Sildi',
  RESTORE_COMMENT: 'Yorumu Geri Yükledi',
};

export function formatActionTitle(action: string): string {
  if (ACTION_TITLE_MAP[action]) return ACTION_TITLE_MAP[action];
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^\w|\s\w)/g, (m) => m.toUpperCase());
}

export const ENTITY_TITLE_MAP: Record<string, string> = {
  player_achievements: 'Başarım',
  teams: 'Takım',
  matches: 'Maç',
  news: 'Haber',
  leagues: 'Lig',
  seasons: 'Sezon',
  fixtures: 'Fikstür',
  team_penalties: 'Ceza',
  profiles: 'Oyuncu Hesabı',
  user_roles: 'Yönetici Rolü',
  transfer_windows: 'Transfer Dönemi',
  tournaments: 'Turnuva',
  posts: 'Sosyal Gönderi',
  comments: 'Sosyal Yorum',
  league_teams: 'Lig Takımı',
};

const ENTITY_OPTIONS = [
  { value: '', label: 'Tüm Hedef Varlıklar' },
  { value: 'player_achievements', label: 'Oyuncu Başarımları' },
  { value: 'teams', label: 'Takımlar' },
  { value: 'matches', label: 'Maçlar & Skorlar' },
  { value: 'news', label: 'Haberler' },
  { value: 'leagues', label: 'Ligler' },
  { value: 'seasons', label: 'Sezonlar' },
  { value: 'fixtures', label: 'Fikstürler' },
  { value: 'team_penalties', label: 'Cezalar' },
  { value: 'profiles', label: 'Oyuncu Profilleri' },
  { value: 'user_roles', label: 'Yönetici Rolleri' },
  { value: 'transfer_windows', label: 'Transfer Dönemleri' },
  { value: 'tournaments', label: 'Turnuvalar' },
  { value: 'posts', label: 'Sosyal Gönderiler' },
  { value: 'comments', label: 'Sosyal Yorumlar' },
  { value: 'league_teams', label: 'Lig Takımları' },
];

const ACTION_OPTIONS = [
  { value: '', label: 'Tüm İşlemler' },
  { value: 'ACHIEVEMENT', label: 'Başarı İşlemleri' },
  { value: 'CREATE', label: 'Oluşturma & Ekleme İşlemleri' },
  { value: 'UPDATE', label: 'Güncelleme & Düzenleme İşlemleri' },
  { value: 'DELETE', label: 'Silme & İptal İşlemleri' },
  { value: 'APPROVE', label: 'Maç Onay İşlemleri' },
  { value: 'PENALTY', label: 'Ceza İşlemleri' },
  { value: 'ROLE', label: 'Yönetici & Kaptanlık Rol İşlemleri' },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val?: string | null): boolean {
  if (!val) return false;
  return UUID_REGEX.test(val.trim());
}

export function resolveTarget(log: AuditLogItem): { label: string; typeLabel: string } {
  const typeLabel = ENTITY_TITLE_MAP[log.entity_type] || 'Varlık';

  // 1. If entity_label exists and is NOT a UUID, use it
  if (log.entity_label && !isUuid(log.entity_label)) {
    return { label: log.entity_label, typeLabel };
  }

  // 2. Check new_data or old_data
  const data = log.new_data || log.old_data || {};
  if (data.username) return { label: `@${data.username}`, typeLabel };
  if (data.name) return { label: data.name, typeLabel };
  if (data.title) return { label: data.title, typeLabel };
  if (data.team_name && data.league_name) return { label: `${data.team_name} → ${data.league_name}`, typeLabel };
  if (data.achievement_type) return { label: `${data.achievement_type.replace(/_/g, ' ')} Başarısı`, typeLabel };
  if (data.home_team && data.away_team) return { label: `${data.home_team} vs ${data.away_team}`, typeLabel };

  // 3. From description if available (e.g. mentions @username or quotes)
  if (log.description) {
    const usernameMatch = log.description.match(/@([a-zA-Z0-9_-]+)/);
    if (usernameMatch) return { label: usernameMatch[0], typeLabel };
    const quotedMatch = log.description.match(/"([^"]+)"/);
    if (quotedMatch) return { label: quotedMatch[1], typeLabel };
  }

  // 4. Safe human fallback, never a raw hex UUID
  return { label: typeLabel, typeLabel };
}

export function resolveDescription(log: AuditLogItem, actorName: string, targetLabel: string): string {
  if (!log.description) {
    return `${actorName}, ${targetLabel} üzerinde ${formatActionTitle(log.action).toLowerCase()} işlemini tamamladı.`;
  }

  let desc = log.description;
  // Strip any raw UUID patterns from descriptions and replace with human target
  desc = desc.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, targetLabel);

  return desc;
}

function getActionBadgeStyle(action: string) {
  const upper = action.toUpperCase();
  if (upper.includes('CREATE') || upper.includes('ADD') || upper.includes('GRANT') || upper.includes('AWARD') || upper.includes('APPROVE') || upper.includes('RESTORE')) {
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  }
  if (upper.includes('DELETE') || upper.includes('REVOKE') || upper.includes('CANCEL') || upper.includes('DEACTIVATE') || upper.includes('CLOSE')) {
    return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
  }
  if (upper.includes('UPDATE') || upper.includes('EDIT') || upper.includes('SCORE') || upper.includes('DATE') || upper.includes('STATUS')) {
    return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
  }
  if (upper.includes('PENALTY') || upper.includes('WARN') || upper.includes('REJECT')) {
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
    }).format(d);
  } catch {
    return dateString;
  }
}


const FIELD_LABEL_MAP: Record<string, string> = {
  home_score: 'Ev Sahibi Skor',
  away_score: 'Deplasman Skor',
  status: 'Durum',
  is_active: 'Aktiflik Durumu',
  is_published: 'Yayın Durumu',
  name: 'İsim / Ad',
  slug: 'URL Bağlantısı (Slug)',
  level: 'Lig Seviyesi',
  max_teams: 'Maksimum Takım Kapasitesi',
  roster_min: 'Minimum Kadro Sayısı',
  roster_max: 'Maksimum Kadro Sayısı',
  scheduled_at: 'Planlanan Tarih',
  week_number: 'Hafta Numarası',
  month_number: 'Ay Numarası',
  achievement_type: 'Başarı Türü',
  season_name: 'Sezon Adı',
  match_count: 'Ceza Maç Sayısı',
  reason: 'Gerekçe / Sebep',
  role: 'Atanan Rol',
  team_name: 'Takım Adı',
  league_name: 'Lig Adı',
  platform: 'Platform',
  primary_position: 'Mevki',
  bio: 'Biyografi',
  content: 'İçerik',
  title: 'Haber Başlığı',
};

const IGNORED_RAW_FIELDS = new Set([
  'id',
  '_meta',
  'created_at',
  'updated_at',
  'deleted_at',
  'actor_id',
  'awarded_by',
  'player_id',
  'entity_id',
  'user_id',
  'team_id',
  'league_id',
  'season_id',
  'match_id',
  'home_team_id',
  'away_team_id',
  'post_id',
  'comment_id',
  'image_url',
  'logo_url',
  'avatar_url',
]);

function formatFieldValue(val: any): string {
  if (val === undefined || val === null) return 'Boş';
  if (typeof val === 'boolean') return val ? 'Aktif / Evet' : 'Pasif / Hayır';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
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

  return (
    <div className="space-y-6">
      {/* Page Title & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1.5 rounded-lg bg-[#00e5ff]/10 text-[#00e5ff] border border-[#00e5ff]/20">
              <Shield className="w-5 h-5" />
            </span>
            <h1 className="text-xl md:text-2xl font-black text-white tracking-wide uppercase">
              Yönetici İşlem Geçmişi (Denetim Kayıtları)
            </h1>
          </div>
          <p className="text-sm text-gray-400">
            TETA League yönetim panelinde yetkili yöneticiler tarafından gerçekleştirilen tüm işlemlerin şeffaf geçmişi.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Yalnızca Yönetici İşlemleri</span>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#0a1628] border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-[#00e5ff]">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Toplam Yönetici Eylemi</div>
            <div className="text-2xl font-black text-white mt-0.5">{stats.totalLogs.toLocaleString('tr-TR')}</div>
          </div>
        </div>

        <div className="bg-[#0a1628] border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Son 24 Saatteki Eylemler</div>
            <div className="text-2xl font-black text-white mt-0.5">{stats.last24hCount.toLocaleString('tr-TR')}</div>
          </div>
        </div>

        <div className="bg-[#0a1628] border border-white/5 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Aktif Modül Kategorisi</div>
            <div className="text-2xl font-black text-white mt-0.5">{stats.distinctEntitiesCount} Modül</div>
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
              placeholder="Yönetici, işlem veya hedef varlık ara..."
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
              className="w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#00e5ff] transition-colors cursor-pointer"
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
              className="w-full bg-[#060d18] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#00e5ff] transition-colors cursor-pointer"
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

      {/* Main Activity Table */}
      <div className="bg-[#0a1628] border border-white/5 rounded-xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02] text-[11px] font-black uppercase tracking-wider text-gray-400">
                <th className="py-3.5 px-4">Tarih / Saat</th>
                <th className="py-3.5 px-4">Yönetici</th>
                <th className="py-3.5 px-4">İşlem</th>
                <th className="py-3.5 px-4">Hedef</th>
                <th className="py-3.5 px-4">Açıklama</th>
                <th className="py-3.5 px-4 text-right">Detay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm text-gray-300">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-gray-500 font-medium">
                    <Database className="w-10 h-10 mx-auto mb-2 text-gray-600 opacity-60" />
                    Kriterlere uygun yönetici işlemi bulunamadı.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const actorFullName = log.actor?.full_name || 'Yönetici';
                  const actorUsername = log.actor?.username ? `@${log.actor.username}` : '@admin';
                  const target = resolveTarget(log);
                  const readableDesc = resolveDescription(log, actorFullName, target.label);
                  const actionTitle = formatActionTitle(log.action);

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                      onClick={() => setSelectedLog(log)}
                    >
                      {/* Tarih / Saat */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-gray-400 font-mono">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-gray-500" />
                          <span>{formatDateTR(log.created_at)}</span>
                        </div>
                      </td>

                      {/* Yönetici */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-xs font-bold text-[#00e5ff] overflow-hidden">
                            {log.actor?.avatar_url ? (
                              <img src={log.actor.avatar_url} alt={actorFullName} className="w-full h-full object-cover" />
                            ) : log.actor?.username ? (
                              log.actor.username[0].toUpperCase()
                            ) : (
                              <User className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white group-hover:text-[#00e5ff] transition-colors">
                              {actorFullName}
                            </div>
                            <div className="text-[11px] text-gray-500 font-mono">{actorUsername}</div>
                          </div>
                        </div>
                      </td>

                      {/* İşlem Rozeti */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-black uppercase tracking-wider border ${getActionBadgeStyle(
                            log.action
                          )}`}
                        >
                          {actionTitle}
                        </span>
                      </td>

                      {/* Hedef Varlık */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-200 group-hover:text-white transition-colors">
                            {target.label}
                          </span>
                          <span className="text-[10px] text-gray-500 font-medium">
                            {target.typeLabel}
                          </span>
                        </div>
                      </td>

                      {/* Açıklama */}
                      <td className="py-3.5 px-4 max-w-md truncate text-xs text-gray-300">
                        {readableDesc}
                      </td>

                      {/* Detay Butonu */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-[#00e5ff]/10 text-gray-300 hover:text-[#00e5ff] border border-white/10 hover:border-[#00e5ff]/30 text-xs font-semibold transition-colors"
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

      {/* EXECUTIVE DETAIL MODAL */}
      {selectedLog && (() => {
        const target = resolveTarget(selectedLog);
        const actorFullName = selectedLog.actor?.full_name || 'Yönetici';
        const actorUsername = selectedLog.actor?.username ? `@${selectedLog.actor.username}` : '@admin';
        const actionTitle = formatActionTitle(selectedLog.action);
        const fullDesc = resolveDescription(selectedLog, actorFullName, target.label);

        // Compute semantic changes excluding database internals
        const rawOld = selectedLog.old_data || {};
        const rawNew = selectedLog.new_data || {};
        const changedFields: Array<{ label: string; oldVal: string; newVal: string }> = [];

        const allKeys = Array.from(new Set([...Object.keys(rawOld), ...Object.keys(rawNew)]));
        allKeys.forEach((key) => {
          if (IGNORED_RAW_FIELDS.has(key)) return;
          const oldV = rawOld[key];
          const newV = rawNew[key];
          if (oldV !== newV && (oldV !== undefined || newV !== undefined)) {
            changedFields.push({
              label: FIELD_LABEL_MAP[key] || key,
              oldVal: formatFieldValue(oldV),
              newVal: formatFieldValue(newV),
            });
          }
        });

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0a1628] border border-[#00e5ff]/30 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in duration-150">
              {/* Modal Header */}
              <div className="p-6 border-b border-white/10 flex items-start justify-between gap-4 bg-white/[0.02]">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider border ${getActionBadgeStyle(
                        selectedLog.action
                      )}`}
                    >
                      {actionTitle}
                    </span>
                    <span className="text-xs font-bold text-gray-300 bg-white/5 px-2.5 py-1 rounded-md border border-white/10">
                      {target.label}
                    </span>
                    <span className="text-xs text-gray-400 font-mono bg-black/40 px-2 py-0.5 rounded border border-white/5">
                      {formatDateTR(selectedLog.created_at)}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mt-1">
                    {actorFullName} — {actionTitle}
                  </h3>
                  <p className="text-xs text-gray-300">
                    {fullDesc}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* 4 Executive Meta Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-[#060d18] border border-white/5">
                    <span className="text-gray-500 block text-[10px] uppercase font-bold tracking-wider">İşlemi Yapan</span>
                    <span className="font-bold text-white text-sm mt-1 block truncate">
                      {actorFullName}
                    </span>
                    <span className="text-[11px] text-[#00e5ff] font-mono block truncate">
                      {actorUsername}
                    </span>
                    <span className="text-[10px] text-gray-500 block mt-0.5 font-medium">
                      Admin
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#060d18] border border-white/5">
                    <span className="text-gray-500 block text-[10px] uppercase font-bold tracking-wider">Hedef Varlık</span>
                    <span className="font-bold text-white text-sm mt-1 block truncate">
                      {target.label}
                    </span>
                    <span className="text-[11px] text-gray-400 block truncate font-medium">
                      {target.typeLabel}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#060d18] border border-white/5">
                    <span className="text-gray-500 block text-[10px] uppercase font-bold tracking-wider">İşlem</span>
                    <span className="font-bold text-[#00e5ff] text-xs mt-1 block uppercase tracking-wide">
                      {actionTitle}
                    </span>
                    <span className="text-[10px] text-gray-500 block mt-0.5">
                      Yönetici Aksiyonu
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#060d18] border border-white/5">
                    <span className="text-gray-500 block text-[10px] uppercase font-bold tracking-wider">Tarih</span>
                    <span className="font-bold text-white text-xs mt-1 block font-mono">
                      {formatDateTR(selectedLog.created_at)}
                    </span>
                    <span className="text-[10px] text-gray-500 block mt-0.5">
                      Yerel Saat
                    </span>
                  </div>
                </div>

                {/* Description Card */}
                <div className="p-4 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#00e5ff] mb-1">
                    Açıklama
                  </div>
                  <div className="text-sm text-gray-100 font-medium">
                    {fullDesc}
                  </div>
                </div>

                {/* Semantic Field Changes (if any) */}
                {changedFields.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-white">
                      Değiştirilen Alanlar ({changedFields.length})
                    </div>
                    <div className="space-y-2">
                      {changedFields.map((field, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-[#060d18] border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs"
                        >
                          <div className="font-semibold text-gray-300 md:w-1/3">
                            {field.label}
                          </div>
                          <div className="flex-1 flex items-center gap-2 text-xs font-medium">
                            <span className="px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 line-through">
                              {field.oldVal}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                            <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                              {field.newVal}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-white/10 flex justify-end bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
                >
                  Kapat
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
