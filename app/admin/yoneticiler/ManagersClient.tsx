'use client';

import { useState, useTransition } from 'react';
import { grantAdminRoleAction, revokeAdminRoleAction, searchUsersAction, ManagedUser } from './actions';
import Image from 'next/image';

interface ManagersClientProps {
  initialAdmins: ManagedUser[];
}

export default function ManagersClient({ initialAdmins }: ManagersClientProps) {
  const [adminsList, setAdminsList] = useState<ManagedUser[]>(initialAdmins);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ManagedUser[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Search handler
  const handleSearch = async (e?: React.FormEvent, directQuery?: string) => {
    if (e) e.preventDefault();
    const query = directQuery !== undefined ? directQuery : searchQuery;
    if (!query.trim() || query.trim().length < 2) {
      setStatusMessage({ type: 'error', text: 'Arama yapmak için en az 2 karakter giriniz.' });
      return;
    }

    setIsSearching(true);
    setStatusMessage(null);

    const res = await searchUsersAction(query);
    setIsSearching(false);

    if (res.success && res.users) {
      setSearchResults(res.users);
      if (res.users.length === 0) {
        setStatusMessage({ type: 'error', text: `"${query}" ile eşleşen kullanıcı bulunamadı.` });
      }
    } else {
      setStatusMessage({ type: 'error', text: res.error || 'Arama sırasında bir hata oluştu.' });
    }
  };

  // Grant ADMIN role
  const handleGrantAdmin = (user: ManagedUser) => {
    if (!confirm(`"${user.username}" kullanıcısına ADMIN rolü vermek istediğinize emin misiniz?`)) {
      return;
    }

    setActionLoadingId(user.id);
    setStatusMessage(null);

    startTransition(async () => {
      const res = await grantAdminRoleAction(user.id);
      setActionLoadingId(null);

      if (res.success) {
        setStatusMessage({ type: 'success', text: res.message || 'ADMIN rolü başarıyla verildi.' });

        // Update local lists
        const updatedRoles = Array.from(new Set([...user.roles, 'ADMIN']));
        const updatedUser: ManagedUser = {
          ...user,
          roles: updatedRoles,
          isAdmin: true,
        };

        // Update admins list
        setAdminsList((prev) => {
          const exists = prev.some((u) => u.id === user.id);
          if (exists) {
            return prev.map((u) => (u.id === user.id ? updatedUser : u));
          }
          return [updatedUser, ...prev];
        });

        // Update search results if present
        if (searchResults) {
          setSearchResults((prev) => prev?.map((u) => (u.id === user.id ? updatedUser : u)) || null);
        }
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Rol verilemedi.' });
      }
    });
  };

  // Revoke ADMIN role
  const handleRevokeAdmin = (user: ManagedUser) => {
    if (!confirm(`DİKKAT: "${user.username}" kullanıcısının ADMIN rolünü kaldırmak istediğinize emin misiniz?`)) {
      return;
    }

    setActionLoadingId(user.id);
    setStatusMessage(null);

    startTransition(async () => {
      const res = await revokeAdminRoleAction(user.id);
      setActionLoadingId(null);

      if (res.success) {
        setStatusMessage({ type: 'success', text: res.message || 'ADMIN rolü başarıyla kaldırıldı.' });

        // Update local lists
        const updatedRoles = user.roles.filter((r) => r !== 'ADMIN');
        const updatedUser: ManagedUser = {
          ...user,
          roles: updatedRoles,
          isAdmin: false,
        };

        // Remove from or update admins list
        setAdminsList((prev) => prev.filter((u) => u.id !== user.id));

        // Update search results if present
        if (searchResults) {
          setSearchResults((prev) => prev?.map((u) => (u.id === user.id ? updatedUser : u)) || null);
        }
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Rol kaldırılamadı.' });
      }
    });
  };

  // Helper for role badges
  const renderRoleBadges = (roles: string[]) => {
    if (!roles || roles.length === 0) {
      return <span className="text-xs text-gray-500 font-mono">-</span>;
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        {roles.map((role) => {
          if (role === 'SUPER_ADMIN') {
            return (
              <span key={role} className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                SÜPER ADMİN
              </span>
            );
          }
          if (role === 'ADMIN') {
            return (
              <span key={role} className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-[#00e5ff]/20 text-[#00e5ff] border border-[#00e5ff]/30">
                ADMİN
              </span>
            );
          }
          if (role === 'CAPTAIN') {
            return (
              <span key={role} className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                KAPTAN
              </span>
            );
          }
          if (role === 'MODERATOR') {
            return (
              <span key={role} className="px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
                MODERATÖR
              </span>
            );
          }
          return (
            <span key={role} className="px-2 py-0.5 rounded text-[11px] font-medium uppercase tracking-wider bg-white/5 text-gray-400 border border-white/10">
              {role}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-white tracking-widest">
              YÖNETİCİ <span className="text-[#00e5ff]">YÖNETİMİ</span>
            </h1>
            <div className="h-px flex-1 bg-gradient-to-r from-[#00e5ff]/20 to-transparent" />
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Yalnızca SUPER_ADMIN yetkilidir. Kullanıcılara ADMIN rolü atayabilir veya mevcut ADMIN yetkisini kaldırabilirsiniz.
          </p>
        </div>
      </div>

      {/* Status Message Notification */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">{statusMessage.type === 'success' ? '✅' : '⚠️'}</span>
            <span className="text-sm font-bold">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-60 hover:opacity-100 transition-opacity p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* User Search Card */}
      <div className="client-glass p-6 rounded-2xl border border-white/5 space-y-4">
        <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
          <span>🔍</span> Kullanıcı Ara ve Rol Ata
        </h2>

        <form onSubmit={(e) => handleSearch(e)} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Kullanıcı adı veya Kullanıcı ID (UUID) giriniz..."
              className="w-full bg-[#0a1628] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#00e5ff]/50 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults(null);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs px-2 py-1"
              >
                Temizle
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={isSearching || isPending}
            className="px-6 py-3 bg-[#00e5ff] text-black font-extrabold text-xs tracking-wider uppercase rounded-xl hover:bg-white transition-all disabled:opacity-50 shrink-0"
          >
            {isSearching ? 'Aranıyor...' : 'ARA'}
          </button>
        </form>

        {/* Quick Shortcut Pills */}
        <div className="flex items-center gap-2 pt-1 text-xs text-gray-400">
          <span className="text-gray-500">Hızlı Arama:</span>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('Musniper10');
              handleSearch(undefined, 'Musniper10');
            }}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-[#00e5ff]/20 text-gray-300 hover:text-[#00e5ff] border border-white/10 transition-colors font-mono font-bold"
          >
            Musniper10
          </button>
        </div>

        {/* Search Results Table */}
        {searchResults !== null && (
          <div className="mt-6 pt-6 border-t border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-[#00e5ff] uppercase tracking-wider">
                Arama Sonuçları ({searchResults.length})
              </h3>
              <button
                type="button"
                onClick={() => setSearchResults(null)}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Sonuçları Gizle
              </button>
            </div>

            {searchResults.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">Kullanıcı bulunamadı.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0a1628]/60">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#0f223d] text-gray-400 uppercase text-[11px] font-bold tracking-wider border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3">Kullanıcı</th>
                      <th className="px-4 py-3">Durum</th>
                      <th className="px-4 py-3">Mevcut Roller</th>
                      <th className="px-4 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-gray-300">
                    {searchResults.map((user) => {
                      const isLoading = actionLoadingId === user.id;

                      return (
                        <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {user.avatar_url ? (
                                <img
                                  src={user.avatar_url}
                                  alt={user.username}
                                  className="w-9 h-9 rounded-full object-cover border border-white/10"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-[#132338] border border-white/10 flex items-center justify-center font-bold text-[#00e5ff] text-xs">
                                  {user.username.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="font-bold text-white flex items-center gap-2">
                                  <span>{user.username}</span>
                                  {user.isSuperAdmin && (
                                    <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded font-black">
                                      SUPER
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-gray-500 font-mono truncate max-w-[200px]">
                                  {user.id}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                                user.status === 'ACTIVE'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : user.status === 'SUSPENDED'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
                              }`}
                            >
                              {user.status}
                            </span>
                          </td>

                          <td className="px-4 py-3">{renderRoleBadges(user.roles)}</td>

                          <td className="px-4 py-3 text-right">
                            {user.isSuperAdmin ? (
                              <span className="text-xs text-gray-500 italic">Süper Admin</span>
                            ) : user.isAdmin ? (
                              <button
                                type="button"
                                disabled={isLoading || isPending}
                                onClick={() => handleRevokeAdmin(user)}
                                className="px-3.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 text-xs font-bold transition-all disabled:opacity-50"
                              >
                                {isLoading ? 'İşleniyor...' : 'ADMIN ROLÜNÜ KALDIR'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isLoading || isPending || user.status === 'BANNED'}
                                onClick={() => handleGrantAdmin(user)}
                                className="px-3.5 py-1.5 rounded-lg bg-[#00e5ff] text-black hover:bg-white text-xs font-black tracking-wider uppercase transition-all disabled:opacity-40"
                              >
                                {isLoading ? 'İşleniyor...' : 'ADMIN EKLE'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Active Administrators Section */}
      <div className="client-glass p-6 rounded-2xl border border-white/5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <span>🛡️</span> Mevcut Yöneticiler ({adminsList.length})
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Sistemde aktif ADMIN ve SUPER_ADMIN yetkisine sahip kullanıcılar</p>
          </div>
        </div>

        {adminsList.length === 0 ? (
          <div className="py-8 text-center text-gray-500 text-sm">Aktif yönetici bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0a1628]/60">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0f223d] text-gray-400 uppercase text-[11px] font-bold tracking-wider border-b border-white/10">
                <tr>
                  <th className="px-4 py-3">Yönetici</th>
                  <th className="px-4 py-3">Durum</th>
                  <th className="px-4 py-3">Aktif Roller</th>
                  <th className="px-4 py-3">Kayıt Tarihi</th>
                  <th className="px-4 py-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-gray-300">
                {adminsList.map((admin) => {
                  const isLoading = actionLoadingId === admin.id;

                  return (
                    <tr key={admin.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {admin.avatar_url ? (
                            <img
                              src={admin.avatar_url}
                              alt={admin.username}
                              className="w-10 h-10 rounded-full object-cover border border-white/10"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-[#132338] border border-white/10 flex items-center justify-center font-bold text-[#00e5ff]">
                              {admin.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{admin.username}</span>
                              {admin.isSuperAdmin && (
                                <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded font-black">
                                  SUPER
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 font-mono truncate max-w-[200px]">
                              {admin.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                            admin.status === 'ACTIVE'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : admin.status === 'SUSPENDED'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}
                        >
                          {admin.status}
                        </span>
                      </td>

                      <td className="px-4 py-3">{renderRoleBadges(admin.roles)}</td>

                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(admin.created_at).toLocaleDateString('tr-TR')}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {admin.isSuperAdmin ? (
                          <span className="text-xs text-amber-400/80 font-bold italic bg-amber-500/10 px-2.5 py-1 rounded">
                            Süper Yönetici
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isLoading || isPending}
                            onClick={() => handleRevokeAdmin(admin)}
                            className="px-3.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/30 text-xs font-bold transition-all disabled:opacity-50"
                          >
                            {isLoading ? 'İşleniyor...' : 'ADMIN ROLÜNÜ KALDIR'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
