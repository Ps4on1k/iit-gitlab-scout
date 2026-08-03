-- ClickHouse schema for GitLab Scout analytics
-- Optimized for OLAP queries: fast aggregations, columnar storage
-- DB-01: Uses ReplacingMergeTree for synced tables to avoid duplicates on re-sync

-- Commits table
CREATE TABLE IF NOT EXISTS commits (
    id UInt32,
    project_id UInt32,
    sha String,
    author_name String,
    author_email String,
    message String,
    committed_date DateTime,
    additions Int32,
    deletions Int32
) ENGINE = MergeTree()
ORDER BY (project_id, committed_date, author_email)
PARTITION BY toYYYYMM(committed_date);

-- Merge Requests table
CREATE TABLE IF NOT EXISTS merge_requests (
    id UInt32,
    project_id UInt32,
    gitlab_iid UInt32,
    title String,
    state String,
    author_name String,
    author_email String,
    source_branch String,
    target_branch String,
    created_at DateTime,
    updated_at DateTime,
    merged_at Nullable(DateTime),
    closed_at Nullable(DateTime),
    reviewers Array(String),
    approvals UInt16,
    changes_count UInt32,
    comments_count UInt32
) ENGINE = MergeTree()
ORDER BY (project_id, gitlab_iid)
PARTITION BY toYYYYMM(created_at);

-- Pipelines table
CREATE TABLE IF NOT EXISTS pipelines (
    id UInt32,
    project_id UInt32,
    gitlab_id UInt32,
    status String,
    ref String,
    source String,
    duration Nullable(UInt32),
    created_at DateTime,
    finished_at Nullable(DateTime),
    user_name String
) ENGINE = MergeTree()
ORDER BY (project_id, gitlab_id)
PARTITION BY toYYYYMM(created_at);

-- Deployments table (DORA metrics)
CREATE TABLE IF NOT EXISTS deployments (
    id UInt32,
    project_id UInt32,
    gitlab_id UInt32,
    status String,
    environment String,
    pipeline_status String,
    created_at DateTime,
    finished_at Nullable(DateTime),
    commit_date Nullable(DateTime)
) ENGINE = MergeTree()
ORDER BY (project_id, created_at)
PARTITION BY toYYYYMM(created_at);

-- Branches table
CREATE TABLE IF NOT EXISTS branches (
    id UInt32,
    project_id UInt32,
    name String,
    merged Bool,
    protected Bool,
    is_default Bool,
    last_commit_date Nullable(DateTime),
    last_commit_author String,
    additions UInt32,
    deletions UInt32
) ENGINE = MergeTree()
ORDER BY (project_id, name);

-- Contributor profiles — ReplacingMergeTree allows idempotent re-sync without duplicates
CREATE TABLE IF NOT EXISTS contributor_profiles (
    id UInt32,
    project_id UInt32,
    author_email String,
    author_name String,
    total_commits UInt32,
    total_additions UInt32,
    total_deletions UInt32,
    active_days UInt32,
    last_commit_date Nullable(Date),
    first_commit_date Nullable(Date)
) ENGINE = ReplacingMergeTree()
ORDER BY (project_id, author_email);

-- Daily activity aggregation
CREATE TABLE IF NOT EXISTS daily_activity (
    project_id UInt32,
    day Date,
    commits UInt32,
    merge_requests UInt32,
    pipelines UInt32
) ENGINE = SummingMergeTree()
ORDER BY (project_id, day);

-- Project dependencies audit
CREATE TABLE IF NOT EXISTS dependencies (
    id UInt32,
    project_id UInt32,
    name String,
    current_version String,
    is_outdated Bool,
    source String,
    collected_at DateTime
) ENGINE = MergeTree()
ORDER BY (project_id, source, name)
PARTITION BY toYYYYMM(collected_at);

-- Pre-aggregated: commits per day per project (for dashboard)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_commits_daily
ENGINE = SummingMergeTree()
ORDER BY (project_id, day)
AS SELECT
    project_id,
    toDate(committed_date) AS day,
    count() AS commits,
    sum(additions) AS additions,
    sum(deletions) AS deletions
FROM commits
GROUP BY project_id, day;

-- Pre-aggregated: deploy stats per day (for DORA)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_deploys_daily
ENGINE = SummingMergeTree()
ORDER BY (day)
AS SELECT
    toDate(created_at) AS day,
    count() AS total,
    countIf(status = 'success') AS success,
    countIf(status = 'failed') AS failed
FROM deployments
GROUP BY day;

-- Pre-aggregated: MR stats per day
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_mr_daily
ENGINE = SummingMergeTree()
ORDER BY (day)
AS SELECT
    toDate(created_at) AS day,
    count() AS total,
    countIf(state = 'merged') AS merged,
    countIf(state = 'opened') AS opened
FROM merge_requests
GROUP BY day;

-- Pre-aggregated: pipeline stats per day
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_pipelines_daily
ENGINE = SummingMergeTree()
ORDER BY (day)
AS SELECT
    toDate(created_at) AS day,
    count() AS total,
    countIf(status = 'success') AS success,
    countIf(status = 'failed') AS failed
FROM pipelines
GROUP BY day;

-- Pre-aggregated: contributor stats per project
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_contributors_project
ENGINE = AggregatingMergeTree()
ORDER BY (project_id, author_email)
AS SELECT
    project_id,
    author_email,
    argMax(author_name, committed_date) AS author_name,
    count() AS total_commits,
    sum(additions) AS total_additions,
    sum(deletions) AS total_deletions,
    max(committed_date) AS last_commit,
    min(committed_date) AS first_commit
FROM commits
GROUP BY project_id, author_email;
