
  create view "gitlab_scout"."public_staging"."stg_commits__dbt_tmp"
    
    
  as (
    select id, project_id, commit_sha, author_name, author_email,
       committed_date, additions, deletions
from "gitlab_scout"."public"."commits"
  );