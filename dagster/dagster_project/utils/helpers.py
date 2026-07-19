import os
import json
import urllib.request
import urllib.error
import time
import random
import logging
import psycopg2
import psycopg2.extras

logger = logging.getLogger("dagster_project")

_last_request_time = 0.0
_MIN_REQUEST_INTERVAL = 1.0
_MAX_JITTER = 1.0


def _throttle():
    """Enforce minimum interval between GitLab API requests with jitter."""
    global _last_request_time
    elapsed = time.monotonic() - _last_request_time
    interval = _MIN_REQUEST_INTERVAL + random.uniform(0, _MAX_JITTER)
    if elapsed < interval:
        wait = interval - elapsed
        logger.debug(f"Throttling: waiting {wait:.2f}s")
        time.sleep(wait)
    _last_request_time = time.monotonic()


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
            _throttle()
            req = urllib.request.Request(url, headers={"PRIVATE-TOKEN": token})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = int(e.headers.get("Retry-After", 5))
                logger.warning(f"GitLab rate limited, waiting {retry_after}s")
                time.sleep(retry_after)
                continue
            raise
        except Exception as e:
            if attempt < 2:
                logger.warning(f"GitLab request failed (attempt {attempt + 1}): {e}")
                time.sleep(2 ** attempt)
                continue
            raise


def gitlab_request_raw(path, token, base_url, params=None):
    """Make a GitLab API request and return raw text content (not JSON)."""
    url = f"{base_url}{path}"
    if params:
        url += "?" + "&".join(f"{k}={v}" for k, v in params.items() if v)

    for attempt in range(3):
        try:
            _throttle()
            req = urllib.request.Request(url, headers={"PRIVATE-TOKEN": token})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = int(e.headers.get("Retry-After", 5))
                logger.warning(f"GitLab rate limited, waiting {retry_after}s")
                time.sleep(retry_after)
                continue
            raise
        except Exception as e:
            if attempt < 2:
                logger.warning(f"GitLab raw request failed (attempt {attempt + 1}): {e}")
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
            _throttle()
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
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = int(e.headers.get("Retry-After", 5))
                logger.warning(f"GitLab rate limited on page {page + 1}, waiting {retry_after}s")
                time.sleep(retry_after)
                continue
            logger.error(f"GitLab HTTP error on page {page + 1}: {e.code} {e.reason}")
            break
        except Exception as e:
            logger.error(f"GitLab request failed on page {page + 1}: {e}")
            break

    return results


def batch_insert(conn, table, columns, rows, conflict_columns=None, update_columns=None):
    """Insert multiple rows using psycopg2 execute_values with upsert support.

    Args:
        conn: psycopg2 connection
        table: target table name
        columns: list of column names
        rows: list of tuples to insert
        conflict_columns: columns for ON CONFLICT (e.g. ['project_id', 'gitlab_iid'])
        update_columns: columns to update on conflict (default: all non-conflict columns)
    """
    if not rows:
        return

    if conflict_columns and update_columns is not False:
        if update_columns is None:
            update_columns = [c for c in columns if c not in conflict_columns]
        if update_columns:
            conflict_cols = ", ".join(conflict_columns)
            update_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_columns)
            sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s ON CONFLICT ({conflict_cols}) DO UPDATE SET {update_clause}"
        else:
            sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s ON CONFLICT ({', '.join(conflict_columns)}) DO NOTHING"
    else:
        sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s ON CONFLICT DO NOTHING"

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, sql, rows)
        conn.commit()
