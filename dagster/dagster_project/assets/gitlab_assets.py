from dagster import asset, AssetExecutionContext
from dagster_project.utils.helpers import get_pg_connection, gitlab_request_paginated, gitlab_request, gitlab_request_raw, batch_insert
import urllib.parse


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


def get_last_collection_date(conn, table, date_column, project_id):
    """Get the latest date value for a project from a table."""
    cur = conn.cursor()
    cur.execute(
        f"SELECT MAX({date_column}) FROM {table} WHERE project_id = %s",
        (project_id,)
    )
    row = cur.fetchone()
    cur.close()
    return row[0] if row and row[0] else None


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
                token = get_token(token_encrypted, client["token"], conn, base_url)
                if not token:
                    continue

                params = {"per_page": "100", "order_by": "committed_date", "sort": "desc", "with_stats": "true"}
                last_date = get_last_collection_date(conn, "commits", "committed_date", proj_id)
                if last_date:
                    since = last_date.isoformat() if hasattr(last_date, 'isoformat') else str(last_date)
                    params["since"] = since
                    context.log.info(f"Incremental commits for {path} since {since}")
                else:
                    context.log.info(f"Full commit collection for {path}")

                encoded_path = urllib.parse.quote(path, safe='')
                commits = gitlab_request_paginated(
                    f"/projects/{encoded_path}/repository/commits",
                    token, base_url, params, max_pages=1000
                )

                rows = []
                for c in commits:
                    rows.append((
                        proj_id, c.get("id", ""), c.get("author_name", ""),
                        c.get("author_email", ""),
                        c.get("committed_date"), c.get("stats", {}).get("additions", 0),
                        c.get("stats", {}).get("deletions", 0),
                        c.get("stats", {}).get("additions", 0) + c.get("stats", {}).get("deletions", 0),
                        "all"
                    ))

                if rows:
                    batch_insert(conn, "commits",
                        ["project_id", "commit_sha", "author_name", "author_email",
                         "committed_date", "additions", "deletions", "total_changes", "branch"], rows,
                        conflict_columns=["project_id", "commit_sha"])
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
                token = get_token(token_encrypted, client["token"], conn, base_url)
                if not token:
                    continue

                params = {"state": "all", "per_page": "100", "order_by": "updated_at", "sort": "desc"}
                last_date = get_last_collection_date(conn, "project_merge_requests", "updated_at", proj_id)
                if last_date:
                    since = last_date.isoformat() if hasattr(last_date, 'isoformat') else str(last_date)
                    params["updated_after"] = since
                    context.log.info(f"Incremental MRs for {path} since {since}")
                else:
                    context.log.info(f"Full MR collection for {path}")

                mrs = gitlab_request_paginated(
                    f"/projects/{urllib.parse.quote(path, safe='')}/merge_requests",
                    token, base_url, params, max_pages=1000
                )

                rows = []
                # Collect MRs first, then fetch approvals for merged ones
                mr_data = []
                for mr in mrs:
                    reviewers_list = [r.get("user", {}).get("username", "") for r in mr.get("reviewers", []) if r.get("user")]
                    changes_count = 0
                    if mr.get("changes_count"):
                        try: changes_count = int(mr["changes_count"])
                        except (ValueError, TypeError): pass

                    mr_data.append({
                        "mr": mr,
                        "reviewers": reviewers_list,
                        "changes_count": changes_count,
                    })

                # For MRs without reviewers, fetch detail + approvals from individual endpoint
                # GitLab list API doesn't reliably return reviewers field
                for item in mr_data:
                    mr = item["mr"]
                    if not item["reviewers"]:
                        try:
                            detail = gitlab_request(
                                f"/projects/{encoded_path}/merge_requests/{mr.get('iid')}",
                                token, base_url
                            )
                            if detail and isinstance(detail, dict):
                                revs = detail.get("reviewers", [])
                                if revs:
                                    item["reviewers"] = [r.get("username", "") or r.get("name", "") for r in revs if r]
                        except Exception:
                            pass

                    # Fallback: try approvals endpoint (GitLab Premium only)
                    if not item["reviewers"] and mr.get("state") == "merged":
                        try:
                            approval_data = gitlab_request(
                                f"/projects/{encoded_path}/merge_requests/{mr.get('iid')}/approvals",
                                token, base_url
                            )
                            if approval_data and isinstance(approval_data, dict):
                                approved_by = approval_data.get("approved_by", [])
                                if approved_by:
                                    item["reviewers"] = [
                                        a.get("user", {}).get("name", "") or a.get("user", {}).get("username", "")
                                        for a in approved_by if a.get("user")
                                    ]
                        except Exception:
                            pass

                for item in mr_data:
                    mr = item["mr"]
                    reviewers = item["reviewers"]
                    rows.append((
                        proj_id, mr.get("iid"), mr.get("title", ""),
                        mr.get("state", ""), mr.get("author", {}).get("name", ""),
                        mr.get("author", {}).get("email", ""),
                        mr.get("source_branch", ""), mr.get("target_branch", ""),
                        mr.get("created_at"), mr.get("updated_at"),
                        mr.get("merged_at"), mr.get("closed_at"),
                        mr.get("merged_by", {}).get("username", "") if mr.get("merged_by") else "",
                        reviewers, len(reviewers),
                        item["changes_count"], mr.get("user_notes_count", 0),
                    ))

                if rows:
                    batch_insert(conn, "project_merge_requests",
                        ["project_id", "gitlab_iid", "title", "state", "author_name", "author_email",
                         "source_branch", "target_branch", "created_at", "updated_at",
                         "merged_at", "closed_at", "merged_by", "reviewers", "approvals",
                         "changes_count", "comments_count"], rows,
                        conflict_columns=["project_id", "gitlab_iid"])
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
                token = get_token(token_encrypted, client["token"], conn, base_url)
                if not token:
                    continue

                params = {"per_page": "100", "order_by": "id", "sort": "desc"}
                last_date = get_last_collection_date(conn, "project_pipelines", "created_at", proj_id)
                if last_date:
                    since = last_date.isoformat() if hasattr(last_date, 'isoformat') else str(last_date)
                    params["updated_after"] = since
                    context.log.info(f"Incremental pipelines for {path} since {since}")
                else:
                    context.log.info(f"Full pipeline collection for {path}")

                pipelines = gitlab_request_paginated(
                    f"/projects/{urllib.parse.quote(path, safe='')}/pipelines",
                    token, base_url, params, max_pages=1000
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
                        duration, p.get("created_at"), p.get("updated_at"), p.get("finished_at"),
                        p.get("user", {}).get("name", "") if p.get("user") else ""
                    ))

                if rows:
                    batch_insert(conn, "project_pipelines",
                        ["project_id", "gitlab_id", "status", "ref", "source", "duration",
                         "created_at", "updated_at", "finished_at", "user_name"], rows,
                        conflict_columns=["project_id", "gitlab_id"])
                    total_pipelines += len(rows)

                context.log.info(f"Collected {len(rows)} pipelines from {path}")
            except Exception as e:
                context.log.warning(f"Failed to collect pipelines from {path}: {e}")

        context.log.info(f"Total pipelines collected: {total_pipelines}")

        # Backfill duration for pipelines that don't have it
        if total_pipelines > 0:
            try:
                cur = conn.cursor()
                # Method 1: LEAD window function — duration = time to next pipeline on same ref
                cur.execute("""
                    WITH ranked AS (
                        SELECT id, ref, created_at, status, duration,
                               LEAD(created_at) OVER (PARTITION BY project_id, ref ORDER BY created_at) as next_created
                        FROM project_pipelines
                        WHERE duration IS NULL AND status IN ('success', 'failed')
                    )
                    UPDATE project_pipelines pp
                    SET duration = GREATEST(1, EXTRACT(EPOCH FROM (r.next_created - r.created_at))::int)
                    FROM ranked r
                    WHERE pp.id = r.id AND r.next_created IS NOT NULL
                      AND EXTRACT(EPOCH FROM (r.next_created - r.created_at)) > 0
                      AND EXTRACT(EPOCH FROM (r.next_created - r.created_at)) < 7200
                """)
                backfill1 = cur.rowcount
                conn.commit()

                # Method 2: Average duration per ref (per project)
                cur.execute("""
                    WITH ref_avg AS (
                        SELECT project_id, ref, AVG(duration)::int as avg_dur
                        FROM project_pipelines
                        WHERE duration IS NOT NULL AND status IN ('success', 'failed')
                        GROUP BY project_id, ref
                    )
                    UPDATE project_pipelines pp
                    SET duration = ra.avg_dur
                    FROM ref_avg ra
                    WHERE pp.project_id = ra.project_id AND pp.ref = ra.ref AND pp.duration IS NULL AND pp.status IN ('success', 'failed')
                """)
                backfill2 = cur.rowcount
                conn.commit()
                cur.close()

                if backfill1 > 0 or backfill2 > 0:
                    context.log.info(f"Pipeline duration backfill: LEAD={backfill1}, ref_avg={backfill2}")
            except Exception as e:
                context.log.warning(f"Pipeline duration backfill failed: {e}")

    finally:
        conn.close()


