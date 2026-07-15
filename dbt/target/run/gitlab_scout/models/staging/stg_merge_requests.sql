
  create view "gitlab_scout"."public_staging"."stg_merge_requests__dbt_tmp"
    
    
  as (
    select id, project_id, gitlab_iid, title, state, author_name, author_email,
       source_branch, target_branch, created_at, updated_at, merged_at, closed_at,
       merged_by, reviewers, approvals, changes_count, comments_count
from "gitlab_scout"."public"."project_merge_requests"
  );