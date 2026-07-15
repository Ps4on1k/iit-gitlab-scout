select id, project_id, gitlab_id, status, ref, source, duration,
       created_at, updated_at, finished_at, user_name
from "gitlab_scout"."public"."project_pipelines"