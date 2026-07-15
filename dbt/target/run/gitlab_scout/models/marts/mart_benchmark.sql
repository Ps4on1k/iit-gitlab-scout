
        
    create materialized view if not exists "gitlab_scout"."public_marts"."mart_benchmark" as -- Materialized view for benchmark data
-- Pre-computes per-tag metrics for comparison

with tag_projects as (
  select
    unnest(tags) as tag,
    id as project_id,
    label
  from "gitlab_scout"."public"."projects"
  where tags is not null and array_length(tags, 1) > 0
),

tag_commits as (
  select
    tp.tag,
    count(c.id) as total_commits,
    count(distinct c.author_email) as contributors,
    count(distinct to_char(c.committed_date, 'YYYY-MM-DD')) as active_days
  from tag_projects tp
  join "gitlab_scout"."public_staging"."stg_commits" c on c.project_id = tp.project_id
  where c.committed_date >= current_date - interval '90 days'
  group by tp.tag
),

tag_deploys as (
  select
    tp.tag,
    count(d.id) as total_deploys,
    count(*) filter (where d.status = 'success') as success_deploys,
    count(*) filter (where d.status = 'failed') as failed_deploys
  from tag_projects tp
  join "gitlab_scout"."public_staging"."stg_deployments" d on d.project_id = tp.project_id
  where d.created_at >= current_date - interval '90 days'
  group by tp.tag
),

tag_pipelines as (
  select
    tp.tag,
    count(p.id) as total_pipelines,
    count(*) filter (where p.status = 'success') as success_pipelines
  from tag_projects tp
  join "gitlab_scout"."public_staging"."stg_pipelines" p on p.project_id = tp.project_id
  where p.created_at >= current_date - interval '90 days'
  group by tp.tag
),

tag_mr as (
  select
    tp.tag,
    count(mr.id) as total_mr,
    count(*) filter (where mr.state = 'merged') as merged_mr
  from tag_projects tp
  join "gitlab_scout"."public_staging"."stg_merge_requests" mr on mr.project_id = tp.project_id
  where mr.created_at >= current_date - interval '90 days'
  group by tp.tag
),

tag_project_count as (
  select tag, count(*) as project_count
  from tag_projects
  group by tag
)

select
  tc.tag,
  tc.project_count,
  coalesce(tcom.total_commits, 0) as total_commits,
  coalesce(tcom.contributors, 0) as contributors,
  coalesce(tcom.active_days, 0) as active_days,
  coalesce(td.total_deploys, 0) as total_deploys,
  coalesce(td.success_deploys, 0) as success_deploys,
  coalesce(td.failed_deploys, 0) as failed_deploys,
  case when td.total_deploys > 0 then round((td.failed_deploys::numeric / td.total_deploys) * 100, 2) else 0 end as failure_rate,
  coalesce(tp.total_pipelines, 0) as total_pipelines,
  case when tp.total_pipelines > 0 then round((tp.success_pipelines::numeric / tp.total_pipelines) * 100) else 0 end as pipeline_success_rate,
  coalesce(tmr.total_mr, 0) as total_mr,
  coalesce(tmr.merged_mr, 0) as merged_mr,
  case when tmr.total_mr > 0 then round((tmr.merged_mr::numeric / tmr.total_mr) * 100) else 0 end as merge_rate
from tag_project_count tc
left join tag_commits tcom on tc.tag = tcom.tag
left join tag_deploys td on tc.tag = td.tag
left join tag_pipelines tp on tc.tag = tp.tag
left join tag_mr tmr on tc.tag = tmr.tag
order by tc.project_count desc;

    
    