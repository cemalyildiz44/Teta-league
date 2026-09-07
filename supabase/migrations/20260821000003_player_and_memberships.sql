-- 003_memberships_and_transfers.sql
CREATE TABLE player_ea_id_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    ea_player_id TEXT NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_to TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_active_ea_id ON player_ea_id_history(ea_player_id) WHERE valid_to IS NULL;
CREATE INDEX idx_ea_history_player ON player_ea_id_history(player_id, valid_to);

CREATE TABLE team_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    team_id UUID NOT NULL,
    league_id UUID NOT NULL,
    season_id UUID NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at TIMESTAMPTZ,
    FOREIGN KEY (league_id, season_id, team_id) REFERENCES league_teams(league_id, season_id, team_id) ON DELETE RESTRICT,
    CONSTRAINT chk_membership_dates CHECK (left_at IS NULL OR left_at >= joined_at)
);
CREATE UNIQUE INDEX uq_active_team_membership ON team_memberships(player_id, season_id) WHERE left_at IS NULL;
CREATE INDEX idx_memberships_team_season ON team_memberships(team_id, season_id, left_at);

CREATE TABLE transfer_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_open BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_dates CHECK (end_date > start_date),
    UNIQUE (id, season_id)
);

CREATE TABLE transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_window_id UUID NOT NULL,
    season_id UUID NOT NULL,
    player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    from_team_id UUID REFERENCES teams(id) ON DELETE RESTRICT,
    to_team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    status transfer_status_enum NOT NULL DEFAULT 'PENDING_PLAYER',
    player_responded_at TIMESTAMPTZ,
    player_note TEXT,
    admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    admin_acted_at TIMESTAMPTZ,
    admin_note TEXT,
    effective_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (transfer_window_id, season_id) REFERENCES transfer_windows(id, season_id) ON DELETE RESTRICT,
    CONSTRAINT chk_transfer_teams CHECK (from_team_id IS NULL OR from_team_id <> to_team_id)
);
CREATE INDEX idx_transfers_player_season ON transfers(player_id, season_id);
CREATE INDEX idx_transfers_status ON transfers(status, season_id);