def get_projects(cursor):
    """Fetch all projects from database."""
    cursor.execute("SELECT id, path, token_encrypted, base_url FROM projects")
    return cursor.fetchall()


def get_token(project_token_encrypted, client_token, conn=None, base_url=None):
    """Decrypt project token, fall back to personal_tokens table, then client token."""
    token = decrypt(project_token_encrypted) if project_token_encrypted else ""
    if not token and conn and base_url:
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT token_encrypted FROM personal_tokens WHERE base_url = %s ORDER BY created_at DESC LIMIT 1",
                (base_url,)
            )
            row = cur.fetchone()
            cur.close()
            if row and row[0]:
                token = decrypt(row[0])
        except Exception:
            pass
    return token if token else (client_token if client_token else None)


@asset(compute_kind="gitlab")
def gitlab_branches(context: AssetExecutionContext) -> None:
    """Collect branches from GitLab API."""
    from dagster_project.utils.helpers import get_gitlab_client

    client = get_gitlab_client()
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()
        projects = get_projects(cursor)
        cursor.close()

        total = 0
        for proj_id, path, token_encrypted, base_url in projects:
            try:
                token = get_token(token_encrypted, client["token"], conn, base_url)
                if not token:
                    continue

                encoded_path = urllib.parse.quote(path, safe='')
                branches = gitlab_request_paginated(
                    f"/projects/{encoded_path}/repository/branches",
                    token, base_url,
                    {"per_page": "100"}
                )

                rows = []
                for b in branches:
                    # GitLab API returns 'commit' not 'last_commit' for branches
                    lc = b.get("commit") or b.get("last_commit") or {}
                    rows.append((
                        proj_id, b.get("name", ""),
                        b.get("default", False),
                        b.get("merged", False),
                        b.get("protected", False),
                        lc.get("committed_date"),
                        lc.get("author_name", ""),
                        lc.get("author_email", ""),
                        lc.get("message", ""),
                        None,
                        b.get("can_push", False),
                        lc.get("stats", {}).get("additions", 0),
                        lc.get("stats", {}).get("deletions", 0),
                    ))

                if rows:
                    batch_insert(conn, "project_branches",
                        ["project_id", "name", "\"default\"", "merged", "protected",
                         "last_commit_date", "last_commit_author", "last_commit_author_email",
                         "last_commit_message", "first_commit_date", "can_push",
                         "last_commit_additions", "last_commit_deletions"], rows,
                        conflict_columns=["project_id", "name"])
                    total += len(rows)

                context.log.info(f"Collected {len(rows)} branches from {path}")
            except Exception as e:
                context.log.warning(f"Failed to collect branches from {path}: {e}")

        context.log.info(f"Total branches collected: {total}")
    finally:
        conn.close()


@asset(compute_kind="gitlab")
def gitlab_languages(context: AssetExecutionContext) -> None:
    """Collect project languages from GitLab API."""
    from dagster_project.utils.helpers import get_gitlab_client

    client = get_gitlab_client()
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()
        projects = get_projects(cursor)
        cursor.close()

        total = 0
        for proj_idx, (proj_id, path, token_encrypted, base_url) in enumerate(projects):
            try:
                token = get_token(token_encrypted, client["token"], conn, base_url)
                if not token:
                    continue

                encoded_path = urllib.parse.quote(path, safe='')
                data = gitlab_request(
                    f"/projects/{encoded_path}/languages",
                    token, base_url
                )

                if data:
                    total_bytes = sum(data.values()) or 1
                    rows = []
                    for lang, bytes_val in data.items():
                        rows.append((
                            proj_id, lang, bytes_val,
                            round(bytes_val / total_bytes * 100, 2)
                        ))

                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM project_languages WHERE project_id = %s", (proj_id,))
                    conn.commit()
                    cursor.close()

                    if rows:
                        batch_insert(conn, "project_languages",
                            ["project_id", "language", "bytes", "percentage"], rows)
                        total += len(rows)

                context.log.info(f"[{proj_idx+1}/{len(projects)}] Collected languages from {path}")
            except Exception as e:
                context.log.warning(f"Failed to collect languages from {path}: {e}")

        context.log.info(f"Total language entries collected: {total}")
    finally:
        conn.close()


@asset(deps=["gitlab_commits"], compute_kind="aggregate")
def backfill_gitlab_user_id(context: AssetExecutionContext) -> None:
    """Backfill gitlab_user_id on commits that don't have it, using contributor_directory."""
    conn = get_pg_connection()
    try:
        cursor = conn.cursor()

        # Backfill commits.gitlab_user_id from contributor_directory email mapping
        cursor.execute("""
            WITH dir_map AS (
                SELECT DISTINCT ON (LOWER(email))
                    LOWER(email) as email_lower,
                    gitlab_user_id
                FROM contributor_directory,
                     unnest(emails) as email
                WHERE gitlab_user_id IS NOT NULL
                ORDER BY LOWER(email), is_valid DESC
            )
            UPDATE commits c
            SET gitlab_user_id = dm.gitlab_user_id
            FROM dir_map dm
            WHERE dm.email_lower = LOWER(c.author_email)
              AND c.gitlab_user_id IS NULL
              AND dm.gitlab_user_id IS NOT NULL
        """)
        affected = cursor.rowcount
        conn.commit()
        cursor.close()

        context.log.info(f"Backfilled gitlab_user_id on {affected} commits from directory")
    finally:
        conn.close()


