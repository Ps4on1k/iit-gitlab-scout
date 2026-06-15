export interface ProjectLanguage {
  project_id: number;
  project_path: string;
  project_label: string;
  project_tag: string;
  language: string;
  bytes: number;
  percentage: number;
}

export interface ProjectPackage {
  project_id: number;
  project_path: string;
  project_label: string;
  project_tag: string;
  name: string;
  version: string;
  source: string;
}

export interface LanguageSummary {
  language: string;
  total_percentage: number;
  project_count: number;
  percentage: number;
}

export interface PackageSummary {
  name: string;
  total_count: number;
  projects: string[];
  source: string;
}

export interface StackFilters {
  project_ids?: number[];
  tag?: string[];
  language?: string[];
}
