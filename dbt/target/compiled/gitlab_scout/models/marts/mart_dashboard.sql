-- Materialized view for main dashboard
-- Replaces 9 sequential queries in dashboard.ts with a single pre-computed view

with project_stats as (
  select
    p.id as project_id,
    p.label,
    p.tags,
    count(c.id) as commits,
    count(distinct c.author_email) as contributors,
    max(c.committed_date) as last_commit
  from "gitlab_scout"."public_staging"."stg_commits" c
  join "gitlab_scout"."public"."projects" p on p.id = c.project_id
  group by p.id, p.label, p.tags
),

branch_stats as (
  select
    count(*) as total_branches,
    count(*) filter (where not merged and last_commit_date >= current_date - interval '90 days') as active_branches,
    count(*) filter (where not merged and (last_commit_date < current_date - interval '90 days' or last_commit_date is null)) as stale_branches,
    count(*) filter (where merged) as merged_branches
  from "gitlab_scout"."public_staging"."stg_branches"
),

mr_stats as (
  select
    count(*) as total_mr,
    count(*) filter (where state = 'merged') as merged_mr,
    count(*) filter (where state = 'opened') as opened_mr,
    count(*) filter (where state = 'closed') as closed_mr
  from "gitlab_scout"."public_staging"."stg_merge_requests"
  where created_at >= current_date - interval '90 days'
),

deploy_stats as (
  select
    count(*) as total_deploys,
    count(*) filter (where status = 'success') as success_deploys,
    count(*) filter (where status = 'failed') as failed_deploys
  from "gitlab_scout"."public_staging"."stg_deployments"
  where created_at >= current_date - interval '90 days'
),

pipeline_stats as (
  select
    count(*) as total_pipelines,
    count(*) filter (where status = 'success') as success_pipelines,
    count(*) filter (where status = 'failed') as failed_pipelines,
    avg(duration) filter (where status = 'success' and duration is not null) as avg_duration
  from "gitlab_scout"."public_staging"."stg_pipelines"
  where created_at >= current_date - interval '90 days'
),

summary as (
  select
    (select count(*) from project_stats) as total_projects,
    (select count(distinct author_email) from "gitlab_scout"."public_staging"."stg_commits" where committed_date >= current_date - interval '90 days') as total_contributors,
    (select sum(commits) from project_stats) as total_commits,
    (select count(distinct committed_date) from "gitlab_scout"."public_staging"."stg_commits" where committed_date >= current_date - interval '90 days') as active_days,
    (select total_branches from branch_stats) as total_branches,
    (select active_branches from branch_stats) as active_branches,
    (select stale_branches from branch_stats) as stale_branches,
    (select merged_branches from branch_stats) as merged_branches,
    (select total_mr from mr_stats) as mr_total,
    (select merged_mr from mr_stats) as mr_merged,
    (select opened_mr from mr_stats) as mr_opened,
    (select closed_mr from mr_stats) as mr_closed,
    (select total_deploys from deploy_stats) as deploy_total,
    (select success_deploys from deploy_stats) as deploy_success,
    (select failed_deploys from deploy_stats) as deploy_failed,
    (select total_pipelines from pipeline_stats) as pipeline_total,
    (select success_pipelines from pipeline_stats) as pipeline_success,
    (select failed_pipelines from pipeline_stats) as pipeline_failed
)

select * from summary