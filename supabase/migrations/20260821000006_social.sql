-- 006_social.sql
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    content TEXT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    delete_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    parent_comment_id UUID,
    author_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    content TEXT NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_parent_comment CHECK (parent_comment_id IS NULL OR parent_comment_id <> id),
    UNIQUE (post_id, id),
    FOREIGN KEY (post_id, parent_comment_id) REFERENCES comments(post_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_comments_parent ON comments(post_id, parent_comment_id);

CREATE TABLE likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_like_target CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX uq_like_post ON likes(user_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX uq_like_comment ON likes(user_id, comment_id) WHERE comment_id IS NOT NULL;

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    status report_status_enum NOT NULL DEFAULT 'PENDING',
    reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    reviewer_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_report_target CHECK ((post_id IS NOT NULL)::int + (comment_id IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX uq_report_post ON reports(reporter_id, post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX uq_report_comment ON reports(reporter_id, comment_id) WHERE comment_id IS NOT NULL;

CREATE TABLE daily_activity_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    post_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, date),
    CONSTRAINT chk_activity_counts CHECK (post_count >= 0 AND comment_count >= 0)
);
