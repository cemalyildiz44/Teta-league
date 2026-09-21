'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ManagedUser {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
  roles: string[];
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

/**
 * Caller SUPER_ADMIN check (Server-Side verification)
 */
async function verifySuperAdmin(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { authorized: false, error: 'Yetkisiz erişim. Lütfen giriş yapın.', user: null };
  }

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('id, role, is_active, revoked_at')
    .eq('user_id', user.id)
    .eq('role', 'SUPER_ADMIN')
    .eq('is_active', true)
    .is('revoked_at', null)
    .maybeSingle();

  if (!roleRecord) {
    return { authorized: false, error: 'Bu işlemi yapmaya yetkiniz yok. Yalnızca SUPER_ADMIN yetkilidir.', user: null };
  }

  return { authorized: true, error: null, user };
}

/**
 * Grant ADMIN role to a target user
 */
export async function grantAdminRoleAction(targetUserId: string) {
  try {
    if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
      return { success: false, error: 'Geçersiz kullanıcı ID formatı.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { authorized, error: authError, user: caller } = await verifySuperAdmin(supabase);
    if (!authorized || !caller) {
      return { success: false, error: authError };
    }

    // Check target profile exists
    const { data: targetProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, username, status')
      .eq('id', targetUserId)
      .maybeSingle();

    if (profileErr || !targetProfile) {
      return { success: false, error: 'Hedef kullanıcı bulunamadı.' };
    }

    if (targetProfile.status === 'BANNED') {
      return { success: false, error: 'Yasaklı (BANNED) kullanıcılara yönetici rolü verilemez.' };
    }

    // Check if target user already has an ADMIN role record
    const { data: existingAdminRole } = await supabase
      .from('user_roles')
      .select('id, role, is_active')
      .eq('user_id', targetUserId)
      .eq('role', 'ADMIN')
      .is('team_id', null)
      .maybeSingle();

    if (existingAdminRole) {
      if (existingAdminRole.is_active) {
        return { success: false, error: 'Bu kullanıcı zaten aktif bir ADMIN rolüne sahip.' };
      }

      // Re-activate existing inactive ADMIN role
      const { error: updateErr } = await supabase
        .from('user_roles')
        .update({
          is_active: true,
          revoked_at: null,
          granted_at: new Date().toISOString(),
          granted_by: caller.id,
        })
        .eq('id', existingAdminRole.id);

      if (updateErr) {
        console.error('Error re-activating admin role:', updateErr);
        return { success: false, error: `Rol güncellenemedi: ${updateErr.message}` };
      }
    } else {
      // Insert new ADMIN role according to schema
      const { error: insertErr } = await supabase
        .from('user_roles')
        .insert({
          user_id: targetUserId,
          role: 'ADMIN',
          team_id: null,
          league_id: null,
          is_active: true,
          granted_by: caller.id,
          granted_at: new Date().toISOString(),
        });

      if (insertErr) {
        console.error('Error granting admin role:', insertErr);
        return { success: false, error: `Rol eklenemedi: ${insertErr.message}` };
      }
    }

    revalidatePath('/admin/yoneticiler');
    revalidatePath('/admin');
    return { success: true, message: `${targetProfile.username || 'Kullanıcıya'} ADMIN rolü başarıyla verildi.` };
  } catch (err: any) {
    console.error('Unexpected error in grantAdminRoleAction:', err);
    return { success: false, error: err?.message || 'Beklenmeyen bir hata oluştu.' };
  }
}

/**
 * Revoke ADMIN role from a target user
 */
export async function revokeAdminRoleAction(targetUserId: string) {
  try {
    if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
      return { success: false, error: 'Geçersiz kullanıcı ID formatı.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { authorized, error: authError, user: caller } = await verifySuperAdmin(supabase);
    if (!authorized || !caller) {
      return { success: false, error: authError };
    }

    // Prevent self-role revocation
    if (caller.id === targetUserId) {
      return { success: false, error: 'Kendi yöneticilik rolünüzü kaldıramazsınız.' };
    }

    // Check target profile
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('id', targetUserId)
      .maybeSingle();

    if (!targetProfile) {
      return { success: false, error: 'Hedef kullanıcı bulunamadı.' };
    }

    // Check if target has SUPER_ADMIN role (SUPER_ADMIN role must not be touched)
    const { data: targetSuperAdmin } = await supabase
      .from('user_roles')
      .select('id')
      .eq('user_id', targetUserId)
      .eq('role', 'SUPER_ADMIN')
      .eq('is_active', true)
      .maybeSingle();

    if (targetSuperAdmin) {
      return { success: false, error: 'SUPER_ADMIN rolüne sahip kullanıcıların yetkileri bu ekrandan değiştirilemez.' };
    }

    // Find active ADMIN role
    const { data: targetAdminRole } = await supabase
      .from('user_roles')
      .select('id, is_active')
      .eq('user_id', targetUserId)
      .eq('role', 'ADMIN')
      .is('team_id', null)
      .eq('is_active', true)
      .maybeSingle();

    if (!targetAdminRole) {
      return { success: false, error: 'Bu kullanıcının aktif bir ADMIN rolü bulunmuyor.' };
    }

    // Deactivate ADMIN role (trigger sets revoked_at = CURRENT_TIMESTAMP)
    const { error: revokeErr } = await supabase
      .from('user_roles')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('id', targetAdminRole.id);

    if (revokeErr) {
      console.error('Error revoking admin role:', revokeErr);
      return { success: false, error: `Rol kaldırılamadı: ${revokeErr.message}` };
    }

    revalidatePath('/admin/yoneticiler');
    revalidatePath('/admin');
    return { success: true, message: `${targetProfile.username || 'Kullanıcının'} ADMIN rolü başarıyla kaldırıldı.` };
  } catch (err: any) {
    console.error('Unexpected error in revokeAdminRoleAction:', err);
    return { success: false, error: err?.message || 'Beklenmeyen bir hata oluştu.' };
  }
}

/**
 * Search users by username or UUID
 */
export async function searchUsersAction(query: string): Promise<{ success: boolean; users?: ManagedUser[]; error?: string }> {
  try {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      return { success: false, error: 'Arama için en az 2 karakter giriniz.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { authorized, error: authError } = await verifySuperAdmin(supabase);
    if (!authorized) {
      return { success: false, error: authError || 'Yetkisiz erişim.' };
    }

    let profileQuery = supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, status, created_at')
      .limit(25);

    if (UUID_REGEX.test(trimmed)) {
      profileQuery = profileQuery.eq('id', trimmed);
    } else {
      profileQuery = profileQuery.ilike('username', `%${trimmed}%`);
    }

    const { data: profiles, error: pErr } = await profileQuery;
    if (pErr) {
      return { success: false, error: pErr.message };
    }

    if (!profiles || profiles.length === 0) {
      return { success: true, users: [] };
    }

    const userIds = profiles.map((p: any) => p.id);

    const { data: roles } = await supabase
      .from('user_roles')
      .select('id, user_id, role, is_active')
      .in('user_id', userIds)
      .eq('is_active', true)
      .is('revoked_at', null);

    const rolesByUser = new Map<string, string[]>();
    roles?.forEach((r: any) => {
      const list = rolesByUser.get(r.user_id) || [];
      if (!list.includes(r.role)) {
        list.push(r.role);
      }
      rolesByUser.set(r.user_id, list);
    });

    const users: ManagedUser[] = profiles.map((p: any) => {
      const userRoles = rolesByUser.get(p.id) || [];
      return {
        id: p.id,
        username: p.username || 'İsimsiz',
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        status: p.status || 'ACTIVE',
        created_at: p.created_at,
        roles: userRoles,
        isAdmin: userRoles.includes('ADMIN'),
        isSuperAdmin: userRoles.includes('SUPER_ADMIN'),
      };
    });

    return { success: true, users };
  } catch (err: any) {
    console.error('Unexpected error in searchUsersAction:', err);
    return { success: false, error: err?.message || 'Arama sırasında hata oluştu.' };
  }
}
