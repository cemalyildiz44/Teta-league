-- ==============================================================================
-- Migration: 20261003234500_restrict_audit_logs_to_admins.sql
-- Description: Restricts audit_logs table read access strictly to ADMIN and SUPER_ADMIN roles.
-- Drops the legacy 'Captains read own match audit_logs' policy.
-- Preserves 'Admin read audit_logs' (SELECT) and 'Admin insert audit_logs' (INSERT).
-- Strictly APPEND-ONLY: No UPDATE or DELETE policies.
-- ==============================================================================

-- 1. Drop the captain read policy on audit_logs
DROP POLICY IF EXISTS "Captains read own match audit_logs" ON public.audit_logs;

-- 2. Verify RLS is enabled on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
