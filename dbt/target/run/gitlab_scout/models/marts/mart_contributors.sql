
        
    create materialized view if not exists "gitlab_scout"."public_marts"."mart_contributors" as -- Materialized view for contributor metrics
-- Pre-computes per-contributor statistics

with contributor_stats as (
  select
    c.author_email,
    max(c.author_name) as author_name,
    count(*) as total_commits,
    sum(c.additions + c.deletions) as total_changes,
    sum(c.additions) as total_additions,
    sum(c.deletions) as total_deletions,
    count(distinct to_char(c.committed_date, 'YYYY-MM-DD')) as active_days,
    max(c.committed_date) as last_commit,
    min(c.committed_date) as first_commit
  from "gitlab_scout"."public_staging"."stg_commits" c
  where c.committed_date >= current_date - interval '90 days'
  group by c.author_email
)

select
  author_email,
  author_name,
  total_commits,
  total_changes,
  total_additions,
  total_deletions,
  active_days,
  last_commit,
  first_commit,
  case when active_days > 0 then round(total_commits::numeric / active_days, 2) else 0 end as commits_per_day,
  case when active_days > 0 then round(total_changes::numeric / active_days, 2) else 0 end as changes_per_day,
  case when total_commits > 0 then round(total_changes::numeric / total_commits, 2) else 0 end as avg_changes_per_commit
from contributor_stats
order by total_changes desc;

    
    