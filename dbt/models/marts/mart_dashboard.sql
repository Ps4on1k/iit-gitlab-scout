-- Per-project dashboard metrics for RBAC filtering
-- Each row = one project with aggregated KPI for last 90 days

select
  p.id as project_id,
  p.label,
  p.tags,
  coalesce(commits_by_project.total_commits, 0) as commits,
  coalesce(commits_by_project.contributors, 0) as contributors,
  commits_by_project.last_commit,
  coalesce(bs.total_branches, 0) as total_branches,
  coalesce(bs.active_branches, 0) as active_branches,
  coalesce(bs.stale_branches, 0) as stale_branches,
  coalesce(ms.mr_total, 0) as mr_total,
  coalesce(ms.mr_merged, 0) as mr_merged,
  coalesce(ms.mr_opened, 0) as mr_opened,
  coalesce(ds.deploy_total, 0) as deploy_total,
  coalesce(ds.deploy_success, 0) as deploy_success,
  coalesce(ds.deploy_failed, 0) as deploy_failed,
  coalesce(ps.pipeline_total, 0) as pipeline_total,
  coalesce(ps.pipeline_success, 0) as pipeline_success,
  coalesce(ps.pipeline_failed, 0) as pipeline_failed
from {{ source('raw', 'projects') }} p

left join (
  select project_id,
         count(*) as total_commits,
         count(distinct author_email) as contributors,
         max(committed_date) as last_commit
  from {{ ref('stg_commits') }}
  where committed_date >= current_date - interval '90 days'
  group by project_id
) commits_by_project on commits_by_project.project_id = p.id

left join (
  select project_id,
         count(*) as total_branches,
         count(*) filter (where not merged and last_commit_date >= current_date - interval '90 days') as active_branches,
         count(*) filter (where not merged and (last_commit_date < current_date - interval '90 days' or last_commit_date is null)) as stale_branches
  from {{ ref('stg_branches') }}
  group by project_id
) bs on bs.project_id = p.id

left join (
  select project_id,
         count(*) as mr_total,
         count(*) filter (where state = 'merged') as mr_merged,
         count(*) filter (where state = 'opened') as mr_opened
  from {{ ref('stg_merge_requests') }}
  where created_at >= current_date - interval '90 days'
  group by project_id
) ms on ms.project_id = p.id

left join (
  select project_id,
         count(*) as deploy_total,
         count(*) filter (where status = 'success') as deploy_success,
         count(*) filter (where status = 'failed') as deploy_failed
  from {{ ref('stg_deployments') }}
  where created_at >= current_date - interval '90 days'
  group by project_id
) ds on ds.project_id = p.id

left join (
  select project_id,
         count(*) as pipeline_total,
         count(*) filter (where status = 'success') as pipeline_success,
         count(*) filter (where status = 'failed') as pipeline_failed
  from {{ ref('stg_pipelines') }}
  where created_at >= current_date - interval '90 days'
  group by project_id
) ps on ps.project_id = p.id
