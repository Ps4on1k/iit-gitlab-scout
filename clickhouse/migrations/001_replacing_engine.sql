-- DB-01 Migrating ClickHouse tables to ReplacingMergeTree to avoid duplicates
-- This replaces plain MergeTree with ReplacingMergeTree on tables that are synced via clickhouse_sync
-- Allows idempotent re-sync without creating duplicates
--
-- NOTE: To apply on existing data, run in order:
--   clickhouse-client --database gitlab_scout < 001_replacing_engine.sql

-- Migration is intentionally idempotent and safe. New installs get tables created by init.sql directly.

-- Drop and recreate contributor_profiles with ReplacingMergeTree
DROP TABLE IF EXISTS contributor_profiles;
CREATE TABLE contributor_profiles (
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
ORDER BY (project_id, author_email)
PARTITION BY toYYYYMM(last_commit_date);

-- Also fix commits and merge_requests if needed (they also lack ReplacingMergeTree)
DROP TABLE IF EXISTS commits;
CREATE TABLE commits (
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

DROP TABLE IF EXISTS merge_requests;
CREATE TABLE merge_requests (
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

-- Pipelines, branches, deployments already have proper keys
-- daily_activity uses SummingMergeTree (aggregates are safe)