@asset(deps=["backfill_gitlab_user_id"], compute_kind="aggregate")
def gitlab_contributors(context: AssetExecutionContext) -> None:
    """Aggregate contributor profiles from commits, resolving display_name from contributor_directory."""
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()

        # Single atomic query with CTEs (no TEMP table — safe within one connection)
        # Resolves emails through contributor_directory so display_name is canonical
        cursor.execute("""
            WITH dir_map AS (
                SELECT DISTINCT ON (LOWER(email))
                    LOWER(email) as email_lower,
                    display_name,
                    gitlab_user_id
                FROM contributor_directory,
                     unnest(emails) as email
                ORDER BY LOWER(email), is_valid DESC
            ),
            date_counts AS (
                SELECT project_id, author_email,
                       TO_CHAR(committed_date, 'YYYY-MM-DD') as day,
                       COUNT(*) as cnt
                FROM commits
                WHERE committed_date >= NOW() - INTERVAL '90 days'
                GROUP BY project_id, author_email, TO_CHAR(committed_date, 'YYYY-MM-DD')
            ),
            freq_json AS (
                SELECT project_id, author_email,
                       jsonb_object_agg(day, cnt) as frequency
                FROM date_counts
                GROUP BY project_id, author_email
            )
            INSERT INTO contributor_profiles
                (project_id, author_email, author_name, total_commits,
                 total_additions, total_deletions, total_changes,
                 first_commit_date, last_commit_date, frequency, gitlab_user_id)
            SELECT
                c.project_id,
                c.author_email,
                COALESCE(dm.display_name,
                         MAX(c.author_name) FILTER (WHERE c.author_name NOT LIKE '%@%'),
                         MAX(c.author_name)) as author_name,
                COUNT(*)::int as total_commits,
                SUM(c.additions)::int as total_additions,
                SUM(c.deletions)::int as total_deletions,
                SUM(c.additions + c.deletions)::int as total_changes,
                MIN(c.committed_date) as first_commit_date,
                MAX(c.committed_date) as last_commit_date,
                COALESCE(f.frequency, '{}'::jsonb) as frequency,
                dm.gitlab_user_id
            FROM commits c
            LEFT JOIN dir_map dm ON dm.email_lower = LOWER(c.author_email)
            LEFT JOIN freq_json f ON f.project_id = c.project_id AND f.author_email = c.author_email
            WHERE c.committed_date >= NOW() - INTERVAL '90 days'
            GROUP BY c.project_id, c.author_email, dm.display_name, dm.gitlab_user_id, f.frequency
            ON CONFLICT (project_id, author_email) DO UPDATE SET
                author_name = EXCLUDED.author_name,
                total_commits = EXCLUDED.total_commits,
                total_additions = EXCLUDED.total_additions,
                total_deletions = EXCLUDED.total_deletions,
                total_changes = EXCLUDED.total_changes,
                first_commit_date = EXCLUDED.first_commit_date,
                last_commit_date = EXCLUDED.last_commit_date,
                frequency = EXCLUDED.frequency,
                gitlab_user_id = EXCLUDED.gitlab_user_id
        """)

        affected = cursor.rowcount
        conn.commit()
        cursor.close()

        context.log.info(f"Aggregated {affected} contributor profiles")
    finally:
        conn.close()


@asset(deps=["gitlab_commits", "gitlab_merge_requests", "gitlab_pipelines"], compute_kind="aggregate")
def gitlab_activity(context: AssetExecutionContext) -> None:
    """Aggregate daily activity from commits, MRs, and pipelines."""
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()
        cursor.execute("""
            WITH commit_activity AS (
                SELECT project_id,
                       committed_date::date as date,
                       COUNT(*) as commits
                FROM commits
                WHERE committed_date >= NOW() - INTERVAL '90 days'
                GROUP BY project_id, committed_date::date
            ),
            mr_activity AS (
                SELECT project_id,
                       created_at::date as date,
                       COUNT(*) as merge_requests
                FROM project_merge_requests
                WHERE created_at >= NOW() - INTERVAL '90 days'
                GROUP BY project_id, created_at::date
            ),
            pipeline_activity AS (
                SELECT project_id,
                       created_at::date as date,
                       COUNT(*) as pipelines
                FROM project_pipelines
                WHERE created_at >= NOW() - INTERVAL '90 days'
                GROUP BY project_id, created_at::date
            )
            INSERT INTO project_activity (project_id, date, commits, merge_requests, pipelines)
            SELECT
                agg.project_id,
                agg.date,
                COALESCE(agg.commits, 0) as commits,
                COALESCE(agg.merge_requests, 0) as merge_requests,
                COALESCE(agg.pipelines, 0) as pipelines
            FROM (
                SELECT
                    COALESCE(c.project_id, mr.project_id, p.project_id) as project_id,
                    COALESCE(c.date, mr.date, p.date) as date,
                    c.commits,
                    mr.merge_requests,
                    p.pipelines
                FROM commit_activity c
                FULL OUTER JOIN mr_activity mr ON c.project_id = mr.project_id AND c.date = mr.date
                FULL OUTER JOIN pipeline_activity p ON COALESCE(c.project_id, mr.project_id) = p.project_id
                    AND COALESCE(c.date, mr.date) = p.date
            ) agg
            WHERE EXISTS (SELECT 1 FROM projects WHERE id = agg.project_id)
            ON CONFLICT (project_id, date) DO UPDATE SET
                commits = EXCLUDED.commits,
                merge_requests = EXCLUDED.merge_requests,
                pipelines = EXCLUDED.pipelines
        """)
        affected = cursor.rowcount
        conn.commit()
        cursor.close()

        context.log.info(f"Aggregated activity for {affected} project-days")
    finally:
        conn.close()


