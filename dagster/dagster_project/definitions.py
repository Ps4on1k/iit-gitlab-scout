from dagster import Definitions, ScheduleDefinition, define_asset_job
from dagster_project.assets.gitlab_assets import (
    gitlab_commits, gitlab_merge_requests, gitlab_pipelines,
    gitlab_branches, gitlab_languages, gitlab_contributors,
    gitlab_activity, gitlab_dependencies,
    gitlab_issues, gitlab_deployments, clickhouse_sync,
    gitlab_dependency_audit, gitlab_contributor_sync,
)
from dagster_project.assets.dbt_assets import dbt_staging, dbt_marts
from dagster_project.assets.lineage_assets import lineage_update
from dagster_project.resources.postgres import PostgresResource
from dagster_project.resources.gitlab import GitLabResource

# Every 6 hours: core collection
CORE_ASSETS = [
    gitlab_commits, gitlab_merge_requests, gitlab_pipelines,
    gitlab_branches, gitlab_contributors,
    gitlab_activity, gitlab_issues, gitlab_deployments,
]

# Weekly: dependency audit + clickhouse sync + languages
# gitlab_dependency_audit depends on gitlab_dependencies (explicit)
WEEKLY_ASSETS = [
    gitlab_dependencies, gitlab_dependency_audit,
    gitlab_languages, clickhouse_sync,
]

# Daily: contributor directory sync
DAILY_ASSETS = [gitlab_contributor_sync]

# dbt + lineage after core collection
POST_COLLECT_ASSETS = [dbt_staging, dbt_marts, lineage_update]

ALL_ASSETS = CORE_ASSETS + WEEKLY_ASSETS + DAILY_ASSETS + POST_COLLECT_ASSETS

core_job = define_asset_job(
    name="core_collection",
    selection=[a.op.name for a in CORE_ASSETS + POST_COLLECT_ASSETS],
)

weekly_job = define_asset_job(
    name="weekly_audit",
    selection=[a.op.name for a in WEEKLY_ASSETS + POST_COLLECT_ASSETS],
)

daily_job = define_asset_job(
    name="daily_sync",
    selection=[a.op.name for a in DAILY_ASSETS],
)

core_schedule = ScheduleDefinition(
    job=core_job,
    cron_schedule="0 */6 * * *",
)

weekly_schedule = ScheduleDefinition(
    job=weekly_job,
    cron_schedule="0 2 * * 0",
)

daily_schedule = ScheduleDefinition(
    job=daily_job,
    cron_schedule="0 3 * * *",
)

defs = Definitions(
    assets=ALL_ASSETS,
    schedules=[core_schedule, weekly_schedule, daily_schedule],
    resources={
        "postgres": PostgresResource(),
        "gitlab": GitLabResource(),
    },
)
