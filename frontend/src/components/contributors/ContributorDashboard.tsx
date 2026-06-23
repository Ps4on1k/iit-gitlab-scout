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
}

export function ContributorDashboard({ userRole }: Props) {
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [allContributors, setAllContributors] = useState<DbContributor[]>([]);
  const [allMetrics, setAllMetrics] = useState<ContributorMetrics | null>(null);
  const [allHeatmap, setAllHeatmap] = useState<HeatmapData>({ by_project: {}, by_contributor: {}, project_contributors: {}, by_project_contributor: {} });
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [selectedContributors, setSelectedContributors] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string | undefined>(getDefaultDateFrom);
  const [dateTo, setDateTo] = useState<string | undefined>();

  // When tags change, update project IDs to include all projects with selected tags
  const effectiveProjectIds = useMemo(() => {
    if (selectedTags.length === 0) return selectedProjectIds;
    const tagProjectIds = projects
      .filter((p) => selectedTags.includes(p.tag))
      .map((p) => p.id);
    // Merge with manually selected projects
    const merged = new Set([...selectedProjectIds, ...tagProjectIds]);
    return Array.from(merged);
  }, [selectedProjectIds, selectedTags, projects]);

  useEffect(() => {
    fetchProjects().then((res) => { if (res.ok) setProjects(res.data!); });
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const filters: ContributorFilters = {
        project_ids: effectiveProjectIds.length > 0 ? effectiveProjectIds : undefined,
        date_from: dateFrom,
        date_to: dateTo,
      };
      const [cRes, mRes, hRes] = await Promise.all([
        fetchContributorsList(filters),
        fetchContributorMetrics(filters),
        fetchContributorHeatmap(filters),
      ]);
      if (cRes.ok) setAllContributors(cRes.data!);
      if (mRes.ok) setAllMetrics(mRes.data!);
      if (hRes.ok) setAllHeatmap(hRes.data!);
    } finally {
      setLoading(false);
    }
  }, [effectiveProjectIds, dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  // Contributor filter
  const filteredContributors = useMemo(() => {
    if (selectedContributors.length === 0) return allContributors;
    return allContributors.filter((c) => selectedContributors.includes(c.author_email));
  }, [allContributors, selectedContributors]);

  // Metrics from filtered contributors
  const filteredMetrics = useMemo((): ContributorMetrics | null => {
    if (!allMetrics) return null;
    const fc = filteredContributors;
    if (fc.length === allContributors.length && selectedContributors.length === 0) return allMetrics;

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
  }, [allMetrics, allContributors, filteredContributors, selectedContributors]);

  // Heatmap filter
  const filteredHeatmap = useMemo(() => {
    const { by_contributor, project_contributors, by_project_contributor } = allHeatmap;

    // Filter contributors
    let filteredByContributor = by_contributor;
    if (selectedContributors.length > 0) {
      filteredByContributor = {};
      for (const [name, daily] of Object.entries(by_contributor)) {
        const email = name.includes("(") ? name.split(" (")[0] : name;
        if (selectedContributors.includes(email)) filteredByContributor[name] = daily;
      }
    }

    // Build filtered projects: use by_project_contributor when contributor filter is active
    const filteredByProject: Record<string, Record<string, number>> = {};
    const allProjectPaths = Object.keys(by_project_contributor);

    for (const projPath of allProjectPaths) {
      const projContribMap = by_project_contributor[projPath] || {};

      // If contributor filter: only keep selected contributors' data
      let contribsToInclude: string[];
      if (selectedContributors.length > 0) {
        contribsToInclude = Object.keys(projContribMap).filter((name) => {
          const email = name.includes("(") ? name.split(" (")[0] : name;
          return selectedContributors.includes(email);
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
  }, [allHeatmap, selectedContributors]);

  const contributorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of allContributors) seen.set(c.author_email, c.author_name ? `${c.author_email} (${c.author_name})` : c.author_email);
    return Array.from(seen.entries()).map(([email, label]) => ({ value: email, label }));
  }, [allContributors]);

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const p of projects) { if (p.tag) tags.add(p.tag); }
    return Array.from(tags).sort().map((t) => ({ value: t, label: t }));
  }, [projects]);

  const projectTags = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) { if (p.tag) map[p.path] = p.tag; }
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
        const res = await collectContributors(projectId, dateFrom, dateTo);
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

      <div style={{ display: "flex", gap: 12, marginBottom: 30, flexWrap: "wrap", alignItems: "center" }}>
        <Select mode="multiple" placeholder="Проекты" allowClear showSearch optionFilterProp="label"
          style={{ minWidth: 360, maxWidth: 600 }} value={selectedProjectIds} onChange={setSelectedProjectIds}
          options={projects.map((p) => ({ value: p.id, label: p.tag ? `${p.label} [${p.tag}]` : p.label }))}
          tagRender={({ label, closable, onClose }) => {
            const tagText = String(label);
            const tagMatch = tagText.match(/\[(.+)\]$/);
            const tagVal = tagMatch ? tagMatch[1] : "";
            const c = tagVal ? getTagColor(tagVal) : { bg: "#667eea", text: "#fff" };
            return <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: c.bg, color: c.text, border: "none" }}>{label}</Tag>;
          }}
          maxTagCount="responsive" />
        <Select mode="multiple" placeholder="Контрибьюторы" allowClear showSearch optionFilterProp="label"
          style={{ minWidth: 420, maxWidth: 750 }} value={selectedContributors} onChange={setSelectedContributors}
          options={contributorOptions}
          tagRender={({ label, closable, onClose }) => <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: "#764ba2", color: "white", border: "none" }}>{label}</Tag>}
          maxTagCount="responsive" />
        {tagOptions.length > 0 && (
          <Select mode="multiple" placeholder="Теги" allowClear style={{ minWidth: 180 }}
            value={selectedTags} onChange={setSelectedTags} options={tagOptions}
            tagRender={({ label, closable, onClose }) => <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: "#1677ff", color: "white", border: "none" }}>{label}</Tag>} />
        )}
        <RangePicker defaultValue={[dayjs().subtract(90, "day"), dayjs()]} onChange={(dates) => { setDateFrom(dates?.[0]?.format("YYYY-MM-DD")); setDateTo(dates?.[1]?.format("YYYY-MM-DD")); }} />
        <Space>
          {userRole === "admin" && (
            <Button type="primary" icon={<DatabaseOutlined />} loading={collecting} onClick={handleCollect} style={{ background: "#667eea", borderColor: "#667eea" }}>Собрать данные</Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
        </Space>
      </div>

      <MetricsCards data={filteredMetrics} loading={loading} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginBottom: 30 }}>
        <CommitTimelineChart data={filteredContributors} loading={loading} dateFrom={dateFrom} dateTo={dateTo} />
        <div style={{ background: "white", padding: 20, borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 16, color: "#333", borderLeft: "4px solid #667eea", paddingLeft: 12 }}>Топ-10 контрибьюторов</h3>
          {loading ? <div style={{ textAlign: "center", padding: 40 }}>Загрузка...</div> : (
            <div>{filteredContributors.slice(0, 10).map((c, i) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #e0e0e0", fontSize: 13 }}>
                <span>{i + 1}. {c.author_name ? `${c.author_email} (${c.author_name})` : c.author_email}</span>
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
      <div style={{ background: "white", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", marginBottom: 30 }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f0f0f0" }}>
          <h3 style={{ margin: 0, fontSize: 16, color: "#333", borderLeft: "4px solid #667eea", paddingLeft: 12 }}>Детальная таблица контрибуторов</h3>
        </div>
        <div style={{ padding: 20 }}><ContributorTable data={filteredContributors} loading={loading} /></div>
      </div>
      )}

      <div style={{ textAlign: "center", padding: 20, color: "#666", fontSize: 12 }}>GitLab Scout — Аналитика контрибьюторов</div>
    </div>
  );
}
