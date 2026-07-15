-- Materialized view for executive report
-- Combines all key metrics into a single pre-computed view

with project_stats as (
  select
    count(*) as total_projects,
    count(*) filter (where exists (
      select 1 from "gitlab_scout"."public_staging"."stg_commits" c
      where c.project_id = p.id and c.committed_date >= current_date - interval '90 days'
    )) as active_projects
  from "gitlab_scout"."public"."projects" p
),

contributor_stats as (
  select
    count(distinct author_email) as total_contributors,
    count(*) as total_commits,
    count(distinct to_char(committed_date, 'YYYY-MM-DD')) as active_days
  from "gitlab_scout"."public_staging"."stg_commits"
  where committed_date >= current_date - interval '90 days'
),

branch_stats as (
  select
    count(*) as total_branches,
    count(*) filter (where not merged and last_commit_date >= current_date - interval '90 days') as active_branches,
    count(*) filter (where not merged and (last_commit_date < current_date - interval '90 days' or last_commit_date is null)) as stale_branches
  from "gitlab_scout"."public_staging"."stg_branches"
),

mr_stats as (
  select
    count(*) as mr_total,
    count(*) filter (where state = 'merged') as mr_merged,
    count(*) filter (where state = 'opened') as mr_opened
  from "gitlab_scout"."public_staging"."stg_merge_requests"
  where created_at >= current_date - interval '90 days'
),

deploy_stats as (
  select
    count(*) as deploy_total,
    count(*) filter (where status = 'success') as deploy_success,
    count(*) filter (where status = 'failed') as deploy_failed,
    case when count(*) > 0 then round((count(*) filter (where status = 'failed')::numeric / count(*)) * 100, 2) else 0 end as failure_rate,
    91 as deploy_days_count
  from "gitlab_scout"."public_staging"."stg_deployments"
  where created_at >= current_date - interval '90 days'
),

lead_time as (
  select avg(extract(epoch from (
    d.created_at - (d.raw_json->'deployable'->'commit'->>'committed_date')::timestamptz
  )))::int as avg_lead_time_sec
  from "gitlab_scout"."public_staging"."stg_deployments" d
  where d.status = 'success'
    and d.created_at >= current_date - interval '90 days'
    and d.raw_json->'deployable'->'commit'->>'committed_date' is not null
),

mttr as (
  with ordered as (
    select created_at, status,
           lag(created_at) over (order by created_at) as prev_created,
           lag(status) over (order by created_at) as prev_status
    from "gitlab_scout"."public_staging"."stg_deployments"
    where created_at >= current_date - interval '90 days'
  )
  select avg(extract(epoch from (created_at - prev_created)) / 60)::int as avg_mttr_min
  from ordered
  where prev_status = 'failed' and status = 'success'
    and extract(epoch from (created_at - prev_created)) / 60 between 0 and 1440
)

select
  ps.total_projects,
  ps.active_projects,
  cs.total_contributors,
  cs.total_commits,
  cs.active_days,
  bs.total_branches,
  bs.active_branches,
  bs.stale_branches,
  ms.mr_total,
  ms.mr_merged,
  ms.mr_opened,
  ds.deploy_total,
  ds.deploy_success,
  ds.deploy_failed,
  ds.failure_rate,
  case when ds.deploy_days_count > 0 then round((ds.deploy_total::numeric / ds.deploy_days_count), 2) else 0 end as deploy_frequency,
  lt.avg_lead_time_sec,
  mt.avg_mttr_min
from project_stats ps, contributor_stats cs, branch_stats bs, mr_stats ms, deploy_stats ds, lead_time lt, mttr mt