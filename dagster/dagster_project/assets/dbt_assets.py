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
        ["dbt", "run", "--select", "staging", "--profiles-dir", "/usr/app/dbt"],
        capture_output=True,
        text=True,
        env={**os.environ, "POSTGRES_HOST": "postgres"}
    )

    if result.returncode != 0:
        context.log.error(f"dbt staging failed: {result.stderr}")
        raise Exception(f"dbt staging failed: {result.stderr}")

    context.log.info("dbt staging complete")
    context.log.info(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)


@asset(deps=["dbt_staging"], compute_kind="dbt")
def dbt_marts(context: AssetExecutionContext) -> None:
    """Run dbt mart models (materialized views)."""
    if not is_dbt_installed():
        context.log.warning("dbt not installed — skipping mart models. Install dbt-postgres to enable.")
        return

    context.log.info("Running dbt mart models...")

    result = subprocess.run(
        ["dbt", "run", "--select", "marts", "--profiles-dir", "/usr/app/dbt"],
        capture_output=True,
        text=True,
        env={**os.environ, "POSTGRES_HOST": "postgres"}
    )

    if result.returncode != 0:
        context.log.error(f"dbt marts failed: {result.stderr}")
        raise Exception(f"dbt marts failed: {result.stderr}")

    context.log.info("dbt marts complete")
    context.log.info(result.stdout[-500:] if len(result.stdout) > 500 else result.stdout)
