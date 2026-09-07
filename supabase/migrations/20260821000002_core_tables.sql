-- 002_core_tables.sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    full_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    primary_position TEXT,
    alternative_positions TEXT[] DEFAULT '{}',
    platform TEXT DEFAULT 'common-gen5',
    current_ea_player_id TEXT UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    social_links JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_ea_id ON profiles(current_ea_player_id);

CREATE TABLE seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    status season_status_enum NOT NULL DEFAULT 'UPCOMING',
    start_date DATE,
    end_date DATE,
    roster_min INTEGER NOT NULL DEFAULT 7,
    roster_max INTEGER NOT NULL DEFAULT 30,
    win_points INTEGER NOT NULL DEFAULT 3,
    draw_points INTEGER NOT NULL DEFAULT 1,
    loss_points INTEGER NOT NULL DEFAULT 0,
    tiebreaker_rules JSONB NOT NULL DEFAULT '["points","goal_diff","goals_for","head_to_head"]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_roster CHECK (roster_min >= 1 AND roster_max >= roster_min),
    CONSTRAINT chk_season_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE TABLE leagues (
    id UUID DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    level INTEGER NOT NULL,
    max_teams INTEGER,
    status league_status_enum NOT NULL DEFAULT 'UPCOMING',
    PRIMARY KEY (id),
    UNIQUE (id, season_id),
    UNIQUE (season_id, level),
    UNIQUE (season_id, name),
    CONSTRAINT chk_league_level CHECK (level >= 1),
    CONSTRAINT chk_league_max_teams CHECK (max_teams IS NULL OR max_teams >= 1)
);

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    ea_club_id BIGINT UNIQUE NOT NULL,
    ea_club_name TEXT,
    logo_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_teams_ea_club ON teams(ea_club_id);

CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role user_role_enum NOT NULL,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (user_id, role, team_id),
    CONSTRAINT chk_role_team_scope CHECK (
      (role = 'CAPTAIN' AND team_id IS NOT NULL)
      OR (role <> 'CAPTAIN' AND team_id IS NULL)
    )
);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_team ON user_roles(team_id);
CREATE INDEX idx_user_roles_league ON user_roles(league_id);
CREATE UNIQUE INDEX uq_user_roles_global_active
  ON user_roles(user_id, role) WHERE team_id IS NULL;

CREATE TABLE league_teams (
    id UUID DEFAULT gen_random_uuid(),
    league_id UUID NOT NULL,
    season_id UUID NOT NULL,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    captain_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id),
    FOREIGN KEY (league_id, season_id) REFERENCES leagues(id, season_id) ON DELETE RESTRICT,
    UNIQUE (league_id, season_id, team_id)
);
