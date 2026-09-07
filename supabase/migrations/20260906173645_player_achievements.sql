CREATE TABLE IF NOT EXISTS public.player_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    achievement_type TEXT NOT NULL CHECK (achievement_type IN ('TOTW', 'MATCH_POTM', 'MONTH_POTM', 'POTS')),
    season_id UUID REFERENCES public.seasons(id) ON DELETE CASCADE,
    match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
    week_number INTEGER,
    month_number INTEGER,
    awarded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    awarded_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Unique Constraints to prevent duplicates
-- A player can only have one POTM per match
ALTER TABLE public.player_achievements
ADD CONSTRAINT unique_potm_per_match UNIQUE NULLS NOT DISTINCT (player_id, match_id, achievement_type);

-- A player can only have one TOTW per week per season
ALTER TABLE public.player_achievements
ADD CONSTRAINT unique_totw_per_week UNIQUE NULLS NOT DISTINCT (player_id, season_id, week_number, achievement_type);

-- A player can only have one Monthly POTM per month per season
ALTER TABLE public.player_achievements
ADD CONSTRAINT unique_monthly_potm UNIQUE NULLS NOT DISTINCT (player_id, season_id, month_number, achievement_type);

-- A player can only have one POTS per season
ALTER TABLE public.player_achievements
ADD CONSTRAINT unique_pots_per_season UNIQUE NULLS NOT DISTINCT (player_id, season_id, achievement_type);

-- RLS Policies
ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view player achievements"
ON public.player_achievements
FOR SELECT
USING (true);

-- We need a function to check admin status if not already available, but we can just use the user_roles table
CREATE POLICY "Admins can manage player achievements"
ON public.player_achievements
FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role IN ('ADMIN', 'SUPER_ADMIN')
        AND ur.is_active = true
    )
);

-- Create index for faster querying by player
CREATE INDEX idx_player_achievements_player_id ON public.player_achievements(player_id);
