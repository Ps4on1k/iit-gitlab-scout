-- Per-project executive report for RBAC filtering
-- Each row = one project with comprehensive KPI

with project_commits as (
  select
    p.id as project_id,
    count(c.id) as total_commits,
    count(distinct c.author_email) as total_contributors,
    count(distinct to_char(c.committed_date, 'YYYY-MM-DD')) as active_days,
    max(c.committed_date) as last_commit
  from {{ source('raw', 'projects') }} p
  left join {{ ref('stg_commits') }} c on c.project_id = p.id and c.committed_date >= current_date - interval '90 days'
  group by p.id
),

branch_stats as (
  select
    project_id,
    count(*) as total_branches,
    count(*) filter (where not merged and last_commit_date >= current_date - interval '90 days') as active_branches,
    count(*) filter (where not merged and (last_commit_date < current_date - interval '90 days' or last_commit_date is null)) as stale_branches
  from {{ ref('stg_branches') }}
  group by project_id
),

mr_stats as (
  select
    project_id,
    count(*) as mr_total,
    count(*) filter (where state = 'merged') as mr_merged,
    count(*) filter (where state = 'opened') as mr_opened
  from {{ ref('stg_merge_requests') }}
  where created_at >= current_date - interval '90 days'
  group by project_id
),

deploy_stats as (
  select
    project_id,
    count(*) as deploy_total,
    count(*) filter (where status = 'success') as deploy_success,
    count(*) filter (where status = 'failed') as deploy_failed,
    case when count(*) > 0 then round((count(*) filter (where status = 'failed')::numeric / count(*)) * 100, 2) else 0 end as failure_rate
  from {{ ref('stg_deployments') }}
  where created_at >= current_date - interval '90 days'
  group by project_id
),

lead_time as (
  select
    project_id,
    avg(extract(epoch from (
      d.created_at - (d.raw_json->'deployable'->'commit'->>'committed_date')::timestamptz
    )))::int as avg_lead_time_sec
  from {{ ref('stg_deployments') }} d
  where d.status = 'success'
    and d.created_at >= current_date - interval '90 days'
    and d.raw_json->'deployable'->'commit'->>'committed_date' is not null
  group by project_id
),

mttr as (
  with ordered as (
    select project_id, created_at, status,
           lag(created_at) over (partition by project_id order by created_at) as prev_created,
           lag(status) over (partition by project_id order by created_at) as prev_status
    from {{ ref('stg_deployments') }}
    where created_at >= current_date - interval '90 days'
  )
  select project_id, avg(extract(epoch from (created_at - prev_created)) / 60)::int as avg_mttr_min
  from ordered
  where prev_status = 'failed' and status = 'success'
    and extract(epoch from (created_at - prev_created)) / 60 between 0 and 1440
  group by project_id
)

select
  pc.project_id,
  case when pc.total_commits > 0 then 1 else 0 end as is_active,
  pc.total_contributors,
  pc.total_commits,
  pc.active_days,
  coalesce(bs.total_branches, 0) as total_branches,
  coalesce(bs.active_branches, 0) as active_branches,
  coalesce(bs.stale_branches, 0) as stale_branches,
  coalesce(ms.mr_total, 0) as mr_total,
  coalesce(ms.mr_merged, 0) as mr_merged,
  coalesce(ms.mr_opened, 0) as mr_opened,
  coalesce(ds.deploy_total, 0) as deploy_total,
  coalesce(ds.deploy_success, 0) as deploy_success,
  coalesce(ds.deploy_failed, 0) as deploy_failed,
  ds.failure_rate,
  case when 90 > 0 then round((coalesce(ds.deploy_total, 0)::numeric / 90), 2) else 0 end as deploy_frequency,
  lt.avg_lead_time_sec,
  mt.avg_mttr_min
from project_commits pc
left join branch_stats bs on bs.project_id = pc.project_id
left join mr_stats ms on ms.project_id = pc.project_id
left join deploy_stats ds on ds.project_id = pc.project_id
left join lead_time lt on lt.project_id = pc.project_id
left join mttr mt on mt.project_id = pc.project_id
