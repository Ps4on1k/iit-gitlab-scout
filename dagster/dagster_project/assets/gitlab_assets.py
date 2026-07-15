from dagster import asset, AssetExecutionContext
from dagster_project.resources.postgres import PostgresResource
from dagster_project.resources.gitlab import GitLabResource


@asset(compute_kind="gitlab")
def gitlab_commits(context: AssetExecutionContext, postgres: PostgresResource, gitlab: GitLabResource) -> None:
    """Collect commits from GitLab API and store in PostgreSQL."""
    context.log.info("Collecting commits from GitLab...")
    # TODO: Implement collector logic from services/contributor-collector.ts
    # 1. Fetch projects from PostgreSQL
    # 2. For each project, fetch commits from GitLab API
    # 3. Insert commits into PostgreSQL using batch INSERT
    # 4. Update contributor_profiles
    context.log.info("Commits collection complete")


@asset(compute_kind="gitlab")
def gitlab_merge_requests(context: AssetExecutionContext, postgres: PostgresResource, gitlab: GitLabResource) -> None:
    """Collect merge requests from GitLab API and store in PostgreSQL."""
    context.log.info("Collecting merge requests from GitLab...")
    # TODO: Implement collector logic from services/mr-collector.ts
    context.log.info("Merge requests collection complete")


@asset(compute_kind="gitlab")
def gitlab_pipelines(context: AssetExecutionContext, postgres: PostgresResource, gitlab: GitLabResource) -> None:
    """Collect pipelines and deployments from GitLab API and store in PostgreSQL."""
    context.log.info("Collecting pipelines from GitLab...")
    # TODO: Implement collector logic from services/pipeline-collector.ts
    context.log.info("Pipelines collection complete")
