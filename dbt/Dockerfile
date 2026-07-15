FROM ghcr.io/dbt-labs/dbt-postgres:1.7

WORKDIR /usr/app/dbt

COPY dbt_project.yml .
COPY profiles.yml .
COPY models/ models/
COPY macros/ macros/
COPY tests/ tests/

RUN dbt deps --profiles-dir /usr/app/dbt || true
