select id, project_id, sha, author_name, author_email, message,
       committed_date, additions, deletions
from {{ source('raw', 'commits') }}
