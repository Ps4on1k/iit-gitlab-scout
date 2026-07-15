from dagster import ConfigurableResource
import os


class GitLabResource(ConfigurableResource):
    """GitLab API connection resource."""

    def get_base_url(self) -> str:
        return os.environ.get("GITLAB_BASE_URL", "https://gitlab.com/api/v4")

    def get_token(self) -> str:
        return os.environ.get("GITLAB_PERSONAL_TOKEN", "")
