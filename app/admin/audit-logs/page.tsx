import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCachedUser } from '@/lib/fetchers';
import AuditLogsClient from './AuditLogsClient';
import { AuditLogItem } from '@/types/audit';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    page?: string;
    entity_type?: string;
    action?: string;
    q?: string;
  }>;
}

export default async function AdminAuditLogsPage({ searchParams }: PageProps) {
  const user = await getCachedUser();
  if (!user) redirect('/giris');

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  // 1. Yetki Kontrolü: Yalnızca ADMIN veya SUPER_ADMIN erişebilir
  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['ADMIN', 'SUPER_ADMIN'])
    .eq('is_active', true)
    .maybeSingle();

  if (!adminRole) {
    redirect('/');
  }

  const resolvedParams = await searchParams;
  const page = Math.max(1, parseInt(resolvedParams.page || '1', 10) || 1);
  const pageSize = 50;
  const entityType = resolvedParams.entity_type?.trim();
  const actionFilter = resolvedParams.action?.trim();
  const searchQuery = resolvedParams.q?.trim();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // 2. Ana sorguyu oluştur
  // Kolon varlık toleransı için sorgu yapısı
  const buildQuery = (selectCols: string) => {
    let q = supabase
      .from('audit_logs')
      .select(selectCols, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (entityType) {
      q = q.eq('entity_type', entityType);
    }

    if (actionFilter) {
      const upper = actionFilter.toUpperCase();
      if (upper === 'CREATE') {
        q = q.or('action.ilike.%CREATE%,action.ilike.%ADD%,action.ilike.%GRANT%');
      } else if (upper === 'UPDATE') {
        q = q.or('action.ilike.%UPDATE%,action.ilike.%REVIEW%,action.ilike.%EDIT%');
      } else if (upper === 'DELETE') {
        q = q.or('action.ilike.%DELETE%,action.ilike.%REVOKE%');
      } else if (upper === 'APPROVE') {
        q = q.or('action.ilike.%APPROVE%,action.ilike.%REVIEW%');
      } else if (upper === 'PENALTY') {
        q = q.or('action.ilike.%PENALTY%,action.ilike.%WARN%');
      } else if (upper === 'ROLE') {
        q = q.or('action.ilike.%ROLE%,action.ilike.%GRANT%,action.ilike.%REVOKE%');
      } else {
        q = q.ilike('action', `%${actionFilter}%`);
      }
    }

    if (searchQuery) {
      q = q.or(`description.ilike.%${searchQuery}%,action.ilike.%${searchQuery}%,entity_type.ilike.%${searchQuery}%`);
    }

    return q;
  };

  // Birincil sorgu: entity_label ve user_agent kolonları mevcutsa
  const primaryCols = `
    id,
    actor_id,
    action,
    entity_type,
    entity_id,
    entity_label,
    description,
    old_data,
    new_data,
    ip_address,
    user_agent,
    created_at,
    profiles:actor_id (
      username,
      full_name,
      avatar_url
    )
  `;

  let logsData: any[] = [];
  let totalCount = 0;

  const { data: primaryResult, count: primaryCount, error: primaryErr } = await buildQuery(primaryCols);

  if (primaryErr) {
    // Migration henüz prod veritabanına uygulanmamışsa tolerans göster ve temel kolonlarla tekrar dene
    const fallbackCols = `
      id,
      actor_id,
      action,
      entity_type,
      entity_id,
      description,
      old_data,
      new_data,
      ip_address,
      created_at,
      profiles:actor_id (
        username,
        full_name,
        avatar_url
      )
    `;

    const { data: fallbackResult, count: fallbackCount, error: fallbackErr } = await buildQuery(fallbackCols);

    if (fallbackErr) {
      console.error('[AUDIT_LOG_QUERY_ERROR] Both primary and fallback queries failed:', fallbackErr);
    } else {
      logsData = fallbackResult || [];
      totalCount = fallbackCount || 0;
    }
  } else {
    logsData = primaryResult || [];
    totalCount = primaryCount || 0;
  }

  // 3. İstatistikler (Son 24 saat ve genel özet)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: last24hCount } = await supabase
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', twentyFourHoursAgo);

  const formattedLogs: AuditLogItem[] = logsData.map((row) => {
    const actorObj = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.id,
      created_at: row.created_at,
      actor_id: row.actor_id,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      entity_label: row.entity_label || row.new_data?._meta?.entity_label || null,
      description: row.description,
      old_data: row.old_data,
      new_data: row.new_data,
      ip_address: row.ip_address,
      user_agent: row.user_agent || row.new_data?._meta?.user_agent || null,
      actor: actorObj || null,
    };
  });

  return (
    <AuditLogsClient
      logs={formattedLogs}
      totalCount={totalCount}
      currentPage={page}
      pageSize={pageSize}
      currentFilters={{
        entityType,
        action: actionFilter,
        search: searchQuery,
      }}
      stats={{
        totalLogs: totalCount,
        last24hCount: last24hCount || 0,
        distinctEntitiesCount: 10,
      }}
    />
  );
}
