-- Per-project DORA metrics for RBAC filtering
-- Each row = one project with deploy frequency, lead time, failure rate

with deploy_stats as (
  select
    project_id,
    count(*) as total,
    count(*) filter (where status = 'success') as success,
    count(*) filter (where status = 'failed' or pipeline_status = 'failed') as failed,
    count(*) filter (where status = 'canceled') as canceled
  from {{ ref('stg_deployments') }}
  where created_at >= current_date - interval '90 days'
  group by project_id
),

lead_times as (
  select
    d.project_id,
    avg(extract(epoch from (
      d.created_at - (d.raw_json->'deployable'->'commit'->>'committed_date')::timestamptz
    )))::int as avg_lead_time_sec
  from {{ ref('stg_deployments') }} d
  where d.status = 'success'
    and d.created_at >= current_date - interval '90 days'
    and d.raw_json->'deployable'->'commit'->>'committed_date' is not null
  group by d.project_id
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
  ds.project_id,
  ds.total,
  ds.success,
  ds.failed,
  ds.canceled,
  case when ds.total > 0 then round((ds.failed::numeric / ds.total) * 100, 2) else 0 end as failure_rate,
  case when 91 > 0 then round((ds.total::numeric / 91), 2) else 0 end as deploy_frequency,
  lt.avg_lead_time_sec,
  mt.avg_mttr_min
from deploy_stats ds
left join lead_times lt on lt.project_id = ds.project_id
left join mttr mt on mt.project_id = ds.project_id