@asset(compute_kind="gitlab")
def gitlab_dependencies(context: AssetExecutionContext) -> None:
    """Audit project dependencies via repository tree scanning."""
    from dagster_project.utils.helpers import get_gitlab_client

    client = get_gitlab_client()
    conn = get_pg_connection()

    DEPENDENCY_FILES = {
        "package.json": "npm",
        "requirements.txt": "pip",
        "go.mod": "go",
        "Cargo.toml": "cargo",
        "Gemfile": "rubygems",
        "pom.xml": "maven",
        "build.gradle": "gradle",
        "composer.json": "composer",
        "Podfile": "cocoapods",
        "pubspec.yaml": "pub",
        "Package.swift": "swift",
    }

    MAX_DEP_FILES_PER_PROJECT = 20  # Limit files per project to avoid hanging

    try:
        cursor = conn.cursor()
        projects = get_projects(cursor)
        cursor.close()

        total = 0
        for proj_idx, (proj_id, path, token_encrypted, base_url) in enumerate(projects):
            try:
                token = get_token(token_encrypted, client["token"], conn, base_url)
                if not token:
                    continue

                encoded_path = urllib.parse.quote(path, safe='')
                files = gitlab_request_paginated(
                    f"/projects/{encoded_path}/repository/tree",
                    token, base_url,
                    {"recursive": "true", "per_page": "100"},
                    max_pages=50
                )

                SKIP_DIRS = {"node_modules", ".git", "vendor", "dist", "build", "__pycache__"}
                dep_files = []
                for f in files:
                    if f.get("type") != "blob":
                        continue
                    file_path = f.get("path") or f.get("name", "")
                    parts = file_path.split("/")
                    if any(p in SKIP_DIRS for p in parts[:-1]):
                        continue
                    file_name = file_path.rsplit("/", 1)[-1]
                    if file_name in DEPENDENCY_FILES:
                        f["_full_path"] = file_path
                        dep_files.append(f)

                if dep_files:
                    context.log.info(f"Found {len(dep_files)} dependency files in {path}: {[f.get('_full_path') for f in dep_files[:5]]}")

                # Limit files per project to avoid hanging on huge repos
                if len(dep_files) > MAX_DEP_FILES_PER_PROJECT:
                    context.log.warning(f"Too many dep files ({len(dep_files)}) in {path}, limiting to {MAX_DEP_FILES_PER_PROJECT}")
                    dep_files = dep_files[:MAX_DEP_FILES_PER_PROJECT]

                rows = []
                for f in dep_files:
                    file_path = f["_full_path"]
                    file_name = file_path.rsplit("/", 1)[-1]
                    source = DEPENDENCY_FILES[file_name]

                    try:
                        raw_content = gitlab_request_raw(
                            f"/projects/{encoded_path}/repository/files/{urllib.parse.quote(file_path, safe='')}/raw",
                            token, base_url,
                            {"ref": "HEAD"}
                        )

                        if isinstance(raw_content, str):
                            deps = parse_dependency_file(file_name, raw_content)
                            if deps:
                                for name, version in deps:
                                    rows.append((proj_id, name, version, False, source))
                            else:
                                context.log.debug(f"No deps parsed from {file_path}")
                        else:
                            context.log.debug(f"Non-string response for {file_path}: {type(raw_content)}")
                    except Exception as e:
                        context.log.debug(f"Failed to read {file_path}: {e}")

                if rows:
                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM project_dependencies_audit WHERE project_id = %s", (proj_id,))
                    conn.commit()
                    cursor.close()

                    batch_insert(conn, "project_dependencies_audit",
                        ["project_id", "name", "current_version", "is_outdated", "source"], rows)
                    total += len(rows)

                context.log.info(f"[{proj_idx+1}/{len(projects)}] Collected {len(rows)} dependencies from {path}")
            except Exception as e:
                context.log.warning(f"Failed to collect dependencies from {path}: {e}")

        context.log.info(f"Total dependency entries collected: {total}")
    finally:
        conn.close()


def parse_dependency_file(file_name, content):
    """Parse dependency file and return list of (name, version) tuples."""
    import json

    deps = []
    try:
        if file_name == "package.json":
            data = json.loads(content)
            for name, ver in data.get("dependencies", {}).items():
                deps.append((name, ver))
            for name, ver in data.get("devDependencies", {}).items():
                deps.append((name, ver))

        elif file_name == "requirements.txt":
            for line in content.splitlines():
                line = line.strip()
                if not line or line.startswith("#") or line.startswith("-"):
                    continue
                if "==" in line:
                    name, ver = line.split("==", 1)
                    deps.append((name.strip(), ver.strip()))
                elif ">=" in line:
                    name, ver = line.split(">=", 1)
                    deps.append((name.strip(), ver.strip()))
                elif "[[" in line:
                    name = line.split("[")[0].strip()
                    deps.append((name, ""))
                else:
                    deps.append((line, ""))

        elif file_name == "go.mod":
            in_require = False
            for line in content.splitlines():
                if line.strip().startswith("require ("):
                    in_require = True
                    continue
                if line.strip() == ")" and in_require:
                    in_require = False
                    continue
                if in_require:
                    parts = line.strip().split()
                    if len(parts) >= 2:
                        deps.append((parts[0], parts[1]))

        elif file_name == "Gemfile":
            for line in content.splitlines():
                line = line.strip()
                if line.startswith("gem ") and '"' in line:
                    parts = line.split('"')
                    if len(parts) >= 3:
                        deps.append((parts[1], parts[2] if len(parts) > 2 else ""))

        elif file_name == "pom.xml":
            import xml.etree.ElementTree as ET
            root = ET.fromstring(content)
            ns = {"m": "http://maven.apache.org/POM/4.0.0"}
            for dep in root.findall(".//m:dependency", ns):
                gid = dep.find("m:groupId", ns)
                aid = dep.find("m:artifactId", ns)
                ver = dep.find("m:version", ns)
                if gid is not None and aid is not None:
                    deps.append((f"{gid.text}:{aid.text}", ver.text if ver is not None else ""))

        elif file_name == "build.gradle":
            for line in content.splitlines():
                line = line.strip()
                if "implementation" in line or "api" in line:
                    if "'" in line:
                        parts = line.split("'")
                        if len(parts) >= 3:
                            dep_str = parts[1]
                            if ":" in dep_str:
                                deps.append((dep_str, ""))
                    elif '"' in line:
                        parts = line.split('"')
                        if len(parts) >= 3:
                            dep_str = parts[1]
                            if ":" in dep_str:
                                deps.append((dep_str, ""))

        elif file_name == "Podfile":
            for line in content.splitlines():
                line = line.strip()
                if line.startswith("pod "):
                    parts = line.split("'")
                    if len(parts) >= 3:
                        name = parts[1]
                        ver = parts[3] if len(parts) > 3 and parts[2].strip().startswith(",") else ""
                        deps.append((name, ver))

        elif file_name == "pubspec.yaml":
            in_deps = False
            for line in content.splitlines():
                stripped = line.strip()
                if stripped == "dependencies:":
                    in_deps = True
                    continue
                if in_deps and not stripped.startswith(" ") and stripped and not stripped.startswith("#"):
                    in_deps = False
                if in_deps and ":" in stripped:
                    parts = stripped.split(":")
                    name = parts[0].strip()
                    ver = parts[1].strip().strip('"').strip("'") if len(parts) > 1 else ""
                    if name and not name.startswith("#"):
                        deps.append((name, ver))

        elif file_name == "Package.swift":
            for line in content.splitlines():
                line = line.strip()
                if '.package(' in line and 'url:' in line:
                    import re
                    url_match = re.search(r'url:\s*"([^"]+)"', line)
                    ver_match = re.search(r'from:\s*"([^"]+)"', line)
                    if url_match:
                        name = url_match.group(1).split("/")[-1].replace(".git", "")
                        ver = ver_match.group(1) if ver_match else ""
                        deps.append((name, ver))

        elif file_name.endswith(".csproj"):
            import xml.etree.ElementTree as ET
            root = ET.fromstring(content)
            for ref in root.findall(".//PackageReference"):
                name = ref.get("Include", "")
                ver = ref.get("Version", "")
                if name:
                    deps.append((name, ver))

    except Exception:
        pass

    return deps


