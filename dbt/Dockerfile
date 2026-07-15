FROM python:3.11-slim

WORKDIR /usr/app/dbt

RUN pip install --no-cache-dir dbt-postgres==1.7.*

COPY dbt_project.yml .
COPY profiles.yml .
COPY models/ models/
