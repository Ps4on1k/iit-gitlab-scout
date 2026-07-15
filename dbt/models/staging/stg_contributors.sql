select id, project_id, author_email, author_name, total_commits,
       total_additions, total_deletions, frequency, first_commit_date, last_commit_date
from {{ source('raw', 'contributor_profiles') }}
