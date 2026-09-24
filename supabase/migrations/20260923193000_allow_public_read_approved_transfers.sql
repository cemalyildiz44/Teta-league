-- 20260923193000_allow_public_read_approved_transfers.sql
-- Allow anon and authenticated users to read publicly approved transfers
-- Unapproved transfers (PENDING_PLAYER, PENDING_ADMIN, REJECTED, CANCELLED) remain strictly protected by existing RLS policies.

GRANT SELECT ON public.transfers TO anon;

DROP POLICY IF EXISTS "Public read approved transfers" ON public.transfers;
CREATE POLICY "Public read approved transfers"
  ON public.transfers
  FOR SELECT
  TO anon, authenticated
  USING (status = 'APPROVED');
