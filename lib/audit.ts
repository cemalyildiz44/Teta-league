import { cookies, headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export interface AuditLogInput {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  entity_label?: string | null;
  description: string;
  old_data?: any;
  new_data?: any;
  actor_id?: string | null;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'access_token',
  'refresh_token',
  'session',
  'authorization',
  'cookie',
  'cookies',
]);

/**
 * Strips any sensitive credentials, passwords, or tokens from audit metadata
 */
function sanitizeAuditData(data: any): any {
  if (!data || typeof data !== 'object') return data ?? null;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeAuditData(item));
  }

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = sanitizeAuditData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Records an immutable administrative audit log into public.audit_logs.
 * Designed to be fault-tolerant: audit failures are logged to console.error
 * and will never cause the primary admin business transaction to fail or roll back.
 */
export async function logAdminAudit(input: AuditLogInput): Promise<void> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    let actorId = input.actor_id || null;
    if (!actorId) {
      const { data: { user } } = await supabase.auth.getUser();
      actorId = user?.id || null;
    }

    let ipAddress: string | null = null;
    let userAgent: string | null = null;

    try {
      const headerList = await headers();
      ipAddress =
        headerList.get('x-forwarded-for')?.split(',')[0].trim() ||
        headerList.get('x-real-ip') ||
        null;
      userAgent = headerList.get('user-agent') || null;
    } catch {
      // headers() may fail in non-standard server contexts
    }

    const sanitizedOld = sanitizeAuditData(input.old_data);
    const sanitizedNew = sanitizeAuditData(input.new_data);

    // Primary payload including entity_label and user_agent
    const payloadWithExtendedFields: Record<string, any> = {
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id || null,
      entity_label: input.entity_label || null,
      description: input.description,
      old_data: sanitizedOld,
      new_data: sanitizedNew,
      actor_id: actorId,
      ip_address: ipAddress,
      user_agent: userAgent,
    };

    const { error } = await supabase.from('audit_logs').insert(payloadWithExtendedFields);

    if (error) {
      // If error is due to columns entity_label or user_agent not existing yet in production,
      // fallback seamlessly to the baseline audit_logs schema without failing.
      const errorMsg = error.message?.toLowerCase() || '';
      if (
        errorMsg.includes('entity_label') ||
        errorMsg.includes('user_agent') ||
        error.code === 'PGRST204'
      ) {
        const fallbackNewData = {
          ...(typeof sanitizedNew === 'object' && sanitizedNew !== null ? sanitizedNew : {}),
          _meta: {
            entity_label: input.entity_label || null,
            user_agent: userAgent,
          },
        };

        const fallbackPayload: Record<string, any> = {
          action: input.action,
          entity_type: input.entity_type,
          entity_id: input.entity_id || null,
          description: input.description,
          old_data: sanitizedOld,
          new_data: fallbackNewData,
          actor_id: actorId,
          ip_address: ipAddress,
        };

        const { error: fallbackError } = await supabase.from('audit_logs').insert(fallbackPayload);
        if (fallbackError) {
          console.error('[AUDIT_LOG_ERROR] Fallback insert failed:', fallbackError);
        }
      } else {
        console.error('[AUDIT_LOG_ERROR] Failed to record audit log:', error);
      }
    }
  } catch (err) {
    console.error('[AUDIT_LOG_ERROR] Unexpected error in logAdminAudit:', err);
  }
}
