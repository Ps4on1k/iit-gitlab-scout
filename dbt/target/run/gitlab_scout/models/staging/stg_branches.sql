
  create view "gitlab_scout"."public_staging"."stg_branches__dbt_tmp"
    
    
  as (
    select id, project_id, name, merged, protected, "default",
       last_commit_date, last_commit_author, last_commit_additions, last_commit_deletions
from "gitlab_scout"."public"."project_branches"
  );