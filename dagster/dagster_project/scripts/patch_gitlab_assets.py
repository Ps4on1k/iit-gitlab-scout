#!/usr/bin/env python3
"""Patch dagster assets to include gitlab_user_id in commits, MRs, pipelines"""
import re

path = "dagster/dagster_project/assets/gitlab_assets.py"
with open(path) as f:
    content = f.read()

# 01. Add resolve helper after imports
resolver = '''

def resolve_user_id_by_email(email, token, base_url):
    if not email or "@" not in email:
        return None
    try:
        users = git lab_request(f"/users?search={urllib.parse.quote(email)}", token, base_url)
        if isinstance(users, list) and len(users) > 0:
            for u in users:
                if u.get("email", "").lower() == email.lower():
                    return u["id"]
    except Exception:
        pass
    return None
'''

if "resolve_user_id_by_email" not in content:
    content = content.replace("import urllib.parse", f"import urllib.parse{resolver}")

# 02. Patch commits insert
commits_pattern = r'''rows\.append\(\s*proj_id,\s*c\.get\(.*?\)\s*,\s*(['"][^'"]*),\s*"all"\s*,\s*\)\)'''
commits_replacement = '''rows.append((
    proj_id, c.get("id", ""), c.get("author_name", ""),
    c.get("author_email", ""),
    c.get("committed_date"), c.get("stats", {}).get("additions", 0),
    c.get("stats", {}).get("deletions", 0),
    c.get("stats", {}).get("additions", 0) + c.get("stats", {}).get("deletions", 0),
    "all",
    resolve_user_id_by_email(c.get("author_email", ""), token, base_url)
))'''
content = re.sub(commits_pattern, commits_replacement, content, flags=re.DOTALL)

# 03. Add gitlab_user_id to batch_insert columns
old_cols = '''["project_id", "commit_sha", "author_name", "author_email",
                         "committed_date", "additions", "deletions", "total_changes", "branch"], rows,'''
new_cols = '''["project_id", "commit_sha", "author_name", "author_email",
                         "committed_date", "additions", "deletions", "total_changes", "branch", "gitlab_user_id"], rows,
                        update_columns=["gitlab_user_id"],'''
if old_cols in content and new_cols not in content:
    content = content.replace(old_cols, new_cols)

with open(path, "w") as f:
    f.write(content)

print("patched")
