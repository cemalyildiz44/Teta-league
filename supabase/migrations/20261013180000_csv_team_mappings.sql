-- 20261013180000_csv_team_mappings.sql
-- TETA LEAGUE: CSV İçe Aktarma Kalıcı Takım Eşleştirmeleri (Persistent Team Mappings)
-- NOTE: DO NOT EXECUTE ON PRODUCTION DB MANUALLY. PENDING REVIEW.

-- 1. csv_team_mappings tablosu
CREATE TABLE IF NOT EXISTS csv_team_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_team_name TEXT NOT NULL,
    target_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    target_custom_name TEXT,
    mapping_type TEXT NOT NULL CHECK (mapping_type IN ('EXISTING_TEAM', 'CUSTOM_HISTORICAL')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

    -- Her kaynak takım adı için tekil eşleştirme
    CONSTRAINT uq_csv_team_mappings_source UNIQUE (source_team_name)
);

-- 2. İndeksler
CREATE INDEX IF NOT EXISTS idx_csv_team_mappings_source_lower
    ON csv_team_mappings (lower(source_team_name));

CREATE INDEX IF NOT EXISTS idx_csv_team_mappings_target
    ON csv_team_mappings (target_team_id)
    WHERE target_team_id IS NOT NULL;

-- 3. Row Level Security (RLS)
ALTER TABLE csv_team_mappings ENABLE ROW LEVEL SECURITY;

-- Yalnızca ADMIN ve SUPER_ADMIN okuyabilir
CREATE POLICY "Admin read csv_team_mappings"
    ON csv_team_mappings FOR SELECT TO authenticated
    USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- Yalnızca ADMIN ve SUPER_ADMIN ekleyebilir
CREATE POLICY "Admin insert csv_team_mappings"
    ON csv_team_mappings FOR INSERT TO authenticated
    WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- Yalnızca ADMIN ve SUPER_ADMIN güncelleyebilir
CREATE POLICY "Admin update csv_team_mappings"
    ON csv_team_mappings FOR UPDATE TO authenticated
    USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'))
    WITH CHECK (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- Yalnızca ADMIN ve SUPER_ADMIN silebilir
CREATE POLICY "Admin delete csv_team_mappings"
    ON csv_team_mappings FOR DELETE TO authenticated
    USING (has_role('ADMIN') OR has_role('SUPER_ADMIN'));

-- 4. İzinler
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.csv_team_mappings TO authenticated;
