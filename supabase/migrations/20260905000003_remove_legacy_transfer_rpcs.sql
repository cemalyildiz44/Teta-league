-- ==============================================================================
-- Migration: 20260905000003_remove_legacy_transfer_rpcs.sql
-- Description: Drop legacy transfer RPCs respond_to_transfer and approve_transfer
-- ==============================================================================

DROP FUNCTION IF EXISTS public.respond_to_transfer(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.approve_transfer(UUID);
