export interface CollectJob {
  id: string;
  collector: string;
  project_ids: number[];
  started_at: number;
  current: number;
  total: number;
  status: "running" | "done" | "error" | "stuck";
  errors: { project_id: number; error: string }[];
}

const TIMEOUT_MS = 15 * 60 * 1000;
const jobs = new Map<string, CollectJob>();
let jobCounter = 0;
let schedulerRunning = false;

export function startBatchCollect(collector: string, projectIds: number[]): string {
  const id = `batch-${++jobCounter}`;
  jobs.set(id, {
    id,
    collector,
    project_ids: projectIds,
    started_at: Date.now(),
    current: 0,
    total: projectIds.length,
    status: "running",
    errors: [],
  });
  return id;
}

export function updateBatchCollect(id: string, current: number): void {
  const job = jobs.get(id);
  if (job) job.current = current;
}

export function addBatchError(id: string, projectId: number, error: string): void {
  const job = jobs.get(id);
  if (job) job.errors.push({ project_id: projectId, error });
}

export function finishBatchCollect(id: string): void {
  const job = jobs.get(id);
  if (job) job.status = "done";
}

export function getActiveJobs(): CollectJob[] {
  const now = Date.now();
  const result: CollectJob[] = [];
  for (const [key, job] of jobs) {
    if (job.status === "running" && now - job.started_at > TIMEOUT_MS) {
      job.status = "stuck";
      job.errors.push({ project_id: 0, error: "Timeout exceeded (15 min)" });
    }
    if (job.status === "running") {
      result.push(job);
    } else {
      jobs.delete(key);
    }
  }
  return result;
}

export function isCollectorActive(collector: string): boolean {
  for (const job of jobs.values()) {
    if (job.collector === collector && job.status === "running") return true;
  }
  return false;
}

export function setSchedulerRunning(running: boolean): void {
  schedulerRunning = running;
}

export function isSchedulerRunning(): boolean {
  return schedulerRunning;
}

export function isAnyCollectionRunning(): boolean {
  return schedulerRunning || jobs.size > 0;
}

export function resetTracker(): void {
  jobs.clear();
  jobCounter = 0;
  schedulerRunning = false;
}
