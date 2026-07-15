from dagster import asset, AssetExecutionContext, AssetIn
from dagster_project.resources.postgres import PostgresResource


@asset(deps=[AssetIn("gitlab_commits"), AssetIn("gitlab_merge_requests"), AssetIn("gitlab_pipelines")], compute_kind="dbt")
def dbt_staging(context: AssetExecutionContext, postgres: PostgresResource) -> None:
    """Run dbt staging models."""
    context.log.info("Running dbt staging models...")
    # TODO: Execute dbt run --select staging
    context.log.info("dbt staging complete")


@asset(deps=[AssetIn("dbt_staging")], compute_kind="dbt")
def dbt_marts(context: AssetExecutionContext, postgres: PostgresResource) -> None:
    """Run dbt mart models (materialized views)."""
    context.log.info("Running dbt mart models...")
    # TODO: Execute dbt run --select marts
    context.log.info("dbt marts complete")
