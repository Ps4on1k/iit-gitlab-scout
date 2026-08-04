FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY dagster_project/ dagster_project/

EXPOSE 3000

CMD ["sh", "-c", "pip install --no-cache-dir clickhouse-connect>=0.7 2>/dev/null; dagster dev -h 0.0.0.0 -p 3000 -m dagster_project"]
