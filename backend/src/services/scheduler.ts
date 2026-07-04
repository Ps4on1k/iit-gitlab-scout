import { getPool } from "../db/pool.js";
import { collectStack } from "./stack-collector.js";
import { collectActivity } from "./activity-collector.js";
import { collectProject } from "./contributor-collector.js";
import { collectBranches } from "./branch-collector.js";
import { collectMergeRequests } from "./mr-collector.js";
import { collectPipelines } from "./pipeline-collector.js";
import { setSchedulerStartedAt, clearSchedulerStartedAt } from "../api/v1/scheduler.js";

interface SchedulerTask {
  id: number;
  task_name: string;
  enabled: boolean;
  interval_minutes: number;
  last_run_at: string | null;
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let logFn: (...args: any[]) => void = console.log;
let isRunning = false;
let currentTask = "";
let taskCurrent = 0;
let taskTotal = 0;

export function getSchedulerProgress() {
  return { currentTask, taskCurrent, taskTotal, isRunning };
}

export function isSchedulerBusy(): boolean {
  return isRunning;
}

async function runTask(taskName: string): Promise<void> {
  const pool = getPool();

  const projectsResult = await pool.query("SELECT id FROM projects");
  const projectIds: number[] = projectsResult.rows.map((r: any) => r.id);

  if (projectIds.length === 0) {
    logFn(`[scheduler] ${taskName}: no projects, skipping`);
    return;
  }

  currentTask = taskName;
  taskTotal = projectIds.length;
  taskCurrent = 0;
  logFn(`[scheduler] ${taskName}: processing ${projectIds.length} projects`);

  for (const projectId of projectIds) {
    taskCurrent++;
    // Verify project still exists before collecting
    const exists = await pool.query("SELECT 1 FROM projects WHERE id = $1", [projectId]);
    if (exists.rows.length === 0) {
      logFn(`[scheduler] ${taskName}: project ${projectId} no longer exists, skipping`);
      continue;
    }

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
        const errMsg = err instanceof Error ? err.message : String(err);
        logFn(`[scheduler] ${taskName}: project ${projectId} error: ${errMsg}`);
        try {
          await pool.query(
            "INSERT INTO scheduler_errors (task_name, project_id, error_code, error_message) VALUES ($1, $2, $3, $4)",
            [taskName, projectId, (err as any)?.code || "UNKNOWN", errMsg]
          );
        } catch { /* don't let logging errors break the scheduler */ }
      }
  }

  await pool.query(
    "UPDATE scheduler_settings SET last_run_at = now() WHERE task_name = $1",
    [taskName]
  );
  currentTask = "";
  taskCurrent = 0;
  taskTotal = 0;
  logFn(`[scheduler] ${taskName}: last_run_at updated`);
}

async function checkAndRun(): Promise<void> {
  if (isRunning) {
    logFn("[scheduler] Previous cycle still running, skipping");
    return;
  }
  isRunning = true;
  setSchedulerStartedAt(Date.now());

  try {
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
  } finally {
    clearSchedulerStartedAt();
    isRunning = false;
  }
}

export function startScheduler(appLog?: (...args: any[]) => void): void {
  if (appLog) logFn = appLog;
  logFn("[scheduler] Starting scheduler (check every 60s, no immediate run)");
  intervalId = setInterval(checkAndRun, 60 * 1000);
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logFn("[scheduler] Scheduler stopped");
  }
}

export async function runAllEnabledTasks(): Promise<void> {
  if (isRunning) {
    throw new Error("Scheduler is already running");
  }
  isRunning = true;
  setSchedulerStartedAt(Date.now());

  try {
    const pool = getPool();
    let result;
    try {
      result = await pool.query("SELECT * FROM scheduler_settings WHERE enabled = true");
    } catch {
      return;
    }

    for (const task of result.rows as SchedulerTask[]) {
      logFn(`[scheduler] Manual run: ${task.task_name}`);
      await runTask(task.task_name);
    }
  } finally {
    clearSchedulerStartedAt();
    isRunning = false;
  }
}
