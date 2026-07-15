from dagster import asset, AssetExecutionContext
from dagster_project.utils.helpers import get_pg_connection, gitlab_request_paginated, batch_insert


@asset(compute_kind="gitlab")
def gitlab_commits(context: AssetExecutionContext) -> None:
    """Collect commits from GitLab API and store in PostgreSQL."""
    import os
    from dagster_project.utils.helpers import get_gitlab_client

    client = get_gitlab_client()
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, path, token_encrypted, base_url FROM projects")
        projects = cursor.fetchall()
        cursor.close()

        total_commits = 0
        for proj_id, path, token_encrypted, base_url in projects:
            try:
                token = decrypt(token_encrypted) if token_encrypted else client["token"]
                if not token:
                    continue

                commits = gitlab_request_paginated(
                    f"/projects/{path}/repository/commits",
                    token, base_url,
                    {"per_page": "100", "order_by": "committed_date", "sort": "desc"}
                )

                rows = []
                for c in commits:
                    rows.append((
                        proj_id, c.get("id", ""), c.get("author_name", ""),
                        c.get("author_email", ""), c.get("message", ""),
                        c.get("committed_date"), c.get("stats", {}).get("additions", 0),
                        c.get("stats", {}).get("deletions", 0)
                    ))

                if rows:
                    batch_insert(conn, "commits",
                        ["project_id", "sha", "author_name", "author_email", "message",
                         "committed_date", "additions", "deletions"], rows)
                    total_commits += len(rows)

                context.log.info(f"Collected {len(rows)} commits from {path}")
            except Exception as e:
                context.log.warning(f"Failed to collect commits from {path}: {e}")

        context.log.info(f"Total commits collected: {total_commits}")
    finally:
        conn.close()


@asset(compute_kind="gitlab")
def gitlab_merge_requests(context: AssetExecutionContext) -> None:
    """Collect merge requests from GitLab API and store in PostgreSQL."""
    import os
    from dagster_project.utils.helpers import get_gitlab_client

    client = get_gitlab_client()
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, path, token_encrypted, base_url FROM projects")
        projects = cursor.fetchall()
        cursor.close()

        total_mrs = 0
        for proj_id, path, token_encrypted, base_url in projects:
            try:
                token = decrypt(token_encrypted) if token_encrypted else client["token"]
                if not token:
                    continue

                mrs = gitlab_request_paginated(
                    f"/projects/{path}/merge_requests",
                    token, base_url,
                    {"state": "all", "per_page": "100", "order_by": "created_at", "sort": "desc"}
                )

                rows = []
                for mr in mrs:
                    rows.append((
                        proj_id, mr.get("iid"), mr.get("title", ""),
                        mr.get("state", ""), mr.get("author", {}).get("name", ""),
                        mr.get("author", {}).get("email", ""),
                        mr.get("source_branch", ""), mr.get("target_branch", ""),
                        mr.get("created_at"), mr.get("updated_at"),
                        mr.get("merged_at"), mr.get("closed_at"),
                        mr.get("merged_by", {}).get("username", "") if mr.get("merged_by") else "",
                        len(mr.get("reviewers", [])),
                        mr.get("user_notes_count", 0)
                    ))

                if rows:
                    batch_insert(conn, "project_merge_requests",
                        ["project_id", "gitlab_iid", "title", "state", "author_name", "author_email",
                         "source_branch", "target_branch", "created_at", "updated_at",
                         "merged_at", "closed_at", "merged_by", "reviewers", "changes_count"], rows)
                    total_mrs += len(rows)

                context.log.info(f"Collected {len(rows)} MRs from {path}")
            except Exception as e:
                context.log.warning(f"Failed to collect MRs from {path}: {e}")

        context.log.info(f"Total MRs collected: {total_mrs}")
    finally:
        conn.close()


@asset(compute_kind="gitlab")
def gitlab_pipelines(context: AssetExecutionContext) -> None:
    """Collect pipelines from GitLab API and store in PostgreSQL."""
    import os
    from dagster_project.utils.helpers import get_gitlab_client

    client = get_gitlab_client()
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, path, token_encrypted, base_url FROM projects")
        projects = cursor.fetchall()
        cursor.close()

        total_pipelines = 0
        for proj_id, path, token_encrypted, base_url in projects:
            try:
                token = decrypt(token_encrypted) if token_encrypted else client["token"]
                if not token:
                    continue

                pipelines = gitlab_request_paginated(
                    f"/projects/{path}/pipelines",
                    token, base_url,
                    {"per_page": "100", "order_by": "id", "sort": "desc"}
                )

                rows = []
                for p in pipelines:
                    duration = p.get("duration")
                    if duration is None and p.get("finished_at") and p.get("created_at"):
                        from datetime import datetime
                        try:
                            finished = datetime.fromisoformat(p["finished_at"].replace("Z", "+00:00"))
                            created = datetime.fromisoformat(p["created_at"].replace("Z", "+00:00"))
                            duration = int((finished - created).total_seconds())
                        except Exception:
                            pass

                    rows.append((
                        proj_id, p.get("id"), p.get("status", ""),
                        p.get("ref", ""), p.get("source", ""),
                        duration, p.get("created_at"), p.get("finished_at"),
                        p.get("user", {}).get("name", "") if p.get("user") else ""
                    ))

                if rows:
                    batch_insert(conn, "project_pipelines",
                        ["project_id", "gitlab_id", "status", "ref", "source", "duration",
                         "created_at", "finished_at", "user_name"], rows)
                    total_pipelines += len(rows)

                context.log.info(f"Collected {len(rows)} pipelines from {path}")
            except Exception as e:
                context.log.warning(f"Failed to collect pipelines from {path}: {e}")

        context.log.info(f"Total pipelines collected: {total_pipelines}")
    finally:
        conn.close()


def decrypt(encrypted):
    """Decrypt GitLab token."""
    import os
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        key_hex = os.environ.get("ENCRYPTION_KEY", "")
        if not key_hex or len(key_hex) != 64:
            return ""
        key = bytes.fromhex(key_hex)
        parts = encrypted.split(":")
        if len(parts) != 3:
            return ""
        iv = bytes.fromhex(parts[0])
        tag = bytes.fromhex(parts[1])
        ciphertext = bytes.fromhex(parts[2])
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(iv, ciphertext + tag, None).decode()
    except Exception:
        return ""
