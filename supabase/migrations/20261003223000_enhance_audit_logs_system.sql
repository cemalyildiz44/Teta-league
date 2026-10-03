-- ==============================================================================
-- Migration: 20261003223000_enhance_audit_logs_system.sql
-- Description: Enhances the existing audit_logs table for application-level admin auditing.
-- Adds readable entity_label, user_agent columns, query performance indexes,
-- and grants INSERT permissions to ADMIN and SUPER_ADMIN roles under RLS.
-- NOTE: Strictly APPEND-ONLY. No UPDATE or DELETE privileges/policies are granted.
-- ==============================================================================

-- 1. Add optional entity_label and user_agent columns if they don't already exist
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS entity_label TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- 2. Performance indexes for /admin/audit-logs listing and filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON public.audit_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs (actor_id);

-- 3. Grant INSERT permission to authenticated role
GRANT INSERT ON TABLE public.audit_logs TO authenticated;

-- 4. RLS Policy: Admins and Super Admins can insert audit log records
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'audit_logs' AND policyname = 'Admin insert audit_logs'
    ) THEN
        CREATE POLICY "Admin insert audit_logs"
          ON public.audit_logs FOR INSERT TO authenticated
          WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));
    END IF;
END $$;
