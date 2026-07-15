from dagster import asset, AssetExecutionContext
from dagster_project.resources.postgres import PostgresResource


@asset(compute_kind="metadata")
def lineage_update(context: AssetExecutionContext, postgres: PostgresResource) -> None:
    """Update lineage metadata after collection and dbt runs."""
    context.log.info("Updating lineage metadata...")
    # TODO: Call POST /api/v1/data-lineage/metadata for each table
    # 1. Update commits table metadata (row count, last updated)
    # 2. Update project_merge_requests table metadata
    # 3. Update project_pipelines table metadata
    # 4. Update dbt materialized views metadata
    context.log.info("Lineage metadata updated")
