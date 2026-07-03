import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Select, DatePicker, Button, Space, message, Tag, Card, Row, Col, Spin, Empty, Tooltip } from "antd";
import dayjs from "dayjs";
import { ReloadOutlined, RocketOutlined } from "@ant-design/icons";
import { MetricsCards } from "./MetricsCards";
import { ContributorTable } from "./ContributorTable";
import { HeatmapChart } from "./HeatmapChart";
import { CommitTimelineChart } from "./CommitTimelineChart";
import { getTagColor } from "../../utils/tagColors";
import { CollectButton } from "../common/CollectButton";
import {
  fetchContributorsList,
  fetchContributorMetrics,
  fetchContributorHeatmap,
  collectContributors,
  fetchProjects,
  fetchDeployReliability,
  type DeployReliabilityEntry,
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
  filters: { projectIds: number[]; tags: string[]; dateFrom: string; dateTo: string; contributors: string[]; useMedian: boolean };
  onContributorClick?: (name: string) => void;
}

export const ContributorDashboard = memo(function ContributorDashboard({ userRole, filters, onContributorClick }: Props) {
  const [loading, setLoading] = useState(false);
  const [allContributors, setAllContributors] = useState<DbContributor[]>([]);
  const [allMetrics, setAllMetrics] = useState<ContributorMetrics | null>(null);
  const [allHeatmap, setAllHeatmap] = useState<HeatmapData>({ by_project: {}, by_contributor: {}, project_contributors: {}, by_project_contributor: {} });
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [deployData, setDeployData] = useState<DeployReliabilityEntry[]>([]);
  const [deployLoading, setDeployLoading] = useState(false);

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

  const loadDeployData = useCallback(async () => {
    setDeployLoading(true);
    try {
      const contribs = filters.contributors.length > 0 ? filters.contributors.join(",") : undefined;
      const r = await fetchDeployReliability(effectiveProjectIds.length > 0 ? effectiveProjectIds : undefined, filters.dateFrom, filters.dateTo, contribs);
      if (r.ok) setDeployData(r.data!);
    } finally { setDeployLoading(false); }
  }, [effectiveProjectIds, filters.dateFrom, filters.dateTo, filters.contributors]);

  useEffect(() => { loadDeployData(); }, [loadDeployData]);

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
    for (const p of projects) { if (p.tags) map[`${p.path} || ${p.base_url || ""}`] = p.tags.join(", "); }
    return map;
  }, [projects]);

  const projectDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) { if (p.description) { const key = `${p.path} || ${p.base_url || ""}`; map[key] = p.description; } }
    return map;
  }, [projects]);

  const contributorIds = useMemo(() => {
    return effectiveProjectIds.length > 0 ? effectiveProjectIds : projects.map((p) => p.id);
  }, [effectiveProjectIds, projects]);

  return (
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ background: "linear-gradient(135deg, #8BAADB 0%, #B8A8D8 100%)", color: "#111315", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Аналитика контрибьюторов</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Сбор и визуализация статистики коммитов из GitLab</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {userRole === "admin" && (
          <CollectButton collector="contributors" projectIds={contributorIds} dateFrom={filters.dateFrom} dateTo={filters.dateTo} onComplete={loadData} color="#8BAADB" label="Собрать данные" />
        )}
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
      </div>

      <MetricsCards data={filteredMetrics} loading={loading} />

      {/* Deploy Reliability Card */}
      <Card
        title={<span><RocketOutlined /> Надёжность деплоя по контрибьюторам</span>}
        size="small"
        style={{ marginBottom: 24 }}
        extra={<span style={{ fontSize: 11, color: "var(--ant-color-textSecondary)" }}>Как часто коммиты контрибутора доходят до успешного деплоя</span>}
      >
        {deployLoading ? <div style={{ textAlign: "center", padding: 40 }}><Spin /></div> :
         deployData.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных о деплоях" /> : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Всего MR", value: deployData.reduce((s, d) => s + d.total_merged_mrs, 0), color: "#3A8DFF" },
                { label: "Запусков pipeline", value: deployData.reduce((s, d) => s + d.total_pipelines, 0), color: "#B8A8D8" },
                { label: "Успешных деплоев", value: deployData.reduce((s, d) => s + d.successful_pipelines, 0), color: "#21B573" },
                { label: "Провалов деплоя", value: deployData.reduce((s, d) => s + d.failed_pipelines, 0), color: "#E5484D" },
              ].map((s) => (
                <div key={s.label} style={{ textAlign: "center", padding: "8px 4px", borderRadius: 8, background: "var(--ant-color-fill-secondary)" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "var(--ant-color-textSecondary)" }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--ant-color-textSecondary)", marginBottom: 12 }}>
              <b>Deploy Success Rate</b> — % успешных pipeline из запущенных. <b>Pipeline Coverage</b> — % MR, для которых запускался pipeline.
            </div>
            <div style={{ maxHeight: 320, overflow: "auto" }}>
              {deployData.slice(0, 20).map((d, i) => {
                const barWidth = deployData[0]?.successful_pipelines ? (d.successful_pipelines / deployData[0].successful_pipelines) * 100 : 0;
                return (
                  <div key={d.email} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, fontSize: 13 }}>
                    <span style={{ width: 24, textAlign: "center", fontWeight: 700, color: i < 3 ? ["#faad14", "#8c8c8c", "#d48806"][i] : "#999", fontSize: 13 }}>
                      {i < 3 ? ["★", "●", "◆"][i] : `${i + 1}`}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontWeight: 500, cursor: "pointer", color: "#3A8DFF" }} onClick={() => onContributorClick?.(d.email)}>{d.name}</span>
                        <span style={{ fontSize: 11, color: "var(--ant-color-textSecondary)" }}>
                          {d.successful_pipelines}/{d.completed_pipelines} successful
                        </span>
                      </div>
                      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--ant-color-fill-secondary)" }}>
                        <div style={{ width: `${barWidth}%`, background: "linear-gradient(90deg, #21B573, #3A8DFF)", borderRadius: 4 }} />
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 2, fontSize: 11, color: "var(--ant-color-textSecondary)" }}>
                        <span>Success: <b style={{ color: d.deploy_success_rate >= 80 ? "#21B573" : d.deploy_success_rate >= 50 ? "#FFB020" : "#E5484D" }}>{d.deploy_success_rate}%</b></span>
                        <span>Coverage: <b>{d.pipeline_coverage_rate}%</b></span>
                        <span>MR: {d.total_merged_mrs}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
         )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginBottom: 30 }}>
        <CommitTimelineChart data={filteredContributors} loading={loading} dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
        <div style={{ borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 16, color: "var(--ant-color-text)", borderLeft: "4px solid #B0C0D8", paddingLeft: 12 }}>Топ-10 контрибьюторов</h3>
          {loading ? <div style={{ textAlign: "center", padding: 40 }}>Загрузка...</div> : (
            <div>{filteredContributors.slice(0, 10).map((c, i) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--ant-color-border-secondary)", fontSize: 13 }}>
                <span style={{ cursor: "pointer", color: "#3A8DFF" }} onClick={() => onContributorClick?.(c.author_email)}>{i + 1}. {c.author_name ? `${c.author_name} (${c.author_email})` : c.author_email}</span>
                <span style={{ fontWeight: 600, color: "#3A8DFF" }}>{c.total_changes.toLocaleString()}</span>
              </div>
            ))}</div>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 30 }}>
        <HeatmapChart byProject={filteredHeatmap.by_project} byContributor={filteredHeatmap.by_contributor} loading={loading} projectTags={projectTags} projectDescriptions={projectDescriptions} projectLabels={allHeatmap.project_labels} />
      </div>

      {userRole !== "user" && (
      <div style={{ borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", marginBottom: 30 }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
          <h3 style={{ margin: 0, fontSize: 16, color: "var(--ant-color-text)", borderLeft: "4px solid #B0C0D8", paddingLeft: 12 }}>Детальная таблица контрибуторов</h3>
        </div>
        <div style={{ padding: 20 }}><ContributorTable data={filteredContributors} loading={loading} onContributorClick={onContributorClick} /></div>
      </div>
      )}

      <div style={{ textAlign: "center", padding: 20, color: "var(--ant-color-text-secondary)", fontSize: 12 }}>GitLab Scout — Аналитика контрибьюторов</div>
    </div>
  );
});
