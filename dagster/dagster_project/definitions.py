from dagster import Definitions, ScheduleDefinition, define_asset_job
from dagster_project.assets.gitlab_assets import gitlab_commits, gitlab_merge_requests, gitlab_pipelines
from dagster_project.assets.dbt_assets import dbt_staging, dbt_marts
from dagster_project.assets.lineage_assets import lineage_update
from dagster_project.resources.postgres import PostgresResource
from dagster_project.resources.gitlab import GitLabResource

daily_job = define_asset_job(
    name="daily_collection",
    selection=["gitlab_commits", "gitlab_merge_requests", "gitlab_pipelines", "dbt_staging", "dbt_marts", "lineage_update"],
)

daily_schedule = ScheduleDefinition(
    job=daily_job,
    cron_schedule="0 */6 * * *",
)

defs = Definitions(
    assets=[gitlab_commits, gitlab_merge_requests, gitlab_pipelines, dbt_staging, dbt_marts, lineage_update],
    schedules=[daily_schedule],
    resources={
        "postgres": PostgresResource(),
        "gitlab": GitLabResource(),
    },
)
