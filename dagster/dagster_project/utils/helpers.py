import os
import json
import urllib.request
import urllib.error
import time
import psycopg2
import psycopg2.extras


def get_gitlab_client():
    """Get GitLab API configuration."""
    return {
        "base_url": os.environ.get("GITLAB_BASE_URL", "https://gitlab.com/api/v4"),
        "token": os.environ.get("GITLAB_PERSONAL_TOKEN", ""),
    }


def get_pg_connection():
    """Get PostgreSQL connection."""
    return psycopg2.connect(os.environ.get(
        "DATABASE_URL",
        "postgresql://gitlab_scout:changeme@postgres:5432/gitlab_scout"
    ))


def gitlab_request(path, token, base_url, params=None):
    """Make a GitLab API request with retry and rate limiting."""
    url = f"{base_url}{path}"
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items() if v)

    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"PRIVATE-TOKEN": token})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = int(e.headers.get("Retry-After", 5))
                time.sleep(retry_after)
                continue
            raise
        except Exception:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise


def gitlab_request_paginated(path, token, base_url, params=None, max_pages=50):
    """Make paginated GitLab API requests."""
    results = []
    url = f"{base_url}{path}"
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items() if v)

    for page in range(max_pages):
        try:
            req = urllib.request.Request(url, headers={"PRIVATE-TOKEN": token})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode())
                results.extend(data)

                link_header = resp.headers.get("link", "")
                next_url = None
                for part in link_header.split(","):
                    if 'rel="next"' in part:
                        next_url = part.split(";")[0].strip().strip("<>")
                        break

                if not next_url:
                    break
                url = next_url
        except Exception:
            break

    return results


def batch_insert(conn, table, columns, rows):
    """Insert multiple rows using psycopg2 execute_values."""
    if not rows:
        return

    placeholders = ", ".join(["%s"] * len(columns))
    sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s ON CONFLICT DO NOTHING"

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, sql, rows)
        conn.commit()
