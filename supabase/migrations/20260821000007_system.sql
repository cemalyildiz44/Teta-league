-- 007_system.sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type notification_type_enum NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    reference_type TEXT,
    reference_id UUID,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    description TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ea_sync_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    check_days INTEGER[] NOT NULL DEFAULT '{3}',
    check_start_hour INTEGER NOT NULL DEFAULT 20,
    check_end_hour INTEGER NOT NULL DEFAULT 2,
    check_interval_minutes INTEGER NOT NULL DEFAULT 15,
    platform TEXT NOT NULL DEFAULT 'common-gen5',
    match_type TEXT NOT NULL DEFAULT 'friendlyMatch',
    last_synced_at TIMESTAMPTZ,
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_hours CHECK (check_start_hour BETWEEN 0 AND 23 AND check_end_hour BETWEEN 0 AND 23),
    CONSTRAINT chk_interval CHECK (check_interval_minutes >= 1)
);

CREATE TABLE ea_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status sync_status_enum NOT NULL DEFAULT 'RUNNING',
    fixtures_checked INTEGER NOT NULL DEFAULT 0,
    ea_matches_fetched INTEGER NOT NULL DEFAULT 0,
    matches_linked INTEGER NOT NULL DEFAULT 0,
    matches_already_exist INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    details JSONB,
    CONSTRAINT chk_sync_counts CHECK (
      fixtures_checked >= 0 AND ea_matches_fetched >= 0 AND
      matches_linked >= 0 AND matches_already_exist >= 0
    )
);
