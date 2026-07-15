from dagster import Definitions, ScheduleDefinition, define_asset_job
from dagster_project.assets.gitlab_assets import (
    gitlab_commits, gitlab_merge_requests, gitlab_pipelines,
    gitlab_branches, gitlab_languages, gitlab_contributors,
    gitlab_activity, gitlab_dependencies,
)
from dagster_project.assets.dbt_assets import dbt_staging, dbt_marts
from dagster_project.assets.lineage_assets import lineage_update
from dagster_project.resources.postgres import PostgresResource
from dagster_project.resources.gitlab import GitLabResource

ALL_ASSETS = [
    gitlab_commits, gitlab_merge_requests, gitlab_pipelines,
    gitlab_branches, gitlab_languages, gitlab_contributors,
    gitlab_activity, gitlab_dependencies,
    dbt_staging, dbt_marts, lineage_update,
]

daily_job = define_asset_job(
    name="daily_collection",
    selection=[a.op.name for a in ALL_ASSETS],
)

daily_schedule = ScheduleDefinition(
    job=daily_job,
    cron_schedule="0 */6 * * *",
)

defs = Definitions(
    assets=ALL_ASSETS,
    schedules=[daily_schedule],
    resources={
        "postgres": PostgresResource(),
        "gitlab": GitLabResource(),
    },
)
