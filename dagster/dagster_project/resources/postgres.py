from dagster import ConfigurableResource
import os


class PostgresResource(ConfigurableResource):
    """PostgreSQL connection resource."""

    def get_connection_string(self) -> str:
        return os.environ.get(
            "DATABASE_URL",
            "postgresql://gitlab_scout:changeme@postgres:5432/gitlab_scout"
        )
