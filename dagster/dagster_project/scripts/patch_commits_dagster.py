#!/usr/bin/env python3
"""Patch gitlab_commits Dagster asset to resolve contributor -> gitlab_user_id"""

path = "dagster/dagster_project/assets/gitlab_assets.py"
with open(path) as f:
    content = f.read()

# 1. Add helper function after imports
helper = '''

def resolve_user_id_by_email(email, token, base_url):
    """Resolve GitLab user ID by email via /users?search="""
    if not email or "@" not in email:
        return None
    try:
        users = gitlab_request(f"/users?search={urllib.parse.quote(email)}", token, base_url)
        if isinstance(users, list) and len(users) > 0:
            for u in users:
                if u.get("email", "").lower() == email.lower():
                    return u.get("id")
    except Exception:
        pass
    return None
'''

if "def resolve_user_id_by_email" not in content:
    # Insert after "import urllib.parse" line
    content = content.replace("import urllib.parse", "import urllib.parse" + helper, 1)

# 2. Patch the for-loop in gitlab_commits to resolve user_id
old_loop = '''                rows = []
                for c in commits:
                    rows.append((
                        proj_id, c.get("id", ""), c.get("author_name", ""),
                        c.get("author_email", ""),
                        c.get("committed_date"), c.get("stats", {}).get("additions", 0),
                        c.get("stats", {}).get("deletions", 0),
                        c.get("stats", {}).get("additions", 0) + c.get("stats", {}).get("deletions", 0),
                        "all"
                    ))'''
new_loop = '''                rows = []
                email_to_uid = {}
                seen = set()
                for c in commits:
                    email = c.get("author_email", "")
                    if email and email not in seen and "@" in email:
                        seen.add(email)
                        email_to_uid[email] = resolve_user_id_by_email(email, token, base_url)

                for c in commits:
                    rows.append((
                        proj_id, c.get("id", ""), c.get("author_name", ""),
                        c.get("author_email", ""),
                        c.get("committed_date"), c.get("stats", {}).get("additions", 0),
                        c.get("stats", {}).get("deletions", 0),
                        c.get("stats", {}).get("additions", 0) + c.get("stats", {}).get("deletions", 0),
                        "all",
                        email_to_uid.get(c.get("author_email", "")) if c.get("author_email") else None
                    ))'''

if old_loop in content:
    content = content.replace(old_loop, new_loop)
    print("patched commits loop")
else:
    print("WARN: commits loop not found")

# 3. Update batch_insert columns for commits
old_insert = '''batch_insert(conn, "commits",
                        ["project_id", "commit_sha", "author_name", "author_email",
                         "committed_date", "additions", "deletions", "total_changes", "branch"], rows,
                        conflict_columns=["project_id", "commit_sha"])'''
new_insert = '''batch_insert(conn, "commits",
                        ["project_id", "commit_sha", "author_name", "author_email",
                         "committed_date", "additions", "deletions", "total_changes", "branch", "gitlab_user_id"], rows,
                        conflict_columns=["project_id", "commit_sha"],
                        update_columns=["gitlab_user_id"])'''
if old_insert in content:
    content = content.replace(old_insert, new_insert)
    print("patched batch_insert columns")
else:
    print("WARN: batch_insert not found")

with open(path, "w") as f:
    f.write(content)

print("Done")