@asset(deps=["gitlab_merge_requests"], compute_kind="aggregate")
def backfill_mr_reviewers(context: AssetExecutionContext) -> None:
    """Backfill reviewers on MRs that don't have them, using GitLab detail endpoint."""
    from dagster_project.utils.helpers import get_gitlab_client

    client = get_gitlab_client()
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()

        # Only backfill merged MRs from last 90 days (most relevant for analytics)
        cursor.execute("""
            SELECT pmr.id, pmr.project_id, pmr.gitlab_iid, p.path, p.token_encrypted, p.base_url
            FROM project_merge_requests pmr
            JOIN projects p ON p.id = pmr.project_id
            WHERE pmr.reviewers = '{}'::text[]
              AND pmr.state = 'merged'
              AND pmr.merged_at >= NOW() - INTERVAL '90 days'
            ORDER BY pmr.merged_at DESC
            LIMIT 500
        """)
        mrs_to_backfill = cursor.fetchall()
        cursor.close()

        if not mrs_to_backfill:
            context.log.info("No MRs need reviewer backfill")
            return

        context.log.info(f"Backfilling reviewers for {len(mrs_to_backfill)} MRs")

        updated = 0
        for mr_id, proj_id, gitlab_iid, path, token_encrypted, base_url in mrs_to_backfill:
            try:
                token = get_token(token_encrypted, client["token"], conn, base_url)
                if not token:
                    continue

                encoded_path = urllib.parse.quote(path, safe='')
                detail = gitlab_request(
                    f"/projects/{encoded_path}/merge_requests/{gitlab_iid}",
                    token, base_url
                )

                if not detail or not isinstance(detail, dict):
                    continue

                reviewers = []
                revs = detail.get("reviewers", [])
                if revs:
                    reviewers = [r.get("username", "") or r.get("name", "") for r in revs if r]

                # Fallback: try approvals endpoint
                if not reviewers:
                    try:
                        approval_data = gitlab_request(
                            f"/projects/{encoded_path}/merge_requests/{gitlab_iid}/approvals",
                            token, base_url
                        )
                        if approval_data and isinstance(approval_data, dict):
                            approved_by = approval_data.get("approved_by", [])
                            if approved_by:
                                reviewers = [
                                    a.get("user", {}).get("name", "") or a.get("user", {}).get("username", "")
                                    for a in approved_by if a.get("user")
                                ]
                    except Exception:
                        pass

                if reviewers:
                    cur = conn.cursor()
                    cur.execute(
                        "UPDATE project_merge_requests SET reviewers = %s, approvals = %s WHERE id = %s",
                        (reviewers, len(reviewers), mr_id)
                    )
                    conn.commit()
                    cur.close()
                    updated += 1
            except Exception as e:
                context.log.debug(f"Failed to backfill reviewers for MR {gitlab_iid}: {e}")

        context.log.info(f"Backfilled reviewers on {updated}/{len(mrs_to_backfill)} MRs")
    finally:
        conn.close()


@asset(compute_kind="gitlab")
def gitlab_issues(context: AssetExecutionContext) -> None:
    """Collect issues from GitLab API and store in PostgreSQL."""
    from dagster_project.utils.helpers import get_gitlab_client

    client = get_gitlab_client()
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()
        projects = get_projects(cursor)
        cursor.close()

        total = 0
        for proj_id, path, token_encrypted, base_url in projects:
            try:
                token = get_token(token_encrypted, client["token"], conn, base_url)
                if not token:
                    continue

                encoded_path = urllib.parse.quote(path, safe='')
                issues = gitlab_request_paginated(
                    f"/projects/{encoded_path}/issues",
                    token, base_url,
                    {"per_page": "100", "scope": "all", "state": "all"}
                )

                rows = []
                for issue in issues:
                    rows.append((
                        proj_id, issue.get("iid"), issue.get("title", ""),
                        issue.get("state", ""),
                        issue.get("author", {}).get("email", "") if issue.get("author") else "",
                        issue.get("assignees", [{}])[0].get("email", "") if issue.get("assignees") else "",
                        ",".join(issue.get("labels", [])),
                        issue.get("created_at"), issue.get("closed_at"),
                        issue.get("due_date"), issue.get("weight"),
                    ))

                if rows:
                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM project_issues WHERE project_id = %s", (proj_id,))
                    conn.commit()
                    cursor.close()

                    batch_insert(conn, "project_issues",
                        ["project_id", "gitlab_iid", "title", "state", "author_email",
                         "assignee_email", "labels", "created_at", "closed_at",
                         "due_date", "weight"], rows)
                    total += len(rows)

                context.log.info(f"Collected {len(rows)} issues from {path}")
            except Exception as e:
                context.log.warning(f"Failed to collect issues from {path}: {e}")

        context.log.info(f"Total issues collected: {total}")
    finally:
        conn.close()


@asset(deps=["gitlab_pipelines"], compute_kind="gitlab")
def gitlab_deployments(context: AssetExecutionContext) -> None:
    """Collect deployments from GitLab API and store in PostgreSQL."""
    from dagster_project.utils.helpers import get_gitlab_client

    client = get_gitlab_client()
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()
        projects = get_projects(cursor)
        cursor.close()

        total = 0
        for proj_id, path, token_encrypted, base_url in projects:
            try:
                token = get_token(token_encrypted, client["token"], conn, base_url)
                if not token:
                    continue

                params = {"per_page": "100", "order_by": "id", "sort": "desc"}
                last_date = get_last_collection_date(conn, "project_deployments", "created_at", proj_id)
                if last_date:
                    since = last_date.isoformat() if hasattr(last_date, 'isoformat') else str(last_date)
                    params["updated_after"] = since
                    context.log.info(f"Incremental deployments for {path} since {since}")
                else:
                    context.log.info(f"Full deployment collection for {path}")

                encoded_path = urllib.parse.quote(path, safe='')
                deployments = gitlab_request_paginated(
                    f"/projects/{encoded_path}/deployments",
                    token, base_url, params, max_pages=1000
                )

                rows = []
                for d in deployments:
                    pipeline_id = None
                    pipeline_status = None
                    if d.get("pipeline"):
                        pipeline_id = d["pipeline"].get("id")
                        pipeline_status = d["pipeline"].get("status")
                    elif (d.get("deployable") or {}).get("pipeline"):
                        pipeline_id = d["deployable"]["pipeline"].get("id")
                        pipeline_status = d["deployable"]["pipeline"].get("status")

                    finished_at = d.get("finished_at") or (d.get("deployable") or {}).get("finished_at")

                    import json as json_mod
                    rows.append((
                        proj_id, d.get("id"), d.get("status", ""),
                        d.get("ref", ""),
                        (d.get("environment") or {}).get("name", ""),
                        pipeline_id, pipeline_status,
                        d.get("created_at"), finished_at,
                        json_mod.dumps(d),
                    ))

                if rows:
                    batch_insert(conn, "project_deployments",
                        ["project_id", "gitlab_deployment_id", "status", "ref",
                         "environment", "pipeline_id", "pipeline_status",
                         "created_at", "finished_at", "raw_json"], rows,
                        conflict_columns=["project_id", "gitlab_deployment_id"])
                    total += len(rows)

                context.log.info(f"Collected {len(rows)} deployments from {path}")
            except Exception as e:
                context.log.warning(f"Failed to collect deployments from {path}: {e}")

        context.log.info(f"Total deployments collected: {total}")
    finally:
        conn.close()


