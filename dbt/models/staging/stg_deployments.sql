select id, project_id, gitlab_id, status, environment, pipeline_status,
       created_at, finished_at, raw_json
from {{ source('raw', 'project_deployments') }}
