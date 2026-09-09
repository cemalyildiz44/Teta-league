-- 20260909000004_admin_enhancements.sql
-- PAKET 6: Admin Oyuncular (Beta Old Stats) ve Ceza Sistemi (team_penalties)
-- NOTE: DO NOT EXECUTE ON PRODUCTION DB MANUALLY. PENDING REVIEW.

-- 1. profiles tablosuna eski beta istatistikleri için JSONB kolonu ekleme
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS beta_old_stats JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. team_penalties tablosu oluşturma
CREATE TABLE IF NOT EXISTS team_penalties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    penalty_type TEXT NOT NULL CHECK (penalty_type IN ('WARNING', 'POINTS_DEDUCTION', 'EXPULSION')),
    points_deducted INTEGER NOT NULL DEFAULT 0 CHECK (points_deducted >= 0),
    violation_order INTEGER NOT NULL CHECK (violation_order >= 1),
    reason TEXT NOT NULL,
    match_id UUID REFERENCES matches(id) ON DELETE SET NULL,
    target_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    issued_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    revoked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    CONSTRAINT fk_team_penalties_league_teams 
        FOREIGN KEY (league_id, season_id, team_id) 
        REFERENCES league_teams(league_id, season_id, team_id) 
        ON DELETE CASCADE
);

-- 3. İptal edilmemiş cezalar için partial unique index (aynı takım + sezon için aynı sıra ceza iki kez verilmesin)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_team_penalty_step 
    ON team_penalties (team_id, season_id, violation_order) 
    WHERE is_revoked = false;

-- 4. Sorgu performans indexleri
CREATE INDEX IF NOT EXISTS idx_team_penalties_team_season 
    ON team_penalties(team_id, season_id);

CREATE INDEX IF NOT EXISTS idx_team_penalties_league_season 
    ON team_penalties(league_id, season_id);

-- 5. Row Level Security (RLS)
ALTER TABLE team_penalties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read team_penalties"
    ON team_penalties FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "Admin manage team_penalties"
    ON team_penalties FOR ALL TO authenticated
    USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
    WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 5b. Table privileges (required: PostgreSQL evaluates GRANTs before RLS)
-- Pattern matches existing project convention (see 20260904000001_tournament_applications.sql)
GRANT SELECT ON TABLE public.team_penalties TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.team_penalties TO authenticated;

-- 6. Audit Log Trigger
CREATE TRIGGER trg_audit_team_penalties
    AFTER INSERT OR UPDATE OR DELETE ON team_penalties
    FOR EACH ROW EXECUTE FUNCTION audit_log_action();

-- 7. Kaptanların kendi maçlarının audit loglarını okuyabilmesi için RLS politikası
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Captains read own match audit_logs'
    ) THEN
        CREATE POLICY "Captains read own match audit_logs"
            ON audit_logs FOR SELECT TO authenticated
            USING (
                entity_type = 'matches' AND EXISTS (
                    SELECT 1 FROM matches m
                    JOIN user_roles ur ON ur.user_id = auth.uid() AND ur.role = 'CAPTAIN' AND ur.is_active = true
                    WHERE m.id = audit_logs.entity_id AND (m.home_team_id = ur.team_id OR m.away_team_id = ur.team_id)
                )
            );
    END IF;
END $$;
