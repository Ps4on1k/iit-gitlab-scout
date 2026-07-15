from dagster import asset, AssetExecutionContext
from dagster_project.utils.helpers import get_pg_connection, gitlab_request_paginated, gitlab_request, batch_insert
import urllib.parse


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

                encoded_path = urllib.parse.quote(path, safe='')
                commits = gitlab_request_paginated(
                    f"/projects/{encoded_path}/repository/commits",
                    token, base_url,
                    {"per_page": "100", "order_by": "committed_date", "sort": "desc"}
                )

                rows = []
                for c in commits:
                    rows.append((
                        proj_id, c.get("id", ""), c.get("author_name", ""),
                        c.get("author_email", ""),
                        c.get("committed_date"), c.get("stats", {}).get("additions", 0),
                        c.get("stats", {}).get("deletions", 0),
                        c.get("stats", {}).get("additions", 0) + c.get("stats", {}).get("deletions", 0),
                        ""
                    ))

                if rows:
                    batch_insert(conn, "commits",
                        ["project_id", "commit_sha", "author_name", "author_email",
                         "committed_date", "additions", "deletions", "total_changes", "branch"], rows)
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
                    f"/projects/{urllib.parse.quote(path, safe='')}/merge_requests",
                    token, base_url,
                    {"state": "all", "per_page": "100", "order_by": "created_at", "sort": "desc"}
                )

                rows = []
                for mr in mrs:
                    reviewers_list = [r.get("user", {}).get("username", "") for r in mr.get("reviewers", []) if r.get("user")]
                    rows.append((
                        proj_id, mr.get("iid"), mr.get("title", ""),
                        mr.get("state", ""), mr.get("author", {}).get("name", ""),
                        mr.get("author", {}).get("email", ""),
                        mr.get("source_branch", ""), mr.get("target_branch", ""),
                        mr.get("created_at"), mr.get("updated_at"),
                        mr.get("merged_at"), mr.get("closed_at"),
                        mr.get("merged_by", {}).get("username", "") if mr.get("merged_by") else "",
                        reviewers_list,
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
                    f"/projects/{urllib.parse.quote(path, safe='')}/pipelines",
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


def get_projects(cursor):
    """Fetch all projects from database."""
    cursor.execute("SELECT id, path, token_encrypted, base_url FROM projects")
    return cursor.fetchall()


def get_token(project_token_encrypted, client_token):
    """Decrypt project token or fall back to client token."""
    token = decrypt(project_token_encrypted) if project_token_encrypted else client_token
    return token if token else None


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
                token = get_token(token_encrypted, client["token"])
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
                    lc = b.get("last_commit", {})
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
                         "last_commit_additions", "last_commit_deletions"], rows)
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
        for proj_id, path, token_encrypted, base_url in projects:
            try:
                token = get_token(token_encrypted, client["token"])
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

                context.log.info(f"Collected languages from {path}")
            except Exception as e:
                context.log.warning(f"Failed to collect languages from {path}: {e}")

        context.log.info(f"Total language entries collected: {total}")
    finally:
        conn.close()


@asset(deps=["gitlab_commits"], compute_kind="aggregate")
def gitlab_contributors(context: AssetExecutionContext) -> None:
    """Aggregate contributor profiles from commits."""
    conn = get_pg_connection()

    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO contributor_profiles
                (project_id, author_email, author_name, total_commits,
                 total_additions, total_deletions, total_changes,
                 first_commit_date, last_commit_date, frequency)
            SELECT
                project_id, author_email,
                MAX(author_name) as author_name,
                COUNT(*) as total_commits,
                SUM(additions) as total_additions,
                SUM(deletions) as total_deletions,
                SUM(additions + deletions) as total_changes,
                MIN(committed_date) as first_commit_date,
                MAX(committed_date) as last_commit_date,
                '{}'::jsonb as frequency
            FROM commits
            WHERE committed_date >= NOW() - INTERVAL '90 days'
            GROUP BY project_id, author_email
            ON CONFLICT (project_id, author_email) DO UPDATE SET
                author_name = EXCLUDED.author_name,
                total_commits = EXCLUDED.total_commits,
                total_additions = EXCLUDED.total_additions,
                total_deletions = EXCLUDED.total_deletions,
                total_changes = EXCLUDED.total_changes,
                first_commit_date = EXCLUDED.first_commit_date,
                last_commit_date = EXCLUDED.last_commit_date
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
                COALESCE(c.project_id, mr.project_id, p.project_id) as project_id,
                COALESCE(c.date, mr.date, p.date) as date,
                COALESCE(c.commits, 0) as commits,
                COALESCE(mr.merge_requests, 0) as merge_requests,
                COALESCE(p.pipelines, 0) as pipelines
            FROM commit_activity c
            FULL OUTER JOIN mr_activity mr ON c.project_id = mr.project_id AND c.date = mr.date
            FULL OUTER JOIN pipeline_activity p ON COALESCE(c.project_id, mr.project_id) = p.project_id
                AND COALESCE(c.date, mr.date) = p.date
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
    }

    try:
        cursor = conn.cursor()
        projects = get_projects(cursor)
        cursor.close()

        total = 0
        for proj_id, path, token_encrypted, base_url in projects:
            try:
                token = get_token(token_encrypted, client["token"])
                if not token:
                    continue

                encoded_path = urllib.parse.quote(path, safe='')
                files = gitlab_request_paginated(
                    f"/projects/{encoded_path}/repository/tree",
                    token, base_url,
                    {"recursive": "true", "per_page": "100"}
                )

                dep_files = [f for f in files if f.get("type") == "blob" and f.get("name", "") in DEPENDENCY_FILES]

                rows = []
                for f in dep_files:
                    file_name = f["name"]
                    source = DEPENDENCY_FILES[file_name]

                    try:
                        raw_content = gitlab_request(
                            f"/projects/{encoded_path}/repository/files/{urllib.parse.quote(file_name, safe='')}/raw",
                            token, base_url,
                            {"ref": "HEAD"}
                        )

                        if isinstance(raw_content, str):
                            deps = parse_dependency_file(file_name, raw_content)
                            for name, version in deps:
                                rows.append((proj_id, name, version, False, source))
                    except Exception:
                        pass

                if rows:
                    cursor = conn.cursor()
                    cursor.execute("DELETE FROM project_dependencies_audit WHERE project_id = %s", (proj_id,))
                    conn.commit()
                    cursor.close()

                    batch_insert(conn, "project_dependencies_audit",
                        ["project_id", "name", "current_version", "is_outdated", "source"], rows)
                    total += len(rows)

                context.log.info(f"Collected {len(rows)} dependencies from {path}")
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

    except Exception:
        pass

    return deps
