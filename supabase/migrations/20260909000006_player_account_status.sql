-- ==============================================================================
-- Migration: 20260909000006_player_account_status.sql
-- Description: Add status column (ACTIVE, SUSPENDED, BANNED) to profiles,
--              case-insensitive lower(username) unique index,
--              and attach audit_log_action trigger to profiles.
-- ==============================================================================

-- 1. Add status column with default 'ACTIVE'
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';

-- 2. Add CHECK constraint for status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_profiles_status' AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT chk_profiles_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'BANNED'));
    END IF;
END $$;

-- 3. Backfill status based on existing is_active flag
UPDATE public.profiles
SET status = 'SUSPENDED'
WHERE is_active = false AND status = 'ACTIVE';

-- 4. Create index on status for fast filtering
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- 5. Create case-insensitive functional unique index on lower(username)
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_lower ON public.profiles (lower(username));

-- 6. Attach existing audit_log_action() trigger to profiles for automated auditing
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_log_action') THEN
        DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
        CREATE TRIGGER trg_audit_profiles
            AFTER INSERT OR UPDATE OR DELETE ON public.profiles
            FOR EACH ROW
            EXECUTE FUNCTION audit_log_action();
    END IF;
END $$;
