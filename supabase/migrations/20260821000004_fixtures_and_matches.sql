-- 004_fixtures_and_matches.sql
CREATE TABLE fixtures (
    id UUID DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL,
    league_id UUID NOT NULL,
    week_number INTEGER NOT NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status fixture_status_enum NOT NULL DEFAULT 'SCHEDULED',
    notes TEXT,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    UNIQUE (id, season_id, league_id, home_team_id, away_team_id),
    FOREIGN KEY (league_id, season_id, home_team_id) REFERENCES league_teams(league_id, season_id, team_id) ON DELETE RESTRICT,
    FOREIGN KEY (league_id, season_id, away_team_id) REFERENCES league_teams(league_id, season_id, team_id) ON DELETE RESTRICT,
    CONSTRAINT chk_diff_teams CHECK (home_team_id != away_team_id),
    CONSTRAINT chk_week_positive CHECK (week_number >= 1)
);
CREATE INDEX idx_fixtures_schedule ON fixtures(league_id, week_number);

CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fixture_id UUID,
    season_id UUID NOT NULL,
    league_id UUID NOT NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    source match_source_enum NOT NULL,
    status match_status_enum NOT NULL DEFAULT 'PENDING_REVIEW',
    ea_match_id TEXT,
    played_at TIMESTAMPTZ,
    screenshot_url TEXT,
    submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    is_stats_applied BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A linked fixture is immutable as a relationship: deleting the fixture is
    -- blocked while a match references it. The composite FK also guarantees
    -- season/league/home/away consistency.
    FOREIGN KEY (fixture_id, season_id, league_id, home_team_id, away_team_id)
      REFERENCES fixtures(id, season_id, league_id, home_team_id, away_team_id)
      ON DELETE RESTRICT,
    FOREIGN KEY (league_id, season_id, home_team_id) REFERENCES league_teams(league_id, season_id, team_id) ON DELETE RESTRICT,
    FOREIGN KEY (league_id, season_id, away_team_id) REFERENCES league_teams(league_id, season_id, team_id) ON DELETE RESTRICT,
    CONSTRAINT chk_diff_teams_match CHECK (home_team_id != away_team_id),
    CONSTRAINT chk_scores CHECK (
      (home_score IS NULL OR home_score >= 0) AND
      (away_score IS NULL OR away_score >= 0)
    ),
    CONSTRAINT chk_approved_scores CHECK (
      status != 'APPROVED' OR (home_score IS NOT NULL AND away_score IS NOT NULL)
    ),
    CONSTRAINT chk_approved_admin CHECK (
      status != 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    )
);
CREATE UNIQUE INDEX uq_ea_match_id ON matches(ea_match_id) WHERE ea_match_id IS NOT NULL;
CREATE UNIQUE INDEX uq_match_fixture ON matches(fixture_id) WHERE fixture_id IS NOT NULL;

CREATE TABLE match_raw_ea_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE UNIQUE,
    ea_match_id TEXT NOT NULL,
    raw_data JSONB NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    platform TEXT NOT NULL DEFAULT 'common-gen5'
);

CREATE TABLE match_player_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
    ea_player_id TEXT,
    ea_player_name TEXT,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    position TEXT,
    goals INTEGER NOT NULL DEFAULT 0,
    assists INTEGER NOT NULL DEFAULT 0,
    rating NUMERIC(4,2),
    shots INTEGER NOT NULL DEFAULT 0,
    passes_made INTEGER NOT NULL DEFAULT 0,
    pass_attempts INTEGER NOT NULL DEFAULT 0,
    tackles_made INTEGER NOT NULL DEFAULT 0,
    tackle_attempts INTEGER NOT NULL DEFAULT 0,
    saves INTEGER NOT NULL DEFAULT 0,
    goals_conceded INTEGER NOT NULL DEFAULT 0,
    cleansheets_gk INTEGER NOT NULL DEFAULT 0,
    cleansheets_def INTEGER NOT NULL DEFAULT 0,
    red_cards INTEGER NOT NULL DEFAULT 0,
    is_mom BOOLEAN NOT NULL DEFAULT false,
    extra_stats JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_stats_positive CHECK (
      goals >= 0 AND assists >= 0 AND shots >= 0 AND passes_made >= 0 AND
      pass_attempts >= 0 AND tackles_made >= 0 AND tackle_attempts >= 0 AND
      saves >= 0 AND goals_conceded >= 0 AND cleansheets_gk >= 0 AND
      cleansheets_def >= 0 AND red_cards >= 0
    ),
    CONSTRAINT chk_stats_identity CHECK (
      player_id IS NOT NULL OR ea_player_id IS NOT NULL OR ea_player_name IS NOT NULL
    ),
    CONSTRAINT chk_rating CHECK (rating IS NULL OR (rating >= 0 AND rating <= 10))
);
CREATE UNIQUE INDEX uq_match_player ON match_player_stats(match_id, player_id) WHERE player_id IS NOT NULL;
CREATE UNIQUE INDEX uq_match_eaplayer ON match_player_stats(match_id, ea_player_id) WHERE ea_player_id IS NOT NULL;