CLICKHOUSE_TABLES = [
    {"name": "commits", "pg_columns": ["id", "project_id", "commit_sha", "author_name", "author_email", "committed_date", "additions", "deletions"], "dateColumn": "committed_date", "col_map": {"commit_sha": "sha"}},
    {"name": "project_merge_requests", "pg_columns": ["id", "project_id", "gitlab_iid", "title", "state", "author_name", "author_email", "source_branch", "target_branch", "created_at", "updated_at", "merged_at", "closed_at", "reviewers", "changes_count"], "dateColumn": "created_at", "col_map": {}},
    {"name": "project_pipelines", "pg_columns": ["id", "project_id", "gitlab_id", "status", "ref", "source", "duration", "created_at", "finished_at", "user_name"], "dateColumn": "created_at", "col_map": {}},
    {"name": "project_deployments", "pg_columns": ["id", "project_id", "gitlab_deployment_id", "status", "environment", "pipeline_status", "created_at", "finished_at"], "dateColumn": "created_at", "col_map": {"gitlab_deployment_id": "gitlab_id"}},
    {"name": "project_branches", "pg_columns": ["id", "project_id", "name", "merged", "protected", "\"default\"", "last_commit_date", "last_commit_author", "last_commit_additions", "last_commit_deletions"], "pg_col_aliases": ["id", "project_id", "name", "merged", "protected", "is_default", "last_commit_date", "last_commit_author", "additions", "deletions"], "dateColumn": None, "col_map": {}},
    {"name": "contributor_profiles", "pg_columns": ["id", "project_id", "author_email", "author_name", "total_commits", "total_additions", "total_deletions", "first_commit_date", "last_commit_date"], "dateColumn": None, "col_map": {}},
]

CH_TABLE_MAP = {
    "commits": "commits",
    "project_merge_requests": "merge_requests",
    "project_pipelines": "pipelines",
    "project_deployments": "deployments",
    "project_branches": "branches",
    "contributor_profiles": "contributor_profiles",
}

CH_COLUMNS = {
    "commits": ["id", "project_id", "sha", "author_name", "author_email", "committed_date", "additions", "deletions"],
    "merge_requests": ["id", "project_id", "gitlab_iid", "title", "state", "author_name", "author_email", "source_branch", "target_branch", "created_at", "updated_at", "merged_at", "closed_at", "reviewers", "approvals", "changes_count", "comments_count"],
    "pipelines": ["id", "project_id", "gitlab_id", "status", "ref", "source", "duration", "created_at", "finished_at", "user_name"],
    "deployments": ["id", "project_id", "gitlab_id", "status", "environment", "pipeline_status", "created_at", "finished_at"],
    "branches": ["id", "project_id", "name", "merged", "protected", "is_default", "last_commit_date", "last_commit_author", "additions", "deletions"],
    "contributor_profiles": ["id", "project_id", "author_email", "author_name", "total_commits", "total_additions", "total_deletions", "active_days", "last_commit_date", "first_commit_date"],
}


@asset(deps=["gitlab_commits", "gitlab_merge_requests", "gitlab_pipelines", "gitlab_deployments", "gitlab_branches", "gitlab_contributors"], compute_kind="sync")
def clickhouse_sync(context: AssetExecutionContext) -> None:
    """Sync PostgreSQL data to ClickHouse for OLAP analytics."""
    import os
    try:
        import clickhouse_connect
    except ImportError:
        context.log.warning("clickhouse_connect not installed, skipping ClickHouse sync")
        return

    ch_host = os.environ.get("CLICKHOUSE_URL", "http://clickhouse:8123")
    ch_db = os.environ.get("CLICKHOUSE_DB", "gitlab_scout")
    ch_user = os.environ.get("CLICKHOUSE_USER", "admin")
    ch_pass = os.environ.get("CLICKHOUSE_PASSWORD", "changeme")

    try:
        ch = clickhouse_connect.get_client(host=ch_host, database=ch_db, username=ch_user, password=ch_pass)
    except Exception as e:
        context.log.warning(f"ClickHouse not available, skipping sync: {e}")
        return

    pg_conn = get_pg_connection()
    BATCH_SIZE = 10000

    try:
        total_synced = 0
        for table_def in CLICKHOUSE_TABLES:
            pg_table = table_def["name"]
            ch_table = CH_TABLE_MAP[pg_table]
            pg_cols = table_def["pg_columns"]
            pg_aliases = table_def.get("pg_col_aliases", pg_cols)
            ch_cols = CH_COLUMNS[ch_table]
            col_map = table_def.get("col_map", {})
            date_col = table_def.get("dateColumn")

            # Build PG column names for SELECT (quote reserved words)
            select_parts = []
            for c in pg_cols:
                if c.startswith('"'):
                    select_parts.append(c)
                else:
                    select_parts.append(c)

            # Check last sync time
            where = ""
            if date_col:
                try:
                    result = ch.query(f"SELECT max({date_col}) as last_sync FROM {ch_table}")
                    last_sync = result.result_rows[0][0] if result.result_rows else None
                    if last_sync:
                        where = f"WHERE {date_col} > '{last_sync}'"
                    else:
                        where = f"WHERE {date_col} >= NOW() - INTERVAL '90 days'"
                except Exception:
                    where = f"WHERE {date_col} >= NOW() - INTERVAL '90 days'" if date_col else ""

            count_result = pg_conn.cursor()
            count_result.execute(f"SELECT COUNT(*)::int FROM {pg_table} {where}")
            total = count_result.fetchone()[0]
            count_result.close()

            if total == 0:
                context.log.info(f"ClickHouse sync: {pg_table} — 0 rows to sync")
                continue

            offset = 0
            synced = 0
            select_cols = ", ".join(select_parts)

            while offset < total:
                pg_cur = pg_conn.cursor()
                pg_cur.execute(f"SELECT {select_cols} FROM {pg_table} {where} ORDER BY id LIMIT {BATCH_SIZE} OFFSET {offset}")
                rows = pg_cur.fetchall()
                pg_cur.close()

                if not rows:
                    break

                ch_rows = []
                for row in rows:
                    ch_row = {}
                    for i, pg_col in enumerate(pg_cols):
                        clean_col = pg_col.strip('"')
                        ch_col = col_map.get(clean_col, clean_col)
                        if ch_col not in ch_cols:
                            continue
                        val = row[i]
                        if val is None:
                            ch_row[ch_col] = None
                        elif hasattr(val, 'isoformat'):
                            ch_row[ch_col] = val.isoformat()
                        else:
                            ch_row[ch_col] = val
                    ch_rows.append(ch_row)

                ch.insert(table=ch_table, data=ch_rows, column_names=ch_cols)
                synced += len(ch_rows)
                offset += BATCH_SIZE

            total_synced += synced
            context.log.info(f"ClickHouse sync: {pg_table} → {ch_table}: {synced} rows")

        context.log.info(f"ClickHouse sync complete: {total_synced} total rows")
    finally:
        pg_conn.close()
        ch.close()


