from dagster import Definitions, ScheduleDefinition, define_asset_job, AssetSelection
from dagster_project.assets.gitlab_assets import (
    gitlab_commits, gitlab_merge_requests, gitlab_pipelines,
    gitlab_branches, gitlab_languages, gitlab_contributors,
    gitlab_activity, gitlab_dependencies,
    gitlab_issues, gitlab_deployments, clickhouse_sync,
    gitlab_dependency_audit, gitlab_contributor_sync,
    backfill_gitlab_user_id,
)
from dagster_project.assets.dbt_assets import dbt_staging, dbt_marts
from dagster_project.assets.lineage_assets import lineage_update
from dagster_project.resources.postgres import PostgresResource
from dagster_project.resources.gitlab import GitLabResource


# Wave 1: commits + contributors (source of truth)
commits_job = define_asset_job(
    name="commits_collection",
    selection=AssetSelection.assets("gitlab_commits", "backfill_gitlab_user_id", "gitlab_contributors"),
)

# Wave 2: DORA / pipelines + activity
dora_job = define_asset_job(
    name="dora_pipeline",
    selection=AssetSelection.assets("gitlab_pipelines", "gitlab_deployments", "gitlab_activity"),
)

# Wave 3: MRs + branches + issues
rest_job = define_asset_job(
    name="rest_collection",
    selection=AssetSelection.assets("gitlab_merge_requests", "gitlab_branches", "gitlab_issues"),
)

# Wave 4: Sync (contributor_directory ↔ CH)
sync_job = define_asset_job(
    name="sync_clickhouse",
    selection=AssetSelection.assets("gitlab_contributor_sync", "clickhouse_sync"),
)

# Wave 5: Languages + dependencies (static/slow)
static_job = define_asset_job(
    name="static_deep",
    selection=AssetSelection.assets("gitlab_languages", "gitlab_dependencies", "gitlab_dependency_audit"),
)

# Post: dbt staging + marts
post_job = define_asset_job(
    name="post_marts",
    selection=AssetSelection.assets("dbt_staging", "dbt_marts", "lineage_update"),
)

# All-in-one (for manual "Собрать всё")
all_data_job = define_asset_job(
    name="gitlab_all",
    selection=AssetSelection.keys(
        "gitlab_commits", "backfill_gitlab_user_id", "gitlab_contributors",
        "gitlab_pipelines", "gitlab_deployments", "gitlab_activity",
        "gitlab_merge_requests", "gitlab_branches", "gitlab_issues",
        "gitlab_languages", "gitlab_dependencies", "gitlab_dependency_audit",
        "gitlab_contributor_sync", "clickhouse_sync",
        "dbt_staging", "dbt_marts", "lineage_update",
    ),
)

# --- Schedules aligned to jobs (no redundant inline jobs) ---
schedules = [
    ScheduleDefinition(
        job=define_asset_job(
            name="core_every_6h",
            selection=AssetSelection.assets(
                "gitlab_commits", "backfill_gitlab_user_id", "gitlab_contributors",
                "gitlab_pipelines", "gitlab_deployments", "gitlab_activity",
                "gitlab_merge_requests", "gitlab_branches", "gitlab_issues",
            ),
        ),
        cron_schedule="0 */6 * * *",
    ),
    ScheduleDefinition(
        job=define_asset_job(
            name="static_weekly",
            selection=AssetSelection.assets("gitlab_languages", "gitlab_dependencies", "gitlab_dependency_audit"),
        ),
        cron_schedule="0 2 * * 1",
    ),
    ScheduleDefinition(
        job=define_asset_job(
            name="sync_daily",
            selection=AssetSelection.assets("gitlab_contributor_sync", "clickhouse_sync"),
        ),
        cron_schedule="0 3 * * *",
    ),
    ScheduleDefinition(
        job=define_asset_job(
            name="marts_every_2h",
            selection=AssetSelection.assets("dbt_staging", "dbt_marts"),
        ),
        cron_schedule="0 */2 * * *",
    ),
    ScheduleDefinition(
        job=define_asset_job(
            name="lineage_daily",
            selection=AssetSelection.assets("lineage_update"),
        ),
        cron_schedule="0 4 * * *",
    ),
]

defs = Definitions(
    assets=[
        gitlab_commits, backfill_gitlab_user_id, gitlab_contributors,
        gitlab_pipelines, gitlab_deployments, gitlab_activity,
        gitlab_merge_requests, gitlab_branches, gitlab_issues,
        gitlab_languages, gitlab_dependencies, gitlab_dependency_audit,
        gitlab_contributor_sync, clickhouse_sync,
        dbt_staging, dbt_marts, lineage_update,
    ],
    jobs=[
        commits_job, dora_job, rest_job,
        static_job, sync_job, post_job,
        all_data_job,
    ],
    schedules=schedules,
    resources={
        "postgres": PostgresResource(),
        "gitlab": GitLabResource(),
    },
)
