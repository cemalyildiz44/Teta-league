import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ManagersClient from './ManagersClient';
import { ManagedUser } from './actions';

export const metadata = {
  title: 'Yönetici Yönetimi | TETA League Admin',
  description: 'Süper Admin yönetici yetkilendirme ve rol kontrol paneli',
};

export default async function AdminYoneticilerPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/giris');
  }

  // 2. Strict SUPER_ADMIN check
  const { data: superAdminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'SUPER_ADMIN')
    .eq('is_active', true)
    .is('revoked_at', null)
    .maybeSingle();

  if (!superAdminRole) {
    // Non-super-admins are redirected back to admin dashboard
    redirect('/admin');
  }

  // 3. Fetch all active ADMIN and SUPER_ADMIN users
  const { data: adminRoleRows } = await supabase
    .from('user_roles')
    .select('user_id, role, granted_at, is_active')
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .is('revoked_at', null);

  const initialAdmins: ManagedUser[] = [];

  if (adminRoleRows && adminRoleRows.length > 0) {
    const userIds = Array.from(new Set(adminRoleRows.map((r: any) => r.user_id)));

    // Fetch profiles for these users
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, status, created_at')
      .in('id', userIds);

    // Fetch ALL active roles for these users
    const { data: allUserRoles } = await supabase
      .from('user_roles')
      .select('user_id, role')
      .in('user_id', userIds)
      .eq('is_active', true)
      .is('revoked_at', null);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
    const rolesMap = new Map<string, string[]>();

    (allUserRoles || []).forEach((r: any) => {
      const existing = rolesMap.get(r.user_id) || [];
      if (!existing.includes(r.role)) {
        existing.push(r.role);
      }
      rolesMap.set(r.user_id, existing);
    });

    for (const uId of userIds) {
      const prof = profileMap.get(uId);
      if (!prof) continue;

      const userRoleList = rolesMap.get(uId) || [];
      initialAdmins.push({
        id: prof.id,
        username: prof.username || 'İsimsiz',
        full_name: prof.full_name,
        avatar_url: prof.avatar_url,
        status: prof.status || 'ACTIVE',
        created_at: prof.created_at,
        roles: userRoleList,
        isAdmin: userRoleList.includes('ADMIN'),
        isSuperAdmin: userRoleList.includes('SUPER_ADMIN'),
      });
    }
  }

  return <ManagersClient initialAdmins={initialAdmins} />;
}
