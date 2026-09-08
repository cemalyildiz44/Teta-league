-- 20260909000001_add_beta_registered_to_profiles.sql
-- Add beta_registered column to profiles for tracking users with existing beta website accounts

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS beta_registered BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.beta_registered IS 'Indicates whether the user opted in having their stats/market value transferred from the beta website';

-- Update handle_new_user function to record beta_registered from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username, beta_registered, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    CASE WHEN LOWER(COALESCE(NEW.raw_user_meta_data->>'beta_registered', 'false')) IN ('true', 't', '1') THEN true ELSE false END,
    now(),
    now()
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'PLAYER');

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Backfill any users registered before migration was applied
UPDATE public.profiles p
SET beta_registered = CASE WHEN LOWER(COALESCE(u.raw_user_meta_data->>'beta_registered', 'false')) IN ('true', 't', '1') THEN true ELSE false END
FROM auth.users u
WHERE p.id = u.id AND u.raw_user_meta_data->>'beta_registered' IS NOT NULL;
