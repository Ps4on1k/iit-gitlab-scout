from dagster import asset, AssetExecutionContext
import subprocess
import os
import shutil


def is_dbt_installed():
    return shutil.which("dbt") is not None


@asset(deps=["gitlab_commits", "gitlab_merge_requests", "gitlab_pipelines"], compute_kind="dbt")
def dbt_staging(context: AssetExecutionContext) -> None:
    """Run dbt staging models."""
    if not is_dbt_installed():
        context.log.warning("dbt not installed — skipping staging models. Install dbt-postgres to enable.")
        return

    context.log.info("Running dbt staging models...")

    result = subprocess.run(
        ["dbt", "run", "--select", "staging", "--profiles-dir", "/usr/app/dbt", "--project-dir", "/usr/app/dbt"],
        capture_output=True,
        text=True,
        cwd="/usr/app/dbt",
        env={**os.environ, "POSTGRES_HOST": "postgres"}
    )

    if result.returncode != 0:
        context.log.error(f"dbt staging failed: {result.stderr}")
        raise Exception(f"dbt staging failed: {result.stderr}")

    context.log.info("dbt staging complete")
    context.log.info(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)


@asset(deps=["dbt_staging"], compute_kind="dbt")
def dbt_marts(context: AssetExecutionContext) -> None:
    """Run dbt mart models (materialized views) and refresh them."""
    if not is_dbt_installed():
        context.log.warning("dbt not installed — skipping mart models. Install dbt-postgres to enable.")
        return

    context.log.info("Running dbt mart models...")

    result = subprocess.run(
        ["dbt", "run", "--select", "marts", "--profiles-dir", "/usr/app/dbt", "--project-dir", "/usr/app/dbt"],
        capture_output=True,
        text=True,
        cwd="/usr/app/dbt",
        env={**os.environ, "POSTGRES_HOST": "postgres"}
    )

    if result.returncode != 0:
        context.log.error(f"dbt marts failed: {result.stderr}")
        raise Exception(f"dbt marts failed: {result.stderr}")

    context.log.info("dbt marts complete")
    context.log.info(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)

    # Refresh all materialized views to populate with latest data
    from dagster_project.utils.helpers import get_pg_connection
    conn = get_pg_connection()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT schemaname, tablename FROM pg_tables 
            WHERE schemaname = 'public_marts' AND tablename LIKE 'mart_%'
        """)
        # Also check materialized views
        cur.execute("""
            SELECT n.nspname, c.relname 
            FROM pg_class c 
            JOIN pg_namespace n ON c.relnamespace = n.oid 
            WHERE n.nspname = 'public_marts' AND c.relkind = 'm'
        """)
        views = cur.fetchall()
        for schema, name in views:
            context.log.info(f"Refreshing materialized view {schema}.{name}...")
            cur.execute(f"REFRESH MATERIALIZED VIEW {schema}.{name}")
            conn.commit()
        cur.close()
        context.log.info(f"Refreshed {len(views)} materialized views")
    finally:
        conn.close()