@asset(compute_kind="audit")
def gitlab_dependency_audit(context: AssetExecutionContext) -> None:
    """Weekly dependency audit: check staleness using catalog and version APIs."""
    import os
    import re
    from dagster_project.utils.helpers import get_gitlab_client, gitlab_request_paginated, gitlab_request_raw

    client = get_gitlab_client()
    conn = get_pg_connection()

    try:
        # Load catalog: file patterns + version check URLs
        cur = conn.cursor()
        cur.execute("SELECT ecosystem, file_names, version_check_url FROM dependency_catalog WHERE is_active = true")
        catalog_rows = cur.fetchall()
        cur.close()

        # Build file pattern sets
        catalog_files = set()
        glob_patterns = []
        url_templates: dict[str, str] = {}
        for ecosystem, file_names, url in catalog_rows:
            if url:
                url_templates[ecosystem] = url
            for fn in (file_names or []):
                if "*" in fn:
                    glob_patterns.append(fn)
                else:
                    catalog_files.add(fn)

        # Fallback files
        for fn in ["package.json", "requirements.txt", "go.mod", "Cargo.toml", "pom.xml",
                    "build.gradle", "build.gradle.kts", "composer.json", "pubspec.yaml",
                    "Package.swift", "Podfile", "Gemfile"]:
            catalog_files.add(fn)

        context.log.info(f"Dependency audit: {len(catalog_files)} catalog files, {len(url_templates)} ecosystems with version check")

        # Load version check URLs
        cur = conn.cursor()
        cur.execute("SELECT ecosystem, version_check_url FROM dependency_catalog WHERE version_check_url IS NOT NULL AND is_active = true")
        for row in cur.fetchall():
            url_templates[row[0]] = row[1]
        cur.close()

        cursor = conn.cursor()
        projects = get_projects(cursor)
        cursor.close()

        total_deps = 0
        total_outdated = 0

        for proj_id, path, token_encrypted, base_url in projects:
            try:
                token = get_token(token_encrypted, client["token"], conn, base_url)
                if not token:
                    continue

                encoded_path = urllib.parse.quote(path, safe='')
                files = gitlab_request_paginated(
                    f"/projects/{encoded_path}/repository/tree",
                    token, base_url,
                    {"recursive": "true", "per_page": "100"}
                )

                # Find dependency files using catalog patterns
                SKIP_DIRS = {"node_modules", ".git", "vendor", "dist", "build", "__pycache__"}
                dep_files = []
                for f in files:
                    if f.get("type") != "blob":
                        continue
                    file_path = f.get("path") or f.get("name", "")
                    parts = file_path.split("/")
                    if any(p in SKIP_DIRS for p in parts[:-1]):
                        continue
                    file_name = file_path.rsplit("/", 1)[-1]
                    if file_name in catalog_files:
                        dep_files.append({"path": file_path, "name": file_name})
                    elif any(re.match(p.replace("*", ".*"), file_name) for p in glob_patterns):
                        dep_files.append({"path": file_path, "name": file_name})

                if not dep_files:
                    continue

                # Parse dependencies from files
                deps = []
                for f in dep_files:
                    try:
                        raw_content = gitlab_request_raw(
                            f"/projects/{encoded_path}/repository/files/{urllib.parse.quote(f['path'], safe='')}/raw",
                            token, base_url,
                            {"ref": "HEAD"}
                        )
                        if isinstance(raw_content, str):
                            parsed = parse_dependency_file(f["name"], raw_content)
                            for name, version in parsed:
                                deps.append({"name": name, "version": version, "source": _get_source(f["name"])})
                    except Exception as e:
                        context.log.debug(f"Failed to read {f['path']}: {e}")

                if not deps:
                    continue

                # Deduplicate
                deduped = {}
                for d in deps:
                    key = f"{d['name']}@{d['source']}"
                    if key not in deduped:
                        deduped[key] = d

                # Check for outdated versions
                outdated_count = 0
                for key, dep in deduped.items():
                    if not dep["version"] or dep["version"] in ("latest", "*", "^latest"):
                        outdated_count += 1
                        dep["is_outdated"] = True
                        continue
                    url_template = url_templates.get(dep["source"])
                    if not url_template:
                        dep["is_outdated"] = False
                        continue
                    try:
                        latest = _check_latest_version(dep["name"], dep["source"], url_template)
                        if latest and _normalize_version(dep["version"]) != _normalize_version(latest):
                            outdated_count += 1
                            dep["is_outdated"] = True
                        else:
                            dep["is_outdated"] = False
                    except Exception:
                        dep["is_outdated"] = False

                # Store results
                cur = conn.cursor()
                cur.execute("DELETE FROM project_dependencies_audit WHERE project_id = %s", (proj_id,))
                conn.commit()

                rows = [(proj_id, d["name"], d["version"], d.get("is_outdated", False), d["source"]) for d in deduped.values()]
                if rows:
                    batch_insert(conn, "project_dependencies_audit",
                        ["project_id", "name", "current_version", "is_outdated", "source"], rows)
                    cur.close()

                total_deps += len(rows)
                total_outdated += outdated_count
                context.log.info(f"{path}: {len(rows)} deps, {outdated_count} outdated")

            except Exception as e:
                context.log.warning(f"Failed to audit dependencies for {path}: {e}")

        context.log.info(f"Dependency audit complete: {total_deps} total deps, {total_outdated} outdated")
    finally:
        conn.close()


def _get_source(file_name: str) -> str:
    """Get ecosystem source from file name."""
    mapping = {
        "package.json": "npm", "requirements.txt": "pip", "go.mod": "go",
        "Cargo.toml": "cargo", "Gemfile": "bundler", "pom.xml": "maven",
        "build.gradle": "gradle", "build.gradle.kts": "gradle",
        "composer.json": "composer", "pubspec.yaml": "pub",
        "Package.swift": "swift-pm", "Podfile": "cocoapods",
    }
    return mapping.get(file_name, "unknown")


def _normalize_version(v: str) -> str:
    """Normalize version string for comparison."""
    return re.sub(r"^[=<>~^!]+\s*", "", v.lstrip("v")).strip()


def _check_latest_version(name: str, source: str, url_template: str) -> str | None:
    """Check latest version via public API."""
    try:
        url = url_template.replace("{name}", name)
        if (source in ("maven", "gradle")) and ":" in name:
            group, artifact = name.split(":", 1)
            url = url.replace("{group}", group).replace("{artifact}", artifact)

        import urllib.request as req
        _throttle()
        r = req.urlopen(req.Request(url), timeout=5)
        data = json.loads(r.read().decode())

        if source == "npm": return data.get("version")
        if source == "pip": return (data.get("info") or {}).get("version")
        if source == "nuget":
            versions = data.get("versions", [])
            return versions[-1] if versions else None
        if source == "go": return data.get("Version")
        if source in ("maven", "gradle"):
            docs = (data.get("response") or {}).get("docs") or []
            return docs[0].get("latestVersion") if docs else None
    except Exception:
        pass
    return None


# === Contributor aggregation ===

from dagster_project.utils.contributor_match import (
    transliterate_to_latin, normalize_name, email_local_part,
    is_similar_name, is_bot_or_ci, soundex,
)


def _is_bot_or_ci(name, email):
    return is_bot_or_ci(name, email)


def _normalize_name(name):
    return normalize_name(name)


def _email_local_part(email):
    return email_local_part(email)


