export interface CollectJob {
  project_id: number;
  collector: string;
  started_at: number;
  current: number;
  total: number;
  status: "running" | "done" | "error" | "stuck";
  error?: string;
}

const TIMEOUT_MS = 5 * 60 * 1000;
const jobs = new Map<string, CollectJob>();

function jobKey(projectId: number, collector: string): string {
  return `${collector}:${projectId}`;
}

export function startCollect(projectId: number, collector: string, total: number): void {
  const key = jobKey(projectId, collector);
  jobs.set(key, {
    project_id: projectId,
    collector,
    started_at: Date.now(),
    current: 0,
    total,
    status: "running",
  });
}

export function updateCollect(projectId: number, collector: string, current: number, total: number): void {
  const key = jobKey(projectId, collector);
  const job = jobs.get(key);
  if (job) {
    job.current = current;
    job.total = total;
  }
}

export function finishCollect(projectId: number, collector: string, error?: string): void {
  const key = jobKey(projectId, collector);
  const job = jobs.get(key);
  if (job) {
    job.status = error ? "error" : "done";
    job.error = error;
  }
}

export function getActiveJobs(): CollectJob[] {
  const now = Date.now();
  const result: CollectJob[] = [];
  for (const [key, job] of jobs) {
    if (job.status === "running" && now - job.started_at > TIMEOUT_MS) {
      job.status = "stuck";
      job.error = "Timeout exceeded (5 min)";
    }
    if (job.status === "running") {
      result.push(job);
    } else {
      jobs.delete(key);
    }
  }
  return result;
}

export function isCollectorActive(projectId: number, collector: string): boolean {
  const key = jobKey(projectId, collector);
  const job = jobs.get(key);
  return job?.status === "running";
}
