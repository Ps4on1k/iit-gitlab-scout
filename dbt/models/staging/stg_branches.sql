select id, project_id, name, merged, protected, "default",
       last_commit_date, last_commit_author, last_commit_additions, last_commit_deletions
from {{ source('raw', 'project_branches') }}
