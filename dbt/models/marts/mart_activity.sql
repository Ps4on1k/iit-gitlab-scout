-- Per-project daily activity for RBAC filtering
-- Each row = one day per project

with commits_by_day as (
  select
    project_id,
    to_char(committed_date, 'YYYY-MM-DD') as day,
    count(*) as commits
  from {{ ref('stg_commits') }}
  where committed_date >= current_date - interval '90 days'
  group by project_id, to_char(committed_date, 'YYYY-MM-DD')
),

mr_by_day as (
  select
    project_id,
    to_char(created_at, 'YYYY-MM-DD') as day,
    count(*) as merge_requests
  from {{ ref('stg_merge_requests') }}
  where created_at >= current_date - interval '90 days'
  group by project_id, to_char(created_at, 'YYYY-MM-DD')
),

pipelines_by_day as (
  select
    project_id,
    to_char(created_at, 'YYYY-MM-DD') as day,
    count(*) as pipelines
  from {{ ref('stg_pipelines') }}
  where created_at >= current_date - interval '90 days'
  group by project_id, to_char(created_at, 'YYYY-MM-DD')
)

select
  coalesce(c.project_id, mr.project_id, pl.project_id) as project_id,
  coalesce(c.day, mr.day, pl.day) as day,
  coalesce(c.commits, 0) as commits,
  coalesce(mr.merge_requests, 0) as merge_requests,
  coalesce(pl.pipelines, 0) as pipelines
from commits_by_day c
full outer join mr_by_day mr on c.project_id = mr.project_id and c.day = mr.day
full outer join pipelines_by_day pl on coalesce(c.project_id, mr.project_id) = pl.project_id and coalesce(c.day, mr.day) = pl.day
