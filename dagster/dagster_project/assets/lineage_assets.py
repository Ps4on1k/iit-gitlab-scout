from dagster import asset, AssetExecutionContext
from dagster_project.utils.helpers import get_pg_connection
import json
from datetime import datetime


@asset(deps=["dbt_marts"], compute_kind="metadata")
def lineage_update(context: AssetExecutionContext) -> None:
    """Update lineage metadata after collection and dbt runs."""
    context.log.info("Updating lineage metadata...")
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()

        tables_to_update = [
            ("commits", "committed_date"),
            ("project_merge_requests", "created_at"),
            ("project_pipelines", "created_at"),
            ("project_deployments", "created_at"),
            ("project_branches", "last_commit_date"),
            ("project_activity", "date"),
            ("project_dependencies_audit", "created_at"),
            ("project_languages", "id"),
            ("contributor_profiles", "last_commit_date"),
        ]

        for table_name, date_col in tables_to_update:
            try:
                cursor.execute(f"""
                    INSERT INTO lineage_metadata (entity_type, entity_name, metadata, updated_at)
                    VALUES ('table', %s, %s, NOW())
                    ON CONFLICT (entity_type, entity_name)
                    DO UPDATE SET metadata = %s, updated_at = NOW()
                """, [
                    table_name,
                    json.dumps({"last_sync": datetime.now().isoformat(), "status": "active"}),
                    json.dumps({"last_sync": datetime.now().isoformat(), "status": "active"})
                ])
            except Exception as e:
                context.log.warning(f"Failed to update metadata for {table_name}: {e}")

        conn.commit()
        context.log.info("Lineage metadata updated successfully")
    except Exception as e:
        context.log.error(f"Lineage update failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()
