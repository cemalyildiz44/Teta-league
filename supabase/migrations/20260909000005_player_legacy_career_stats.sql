-- 20260909000005_player_legacy_career_stats.sql
-- PAKET 6: Granüler Legacy Kariyer Sistemi (Player Legacy Career Stats)
-- NOTE: DO NOT EXECUTE ON PRODUCTION DB MANUALLY. PENDING REVIEW.

-- 1. player_legacy_career_stats tablosu
CREATE TABLE IF NOT EXISTS player_legacy_career_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    season_name TEXT NOT NULL,
    league_name TEXT NOT NULL,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    team_name TEXT NOT NULL,
    matches_played INTEGER NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
    wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
    draws INTEGER NOT NULL DEFAULT 0 CHECK (draws >= 0),
    losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
    goals INTEGER NOT NULL DEFAULT 0 CHECK (goals >= 0),
    assists INTEGER NOT NULL DEFAULT 0 CHECK (assists >= 0),
    rating_avg NUMERIC(4,2) NOT NULL DEFAULT 0.00 CHECK (rating_avg >= 0.00 AND rating_avg <= 10.00),
    clean_sheets INTEGER NOT NULL DEFAULT 0 CHECK (clean_sheets >= 0),
    red_cards INTEGER NOT NULL DEFAULT 0 CHECK (red_cards >= 0),
    market_value BIGINT NOT NULL DEFAULT 0 CHECK (market_value >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,

    -- Maç/Sonuç Matematiksel Tutarlılık Kuralı:
    CONSTRAINT chk_legacy_matches_math CHECK (wins + draws + losses = matches_played)
);

-- 2. Duplicate Koruması: Çift Partial Unique Index
-- A) Mevcut gerçek takımlı kayıtlar için duplicate koruması:
CREATE UNIQUE INDEX IF NOT EXISTS uq_player_legacy_linked_team 
    ON player_legacy_career_stats (player_id, season_name, team_id) 
    WHERE deleted_at IS NULL AND team_id IS NOT NULL;

-- B) Özel/Tarihsel takımlı kayıtlar için duplicate koruması:
CREATE UNIQUE INDEX IF NOT EXISTS uq_player_legacy_custom_team 
    ON player_legacy_career_stats (player_id, season_name, team_name) 
    WHERE deleted_at IS NULL AND team_id IS NULL;

-- 3. Performans İndexleri
CREATE INDEX IF NOT EXISTS idx_player_legacy_career_player 
    ON player_legacy_career_stats (player_id) 
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_player_legacy_career_team 
    ON player_legacy_career_stats (team_id) 
    WHERE deleted_at IS NULL AND team_id IS NOT NULL;

-- 4. Row Level Security (RLS)
ALTER TABLE player_legacy_career_stats ENABLE ROW LEVEL SECURITY;

-- Public Okuma: Yalnızca silinmemiş kayıtlar
CREATE POLICY "Public read player_legacy_career_stats"
    ON player_legacy_career_stats FOR SELECT TO anon, authenticated
    USING (deleted_at IS NULL);

-- Admin Ekleme
CREATE POLICY "Admin insert player_legacy_career_stats"
    ON player_legacy_career_stats FOR INSERT TO authenticated
    WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- Admin Güncelleme (ve Soft Delete)
CREATE POLICY "Admin update player_legacy_career_stats"
    ON player_legacy_career_stats FOR UPDATE TO authenticated
    USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
    WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 5. Tablo Seviyesi İzinler (Fiziksel DELETE hariç tutuldu)
GRANT SELECT ON TABLE public.player_legacy_career_stats TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.player_legacy_career_stats TO authenticated;

-- 6. Audit Log Trigger (Varsa mevcut fonksiyonu reuse et)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'audit_log_action') THEN
        DROP TRIGGER IF EXISTS trg_audit_player_legacy_career_stats ON player_legacy_career_stats;
        CREATE TRIGGER trg_audit_player_legacy_career_stats
            AFTER INSERT OR UPDATE ON player_legacy_career_stats
            FOR EACH ROW EXECUTE FUNCTION audit_log_action();
    END IF;
END $$;
