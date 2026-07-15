-- Materialized view for DORA metrics
-- Pre-computes deploy frequency, lead time, MTTR, failure rate

with deploy_stats as (
  select
    count(*) as total,
    count(*) filter (where status = 'success') as success,
    count(*) filter (where status = 'failed' or pipeline_status = 'failed') as failed,
    count(*) filter (where status = 'canceled') as canceled
  from "gitlab_scout"."public_staging"."stg_deployments"
  where created_at >= current_date - interval '90 days'
),

lead_times as (
  select
    avg(extract(epoch from (
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
),

deploy_days as (
  select
    greatest(1, 90 + 1) as days
)

select
  ds.total,
  ds.success,
  ds.failed,
  ds.canceled,
  case when ds.total > 0 then round((ds.failed::numeric / ds.total) * 100, 2) else 0 end as failure_rate,
  case when dd.days > 0 then round((ds.total::numeric / dd.days), 2) else 0 end as deploy_frequency,
  lt.avg_lead_time_sec,
  mt.avg_mttr_min
from deploy_stats ds, deploy_days dd, lead_times lt, mttr mt