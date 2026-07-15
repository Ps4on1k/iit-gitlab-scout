#!/bin/bash
set -euo pipefail

echo "Running dbt models..."
cd /usr/app/dbt

dbt run --profiles-dir /usr/app/dbt --target dev 2>&1

echo "dbt run complete."
