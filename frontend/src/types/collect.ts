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