@asset(deps=["gitlab_contributors"], compute_kind="sync")
def gitlab_contributor_sync(context: AssetExecutionContext) -> None:
    """Auto-detect contributor groups and sync contributor_directory."""
    conn = get_pg_connection()
    try:
        cursor = conn.cursor()
        # Load existing directory — skip verified (is_valid=true) entries
        cursor.execute("SELECT id, display_name, emails, is_valid FROM contributor_directory")
        existing = {}
        verified_ids = set()
        for row in cursor.fetchall():
            existing[row[1]] = {"id": row[0], "display_name": row[1], "emails": row[2] or [], "is_valid": row[3]}
            if row[3]:  # is_valid = true → skip
                verified_ids.add(row[0])

        cursor.execute("""
            SELECT author_email, author_name FROM (
                SELECT author_email, MAX(author_name) as author_name, ROW_NUMBER() OVER (PARTITION BY author_email ORDER BY COUNT(*) DESC) as rn
                FROM commits WHERE author_email IS NOT NULL AND author_email != ''
                GROUP BY author_email
            ) sub WHERE rn = 1
        """)
        all_authors = {row[0]: row[1] for row in cursor.fetchall()}

        cursor.execute("""
            SELECT author_email, author_name FROM (
                SELECT author_email, MAX(author_name) as author_name, ROW_NUMBER() OVER (PARTITION BY author_email ORDER BY COUNT(*) DESC) as rn
                FROM contributor_profiles WHERE author_email IS NOT NULL AND author_email != ''
                GROUP BY author_email
            ) sub WHERE rn = 1
        """)
        for row in cursor.fetchall():
            if row[0] not in all_authors:
                all_authors[row[0]] = row[1]

        cursor.close()
        context.log.info(f"Loaded {len(all_authors)} unique author emails")

        groups = {}
        email_to_group = {}

        # Build map of normalized directory display_names to their canonical key
        # Verified entries take precedence — we never re-assign emails AWAY from them
        dir_norm_to_name = {}
        for dn, dd in existing.items():
            norm = _normalize_name(dn)
            if norm and norm not in dir_norm_to_name:
                dir_norm_to_name[norm] = dn

        # Build inverse map: email (lowercased) -> verified display_name
        # These emails are "locked" to a specific person, never re-assigned
        verified_email_to_name = {}
        for dn, dd in existing.items():
            if dd["is_valid"]:
                for e in (dd["emails"] or []):
                    verified_email_to_name[e.lower()] = dn

        for email, name in all_authors.items():
            if _is_bot_or_ci(name, email):
                continue

            email_lower = email.lower()

            # PRIORITY 1: Verified directory entry — always wins
            if email_lower in verified_email_to_name:
                found_group = verified_email_to_name[email_lower]
            else:
                found_group = None
                local = _email_local_part(email)
                norm_name = _normalize_name(name)

                # PRIORITY 2: Exact normalized name match (transliteration-equivalent)
                # e.g. "Иван Петров" == "ivan petrov" → same person
                if norm_name and norm_name in dir_norm_to_name:
                    dn = dir_norm_to_name[norm_name]
                    if existing[dn]["is_valid"]:
                        found_group = dn
                    else:
                        # Non-verified entry with same name — use as group key
                        found_group = dn

                # PRIORITY 3: Same normalized name within current groups
                if not found_group and norm_name:
                    for ek in groups:
                        for e in groups[ek]:
                            en_norm = _normalize_name(all_authors.get(e, ""))
                            if en_norm and en_norm == norm_name:
                                found_group = ek
                                break
                        if found_group:
                            break

                # NOTE: We intentionally REMOVED soundex, email-local-part, and
                # substring matching. They caused false merges:
                #   - "agorbikov" vs "agriffaut" (different people)
                #   - "vladislav.chugunkin" vs "vladkens" (different people)
                #   - Case variants of same email as separate people
                # If unsure, keep separate. Admin merges via UI if truly same person.

            if found_group:
                if found_group not in groups:
                    groups[found_group] = set()
                groups[found_group].add(email)
                email_to_group[email] = found_group
            else:
                gn = norm_name or local or email
                groups[gn] = {email}
                email_to_group[email] = gn

        merged = True
        while merged:
            merged = False
            keys = list(groups.keys())
            for i in range(len(keys)):
                for j in range(i + 1, len(keys)):
                    k1, k2 = keys[i], keys[j]
                    if k1 not in groups or k2 not in groups:
                        continue
                    if groups[k1] & groups[k2]:
                        groups[k1] |= groups[k2]
                        del groups[k2]
                        for e in groups[k1]:
                            email_to_group[e] = k1
                        merged = True
                        break
                if merged:
                    break

        context.log.info(f"Detected {len(groups)} contributor groups")

        # Also populate emails for existing directory entries that have empty emails
        # Match by name similarity with soundex
        email_populated = 0
        for dir_name, dir_data in existing.items():
            if dir_data["is_valid"]:
                continue  # Skip verified entries — user manages this manually
            if dir_data["emails"] and len(dir_data["emails"]) > 0:
                continue  # Already has emails
            # Find matching emails from all_authors by name similarity
            matching_emails = []
            for email, name in all_authors.items():
                if _is_bot_or_ci(name, email):
                    continue
                if is_similar_name(dir_name, name) or is_similar_name(to_cyrillic_display(dir_name), name):
                    matching_emails.append(email)
            if matching_emails:
                cur = conn.cursor()
                cur.execute("UPDATE contributor_directory SET emails = %s WHERE id = %s", (matching_emails, dir_data["id"]))
                conn.commit()
                cur.close()
                email_populated += 1

        if email_populated > 0:
            context.log.info(f"Populated emails for {email_populated} existing directory entries")

        new_entries, updated_entries = [], []
        for gk, emails in groups.items():
            if len(emails) < 1:
                continue
            nc = {}
            for e in emails:
                n = all_authors.get(e, "")
                if n and not _is_bot_or_ci(n, e):
                    nn = _normalize_name(n)
                    nc[nn] = nc.get(nn, 0) + 1
            raw_dn = max(nc, key=nc.get) if nc else gk
            dn = raw_dn
            if dn in existing:
                if existing[dn]["is_valid"]:
                    continue  # Don't modify verified entries
                existing_emails = set(existing[dn]["emails"])
                new_emails = emails - existing_emails
                if new_emails:
                    updated_entries.append((existing[dn]["id"], dn, list(existing[dn]["emails"]) + list(new_emails)))
            else:
                new_entries.append((dn, sorted(emails)))

        cur = conn.cursor()
        for dn, ems in new_entries:
            cur.execute("INSERT INTO contributor_directory (display_name, emails) VALUES (%s, %s) ON CONFLICT DO NOTHING", (dn, ems))
            context.log.info(f"Created: {dn} → {ems}")
        for eid, dn, ems in updated_entries:
            cur.execute("UPDATE contributor_directory SET emails = %s WHERE id = %s", (ems, eid))
            context.log.info(f"Updated: {dn} → {ems}")
        conn.commit()
        cur.close()

        context.log.info(f"Sync: {len(new_entries)} new, {len(updated_entries)} updated, {len(groups)} groups")
    finally:
        conn.close()
