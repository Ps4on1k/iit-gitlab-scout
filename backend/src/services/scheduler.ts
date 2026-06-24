import { getPool } from "../db/pool.js";
import { collectStack } from "./stack-collector.js";
import { collectActivity } from "./activity-collector.js";
import { collectProject } from "./contributor-collector.js";
import { collectBranches } from "./branch-collector.js";
import { collectMergeRequests } from "./mr-collector.js";
import { collectPipelines } from "./pipeline-collector.js";

interface SchedulerTask {
  id: number;
  task_name: string;
  enabled: boolean;
  interval_minutes: number;
  last_run_at: string | null;
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let logFn: (...args: any[]) => void = console.log;

async function runTask(taskName: string): Promise<void> {
  const pool = getPool();

  const projectsResult = await pool.query("SELECT id FROM projects");
  const projectIds: number[] = projectsResult.rows.map((r: any) => r.id);

  if (projectIds.length === 0) {
    logFn(`[scheduler] ${taskName}: no projects, skipping`);
    return;
  }

  logFn(`[scheduler] ${taskName}: processing ${projectIds.length} projects`);

  for (const projectId of projectIds) {
    try {
      switch (taskName) {
        case "collect_stack":
          await collectStack(projectId);
          break;
        case "collect_activity":
          await collectActivity(projectId);
          break;
        case "collect_contributors":
          await collectProject(projectId);
          break;
        case "collect_branches":
          await collectBranches(projectId);
          break;
        case "collect_merge_requests":
          await collectMergeRequests(projectId);
          break;
        case "collect_pipelines":
          await collectPipelines(projectId);
          break;
      }
      logFn(`[scheduler] ${taskName}: project ${projectId} done`);
    } catch (err) {
      logFn(`[scheduler] ${taskName}: project ${projectId} error: ${err instanceof Error ? err.message : err}`);
    }
  }

  await pool.query(
    "UPDATE scheduler_settings SET last_run_at = now() WHERE task_name = $1",
    [taskName]
  );
  logFn(`[scheduler] ${taskName}: last_run_at updated`);
}

async function checkAndRun(): Promise<void> {
  const pool = getPool();

  let result;
  try {
    result = await pool.query("SELECT * FROM scheduler_settings WHERE enabled = true");
  } catch {
    return;
  }

  const now = Date.now();

  for (const task of result.rows as SchedulerTask[]) {
    if (!task.last_run_at) {
      logFn(`[scheduler] Running ${task.task_name} (first run)`);
      await runTask(task.task_name);
      continue;
    }

    const lastRun = new Date(task.last_run_at).getTime();
    const elapsed = (now - lastRun) / 1000 / 60;

    if (elapsed >= task.interval_minutes) {
      logFn(`[scheduler] Running ${task.task_name} (elapsed: ${Math.round(elapsed)} min, interval: ${task.interval_minutes} min)`);
      await runTask(task.task_name);
    }
  }
}

export function startScheduler(appLog?: (...args: any[]) => void): void {
  if (appLog) logFn = appLog;
  logFn("[scheduler] Starting scheduler (check every 60s)");
  intervalId = setInterval(checkAndRun, 60 * 1000);
  // Run once immediately on startup
  checkAndRun().catch((err) => logFn("[scheduler] Initial run error:", err));
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logFn("[scheduler] Scheduler stopped");
  }
}
