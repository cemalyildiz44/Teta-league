export interface AuditLogItem {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label?: string | null;
  description: string | null;
  old_data?: Record<string, any> | null;
  new_data?: Record<string, any> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  actor?: {
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
}

export interface AuditLogFilters {
  page: number;
  pageSize: number;
  entityType?: string;
  action?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}
