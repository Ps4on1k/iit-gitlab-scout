
  create view "gitlab_scout"."public_staging"."stg_deployments__dbt_tmp"
    
    
  as (
    select id, project_id, gitlab_deployment_id, status, environment, pipeline_status,
       created_at, finished_at, raw_json
from "gitlab_scout"."public"."project_deployments"
  );