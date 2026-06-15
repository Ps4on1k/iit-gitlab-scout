export interface ActivityDay {
  date: string;
  commits: number;
  merge_requests: number;
  pipelines: number;
}

export interface ActivityFilters {
  project_ids?: number[];
  tag?: string[];
  date_from?: string;
  date_to?: string;
  group_by?: "day" | "week";
}
