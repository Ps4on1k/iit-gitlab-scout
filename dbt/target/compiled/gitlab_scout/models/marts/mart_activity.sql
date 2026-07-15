-- Materialized view for activity data
-- Pre-computes daily activity aggregation

with commits_by_day as (
  select
    to_char(committed_date, 'YYYY-MM-DD') as day,
    count(*) as commits
  from "gitlab_scout"."public_staging"."stg_commits"
  where committed_date >= current_date - interval '90 days'
  group by 1
),

mr_by_day as (
  select
    to_char(created_at, 'YYYY-MM-DD') as day,
    count(*) as merge_requests
  from "gitlab_scout"."public_staging"."stg_merge_requests"
  where created_at >= current_date - interval '90 days'
  group by 1
),

pipelines_by_day as (
  select
    to_char(created_at, 'YYYY-MM-DD') as day,
    count(*) as pipelines
  from "gitlab_scout"."public_staging"."stg_pipelines"
  where created_at >= current_date - interval '90 days'
  group by 1
)

select
  coalesce(c.day, mr.day, pl.day) as day,
  coalesce(c.commits, 0) as commits,
  coalesce(mr.merge_requests, 0) as merge_requests,
  coalesce(pl.pipelines, 0) as pipelines
from commits_by_day c
full outer join mr_by_day mr on c.day = mr.day
full outer join pipelines_by_day pl on coalesce(c.day, mr.day) = pl.day
order by 1