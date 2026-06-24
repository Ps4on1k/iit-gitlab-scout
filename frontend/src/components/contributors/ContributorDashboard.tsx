import { useState, useEffect, useMemo, useCallback } from "react";
import { Select, DatePicker, Button, Space, message, Tag } from "antd";
import dayjs from "dayjs";
import { ReloadOutlined, DatabaseOutlined } from "@ant-design/icons";
import { MetricsCards } from "./MetricsCards";
import { ContributorTable } from "./ContributorTable";
import { HeatmapChart } from "./HeatmapChart";
import { CommitTimelineChart } from "./CommitTimelineChart";
import { getTagColor } from "../../utils/tagColors";
import {
  fetchContributorsList,
  fetchContributorMetrics,
  fetchContributorHeatmap,
  collectContributors,
  fetchProjects,
} from "../../api/client";
import type { DbContributor, ContributorMetrics, HeatmapData, ProjectConfig, ContributorFilters, Role } from "../../types";

const { RangePicker } = DatePicker;

function getDefaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

interface Props {
  userRole: Role;
  filters: { projectIds: number[]; tags: string[]; dateFrom: string; dateTo: string; contributors: string[] };
  onContributorClick?: (name: string) => void;
}

export function ContributorDashboard({ userRole, filters, onContributorClick }: Props) {
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [allContributors, setAllContributors] = useState<DbContributor[]>([]);
  const [allMetrics, setAllMetrics] = useState<ContributorMetrics | null>(null);
  const [allHeatmap, setAllHeatmap] = useState<HeatmapData>({ by_project: {}, by_contributor: {}, project_contributors: {}, by_project_contributor: {} });
  const [projects, setProjects] = useState<ProjectConfig[]>([]);

  useEffect(() => {
    fetchProjects().then((res) => { if (res.ok) setProjects(res.data!); });
  }, []);

  const effectiveProjectIds = useMemo(() => {
    if (filters.tags.length === 0) return filters.projectIds;
    const tagProjectIds = projects.filter((p) => p.tags?.some((t) => filters.tags.includes(t))).map((p) => p.id);
    const merged = new Set([...filters.projectIds, ...tagProjectIds]);
    return Array.from(merged);
  }, [filters.projectIds, filters.tags, projects]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const fc: ContributorFilters = {
        project_ids: effectiveProjectIds.length > 0 ? effectiveProjectIds : undefined,
        date_from: filters.dateFrom,
        date_to: filters.dateTo,
      };
      const [cRes, mRes, hRes] = await Promise.all([
        fetchContributorsList(fc),
        fetchContributorMetrics(fc),
        fetchContributorHeatmap(fc),
      ]);
      if (cRes.ok) setAllContributors(cRes.data!);
      if (mRes.ok) setAllMetrics(mRes.data!);
      if (hRes.ok) setAllHeatmap(hRes.data!);
    } finally {
      setLoading(false);
    }
  }, [effectiveProjectIds, filters.dateFrom, filters.dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  // Contributor filter — match by email or by name
  const filteredContributors = useMemo(() => {
    if (filters.contributors.length === 0) return allContributors;
    return allContributors.filter((c) => {
      return filters.contributors.some((f) =>
        c.author_email === f ||
        c.author_name === f ||
        c.author_email.toLowerCase().includes(f.toLowerCase()) ||
        (c.author_name && c.author_name.toLowerCase().includes(f.toLowerCase()))
      );
    });
  }, [allContributors, filters.contributors]);

  // Metrics from filtered contributors
  const filteredMetrics = useMemo((): ContributorMetrics | null => {
    if (!allMetrics) return null;
    const fc = filteredContributors;
    if (fc.length === allContributors.length && filters.contributors.length === 0) return allMetrics;

    const total_commits = fc.reduce((s, c) => s + Number(c.total_commits), 0);
    const total_additions = fc.reduce((s, c) => s + Number(c.total_additions), 0);
    const total_deletions = fc.reduce((s, c) => s + Number(c.total_deletions), 0);
    const total_changes = fc.reduce((s, c) => s + Number(c.total_changes), 0);
    const allDates = new Set<string>();
    for (const c of fc) { for (const d of Object.keys(c.frequency || {})) allDates.add(d); }
    const sorted = Array.from(allDates).sort();
    const ps = sorted[0] || allMetrics.period_start;
    const pe = sorted[sorted.length - 1] || allMetrics.period_end;
    const cd = Math.max(1, Math.ceil((new Date(pe).getTime() - new Date(ps).getTime()) / 86400000) + 1);
    return {
      unique_contributors: fc.length, total_commits, total_additions, total_deletions, total_changes,
      period_start: ps, period_end: pe, calendar_days: cd,
      avg_commits_per_day: total_commits / cd,
      avg_changes_per_day: total_changes / cd, avg_changes_per_commit: total_changes / Math.max(1, total_commits),
    };
  }, [allMetrics, allContributors, filteredContributors, filters.contributors]);

  // Heatmap filter - keys are "email (name)" format, match by email
  const filteredHeatmap = useMemo(() => {
    const { by_contributor, project_contributors, by_project_contributor } = allHeatmap;

    const extractEmail = (key: string) => key.includes("(") ? key.split("(")[0].trim() : key;

    let filteredByContributor = by_contributor;
    if (filters.contributors.length > 0) {
      filteredByContributor = {};
      for (const [name, daily] of Object.entries(by_contributor)) {
        const email = extractEmail(name);
        const keyLower = name.toLowerCase();
        const matches = filters.contributors.some((f) => {
          const fLower = f.toLowerCase();
          return email === f || keyLower.includes(fLower);
        });
        if (matches) filteredByContributor[name] = daily;
      }
    }

    const filteredByProject: Record<string, Record<string, number>> = {};
    const allProjectPaths = Object.keys(by_project_contributor);

    for (const projPath of allProjectPaths) {
      const projContribMap = by_project_contributor[projPath] || {};

      let contribsToInclude: string[];
      if (filters.contributors.length > 0) {
        contribsToInclude = Object.keys(projContribMap).filter((name) => {
          const email = extractEmail(name);
          const keyLower = name.toLowerCase();
          return filters.contributors.some((f) => {
            const fLower = f.toLowerCase();
            return email === f || keyLower.includes(fLower);
          });
        });
      } else {
        contribsToInclude = Object.keys(projContribMap);
      }

      if (contribsToInclude.length === 0) continue;

      // Aggregate selected contributors' data for this project
      const mergedDaily: Record<string, number> = {};
      for (const contribName of contribsToInclude) {
        const daily = projContribMap[contribName] || {};
        for (const [day, cnt] of Object.entries(daily)) {
          mergedDaily[day] = (mergedDaily[day] || 0) + cnt;
        }
      }

      if (Object.keys(mergedDaily).length > 0) {
        filteredByProject[projPath] = mergedDaily;
      }
    }

    return { by_project: filteredByProject, by_contributor: filteredByContributor, project_contributors };
  }, [allHeatmap, filters.contributors]);

  const projectTags = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) { if (p.tags) map[p.path] = p.tags.join(", "); }
    return map;
  }, [projects]);

  const projectDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) { if (p.description) { map[p.label] = p.description; map[p.path] = p.description; } }
    return map;
  }, [projects]);

  const handleCollect = async () => {
    if (effectiveProjectIds.length === 0) { message.warning("Выберите проект для сбора"); return; }
    setCollecting(true);
    try {
      for (const projectId of effectiveProjectIds) {
        const res = await collectContributors(projectId, filters.dateFrom, filters.dateTo);
        if (res.ok) message.success(`${res.data!.project_path}: +${res.data!.new_commits} new`);
        else message.error(res.error!);
      }
      loadData();
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Аналитика контрибьюторов</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Сбор и визуализация статистики коммитов из GitLab</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {userRole === "admin" && (
          <Button type="primary" icon={<DatabaseOutlined />} loading={collecting} onClick={handleCollect} style={{ background: "#667eea", borderColor: "#667eea" }}>Собрать данные</Button>
        )}
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
      </div>

      <MetricsCards data={filteredMetrics} loading={loading} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginBottom: 30 }}>
        <CommitTimelineChart data={filteredContributors} loading={loading} dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
        <div style={{ borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 16, color: "var(--ant-color-text)", borderLeft: "4px solid #667eea", paddingLeft: 12 }}>Топ-10 контрибьюторов</h3>
          {loading ? <div style={{ textAlign: "center", padding: 40 }}>Загрузка...</div> : (
            <div>{filteredContributors.slice(0, 10).map((c, i) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--ant-color-border-secondary)", fontSize: 13 }}>
                <span style={{ cursor: "pointer", color: "#667eea" }} onClick={() => onContributorClick?.(c.author_email)}>{i + 1}. {c.author_name ? `${c.author_name} (${c.author_email})` : c.author_email}</span>
                <span style={{ fontWeight: 600, color: "#667eea" }}>{c.total_changes.toLocaleString()}</span>
              </div>
            ))}</div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 30 }}>
        <HeatmapChart byProject={filteredHeatmap.by_project} byContributor={filteredHeatmap.by_contributor} loading={loading} projectTags={projectTags} projectDescriptions={projectDescriptions} />
      </div>

      {userRole !== "user" && (
      <div style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", marginBottom: 30 }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
          <h3 style={{ margin: 0, fontSize: 16, color: "var(--ant-color-text)", borderLeft: "4px solid #667eea", paddingLeft: 12 }}>Детальная таблица контрибуторов</h3>
        </div>
        <div style={{ padding: 20 }}><ContributorTable data={filteredContributors} loading={loading} onContributorClick={onContributorClick} /></div>
      </div>
      )}

      <div style={{ textAlign: "center", padding: 20, color: "var(--ant-color-text-secondary)", fontSize: 12 }}>GitLab Scout — Аналитика контрибьюторов</div>
    </div>
  );
}
