import { useState, useEffect, useMemo, memo } from "react";
import { Card, Row, Col, Statistic, Select, Button, Tag, message, Input, DatePicker, Collapse, Alert } from "antd";
import { DatabaseOutlined, ReloadOutlined, SearchOutlined, WarningOutlined, CheckCircleOutlined, DownloadOutlined } from "@ant-design/icons";
import { fetchBranches, collectBranches, fetchProjects } from "../../api/client";
import { ProjectLabel } from "../common/ProjectLabel";

import { delay } from "../../utils/collect";
import { getProjectUrl } from "../../utils/projectUrl";
import type { ProjectConfig } from "../../types";
import type { Branch, BranchSummary } from "../../types/analytics";
import type { Role } from "../../types";
import type { GlobalFilters } from "../GlobalFilterBar";

interface Props { userRole: Role; filters: GlobalFilters; onContributorClick?: (name: string) => void; }

type SortKey = "project_label" | "name" | "status" | "last_commit_date" | "last_commit_author" | "days_ago" | "branch_age";
type HealthSortKey = "label" | "total" | "active" | "stale" | "merged" | "stalePct";

function formatAge(days: number): string {
  if (days < 1) return "1 дн.";
  if (days === 1) return "1 дн.";
  if (days < 30) return `${days} дн.`;
  if (days < 365) return `${Math.floor(days / 30)} мес.`;
  return `${(days / 365).toFixed(1)} г.`;
}

function getAgeColor(days: number): string {
  if (days <= 30) return "#21B573";
  if (days <= 90) return "#FFB020";
  if (days <= 180) return "#FFB020";
  return "#E5484D";
}

function getHealthColor(active: number, stale: number, total: number): string {
  if (total === 0) return "#d9d9d9";
  const staleRatio = stale / total;
  if (staleRatio <= 0.2) return "#21B573";
  if (staleRatio <= 0.5) return "#FFB020";
  return "#E5484D";
}

function downloadCsv(filename: string, headers: string[], rows: any[][]) {
  const bom = "\uFEFF";
  const csv = [headers.join(";"), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))].join("\n");
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export const BranchDashboard = memo(function BranchDashboard({ userRole, filters, onContributorClick }: Props) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [summary, setSummary] = useState<BranchSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [searchText, setSearchText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("days_ago");
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [healthSortKey, setHealthSortKey] = useState<HealthSortKey>("stalePct");
  const [healthSortAsc, setHealthSortAsc] = useState(false);
  const [healthPage, setHealthPage] = useState(1);
  const healthPageSize = 10;

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data as ProjectConfig[]); }); }, []);

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    for (const p of projects) { if (p.tags) p.tags?.forEach((t) => tags.add(t)); }
    return Array.from(tags).sort().map((t) => ({ value: t, label: t }));
  }, [projects]);

  const loadData = async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const effectiveProjectIds = filters.tags.length > 0
        ? [...new Set([...filters.projectIds, ...projects.filter((p) => p.tags?.some((t) => filters.tags.includes(t))).map((p) => p.id)])]
        : filters.projectIds;
      const statusParam = statusFilter === "all" ? undefined : statusFilter;
      const res = await fetchBranches(effectiveProjectIds.length > 0 ? effectiveProjectIds : undefined, undefined, statusParam);
      if (signal?.aborted) return;
      if (res.ok) { setBranches(res.data!.branches); setSummary(res.data!.summary); }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [filters.projectIds, filters.tags, filters.dateFrom, filters.dateTo, statusFilter, filters.contributors]);

  const filtered = useMemo(() => {
    let result = branches;
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter((b) => b.name.toLowerCase().includes(lower) || b.project_label.toLowerCase().includes(lower));
    }
    return result;
  }, [branches, searchText]);

  const projectMap = useMemo(() => {
    const m = new Map<string, ProjectConfig>();
    for (const p of projects) m.set(p.label, p);
    return m;
  }, [projects]);

  const withMetrics = useMemo(() => {
    return filtered.map((b) => {
      const daysAgo = b.last_commit_date ? Math.floor((Date.now() - new Date(b.last_commit_date).getTime()) / 86400000) : 9999;
      const branchAge = (b.first_commit_date && b.last_commit_date)
        ? Math.floor((new Date(b.last_commit_date).getTime() - new Date(b.first_commit_date).getTime()) / 86400000)
        : null;
      const type = b.merged ? "merged" : b.default ? "default" : b.protected ? "protected" : (daysAgo > 90 ? "stale" : "active");
      return { ...b, daysAgo, branchAge, type };
    });
  }, [filtered]);

  const sorted = useMemo(() => {
    return [...withMetrics].sort((a, b) => {
      let aVal: any, bVal: any;
      if (sortKey === "status") { aVal = a.type; bVal = b.type; }
      else if (sortKey === "days_ago") { aVal = a.daysAgo; bVal = b.daysAgo; }
      else if (sortKey === "branch_age") { aVal = a.branchAge ?? -1; bVal = b.branchAge ?? -1; }
      else { aVal = a[sortKey] || ""; bVal = b[sortKey] || ""; }
      if (typeof aVal === "string") return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [withMetrics, sortKey, sortAsc]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page]);

  useEffect(() => { setPage(1); }, [searchText, filters.projectIds, filters.tags, statusFilter, filters.dateFrom, filters.dateTo, filters.contributors]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "name" || key === "project_label" || key === "last_commit_author"); }
  };

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : " ↕";

  const branchProjectIds = useMemo(() => filters.projectIds.length > 0 ? filters.projectIds : projects.map((p) => p.id), [filters.projectIds, projects]);

  const thStyle: React.CSSProperties = {
    background: "var(--ant-color-fill-secondary)",
    color: "var(--ant-color-textSecondary)",
    padding: "12px 10px", textAlign: "left",
    fontWeight: 700, fontSize: 11, letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
    borderBottom: "2px solid var(--ant-color-border-secondary)",
  };

  const tdStyle: React.CSSProperties = {
    padding: "10px 10px", borderBottom: "1px solid var(--ant-color-border-secondary)", fontSize: 13,
  };

  return (
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ background: "linear-gradient(135deg, #8BC8A8 0%, #B8D8C0 100%)", color: "#111315", padding: "14px 24px", borderRadius: "12px", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Ветки проектов</h1>
        <div style={{ opacity: 0.9, fontSize: 13 }}>Статус и возраст веток из GitLab</div>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Классификация веток"
        description={
          <div>
            <b>Активные</b> — ветки с последним коммитом менее 90 дней назад, не замерженные в основную ветку. Требуют внимания и контроля.<br />
            <b>Заброшенные</b> — ветки без коммитов более 90 дней, не замерженные. Вероятно устарели и могут быть удалены.<br />
            <b>Замерженные</b> — ветки, уже влитые в основную ветку. Можно безопасно удалить из репозитория.
          </div>
        }
      />

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Select placeholder="Статус" allowClear style={{ width: 180 }} value={statusFilter} onChange={setStatusFilter}
          options={[
            { value: "active", label: "Активные (<90д)" },
            { value: "stale", label: "Заброшенные (>90д)" },
            { value: "merged", label: "Замерженные" },
          ]} />
        <Input placeholder="Поиск по ветке..." prefix={<SearchOutlined />} allowClear style={{ width: 200 }} value={searchText} onChange={(e) => setSearchText(e.target.value)} />

        <Button icon={<ReloadOutlined />} onClick={() => loadData()} loading={loading}>Обновить</Button>
      </div>

      {summary && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}><Card><Statistic title="Всего" value={summary.total} /></Card></Col>
            <Col span={4}><Card><Statistic title="Активные" value={summary.active} valueStyle={{ color: "#21B573" }} suffix={<span style={{ fontSize: 12, color: "var(--ant-color-textTertiary)" }}>({summary.total > 0 ? Math.round(summary.active / summary.total * 100) : 0}%)</span>} /></Card></Col>
            <Col span={4}><Card><Statistic title="Заброшенные" value={summary.stale} valueStyle={{ color: "#E5484D" }} suffix={<span style={{ fontSize: 12, color: "var(--ant-color-textTertiary)" }}>({summary.total > 0 ? Math.round(summary.stale / summary.total * 100) : 0}%)</span>} /></Card></Col>
            <Col span={4}><Card><Statistic title="Замерженные" value={summary.merged} valueStyle={{ color: "#3A8DFF" }} /></Card></Col>
            <Col span={4}><Card><Statistic title="Защищённые" value={summary.protected} /></Card></Col>
            <Col span={4}><Card><Statistic title="Ср. дн. без коммита" value={summary.avgDaysSinceCommit} valueStyle={{ color: summary.avgDaysSinceCommit > 90 ? "#E5484D" : summary.avgDaysSinceCommit > 30 ? "#FFB020" : "#21B573" }} suffix="дн." /></Card></Col>
          </Row>

          {summary.perProject.length > 0 && (
            <Collapse
              defaultActiveKey={[]}
              style={{ marginBottom: 16 }}
              items={[{
                key: "per-project",
                label: <span style={{ fontSize: 14 }}>Здоровье по проектам ({summary.perProject.length})</span>,
                children: (
                  <div style={{ overflowX: "auto" }}>
                    {(() => {
                      const withStalePct = summary.perProject.map((p) => ({
                        ...p,
                        stalePct: (p.total - p.merged) > 0 ? Math.round(p.stale / (p.total - p.merged) * 100) : 0,
                      }));
                      const sorted = [...withStalePct].sort((a, b) => {
                        let aVal: any, bVal: any;
                        if (healthSortKey === "label") { aVal = a.label; bVal = b.label; }
                        else if (healthSortKey === "stalePct") { aVal = a.stalePct; bVal = b.stalePct; }
                        else { aVal = a[healthSortKey]; bVal = b[healthSortKey]; }
                        if (typeof aVal === "string") return healthSortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                        return healthSortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal);
                      });
                      const paged = sorted.slice((healthPage - 1) * healthPageSize, healthPage * healthPageSize);
                      const hArrow = (key: HealthSortKey) => healthSortKey === key ? (healthSortAsc ? " ↑" : " ↓") : " ↕";
                      const hSort = (key: HealthSortKey) => {
                        if (healthSortKey === key) setHealthSortAsc(!healthSortAsc);
                        else { setHealthSortKey(key); setHealthSortAsc(key === "label"); }
                      };
                      return (
                        <>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr>
                                <th style={{ ...thStyle, cursor: "pointer" }} onClick={() => hSort("label")}>Проект{hArrow("label")}</th>
                                <th style={{ ...thStyle, cursor: "pointer", textAlign: "center" }} onClick={() => hSort("total")}>Всего{hArrow("total")}</th>
                                <th style={{ ...thStyle, cursor: "pointer", textAlign: "center" }} onClick={() => hSort("active")}>Активные{hArrow("active")}</th>
                                <th style={{ ...thStyle, cursor: "pointer", textAlign: "center" }} onClick={() => hSort("stale")}>Заброшены{hArrow("stale")}</th>
                                <th style={{ ...thStyle, cursor: "pointer", textAlign: "center" }} onClick={() => hSort("merged")}>Замержены{hArrow("merged")}</th>
                                <th style={{ ...thStyle, cursor: "pointer", width: "30%" }} onClick={() => hSort("stalePct")}>Здоровье{hArrow("stalePct")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {paged.map((p) => {
                                const healthColor = getHealthColor(p.active, p.stale, p.total - p.merged);
                                return (
                                  <tr key={p.project_id} style={{ borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                                      <ProjectLabel label={p.label} tag={p.tags?.join(", ")} description={projectMap.get(p.label)?.description} url={projectMap.get(p.label) ? getProjectUrl(projectMap.get(p.label)!.base_url, projectMap.get(p.label)!.path) : undefined} />
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "center" }}>{p.total}</td>
                                    <td style={{ ...tdStyle, textAlign: "center", color: "#21B573", fontWeight: 600 }}>{p.active}</td>
                                    <td style={{ ...tdStyle, textAlign: "center", color: "#E5484D", fontWeight: 600 }}>{p.stale}</td>
                                    <td style={{ ...tdStyle, textAlign: "center", color: "#3A8DFF", fontWeight: 600 }}>{p.merged}</td>
                                    <td style={tdStyle}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--ant-color-border-secondary)", overflow: "hidden", display: "flex" }}>
                                          <div style={{ width: `${p.total > 0 ? p.active / p.total * 100 : 0}%`, background: "#21B573" }} />
                                          <div style={{ width: `${p.total > 0 ? p.stale / p.total * 100 : 0}%`, background: "#E5484D" }} />
                                          <div style={{ width: `${p.total > 0 ? p.merged / p.total * 100 : 0}%`, background: "#3A8DFF" }} />
                                        </div>
                                        <span style={{ fontSize: 11, color: healthColor, fontWeight: 600, minWidth: 36 }}>
                                          {p.stalePct > 30 ? <><WarningOutlined /> {p.stalePct}%</> : p.stalePct <= 10 && (p.total - p.merged) > 0 ? <><CheckCircleOutlined /> OK</> : `${p.stalePct}%`}
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          {sorted.length > healthPageSize && (
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", marginTop: 8, borderTop: "1px solid var(--ant-color-border-secondary)" }}>
                              <span style={{ fontSize: 12, color: "var(--ant-color-textSecondary)" }}>
                                {paged.length} из {sorted.length} проектов
                              </span>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <Button size="small" disabled={healthPage <= 1} onClick={() => setHealthPage(healthPage - 1)}>←</Button>
                                <span style={{ fontSize: 12, color: "var(--ant-color-textSecondary)" }}>{healthPage}/{Math.ceil(sorted.length / healthPageSize)}</span>
                                <Button size="small" disabled={healthPage >= Math.ceil(sorted.length / healthPageSize)} onClick={() => setHealthPage(healthPage + 1)}>→</Button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ),
              }]}
            />
          )}
        </>
      )}

      <div style={{ overflowX: "auto", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", background: "var(--ant-color-bg-container)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle} onClick={() => handleSort("project_label")}>Проект{arrow("project_label")}</th>
              <th style={thStyle} onClick={() => handleSort("name")}>Ветка{arrow("name")}</th>
              <th style={thStyle} onClick={() => handleSort("status")}>Статус{arrow("status")}</th>
              <th style={thStyle} onClick={() => handleSort("days_ago")}>Последний коммит{arrow("days_ago")}</th>
              <th style={thStyle} onClick={() => handleSort("branch_age")}>Жизнь ветки{arrow("branch_age")}</th>
              <th style={thStyle} onClick={() => handleSort("last_commit_author")}>Автор{arrow("last_commit_author")}</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r) => {
              const lastDate = r.last_commit_date ? new Date(r.last_commit_date) : null;
              const rowBg = r.type === "stale" ? "rgba(207,19,34,0.08)" : r.type === "active" ? "rgba(63,134,0,0.08)" : "";
              return (
                <tr key={r.id} style={{ background: rowBg }} onMouseEnter={(e) => { if (!rowBg) e.currentTarget.style.background = "var(--ant-color-fill-secondary)"; }} onMouseLeave={(e) => { if (!rowBg) e.currentTarget.style.background = rowBg; }}>
                    <td style={tdStyle}><ProjectLabel label={r.project_label} tag={r.project_tags?.join(", ")} description={projectMap.get(r.project_label)?.description} url={projectMap.get(r.project_label) ? getProjectUrl(projectMap.get(r.project_label)!.base_url, projectMap.get(r.project_label)!.path) : undefined} /></td>
                  <td style={tdStyle}><code style={{ fontSize: 12 }}>{r.name}</code></td>
                  <td style={tdStyle}>
                    {r.merged ? <Tag color="green">замержена</Tag> : r.default ? <Tag color="blue">основная</Tag> : r.protected ? <Tag color="orange">защищена</Tag> : r.daysAgo > 90 ? <Tag color="red">заброшена</Tag> : <Tag color="green">активная</Tag>}
                  </td>
                  <td style={tdStyle}>
                    <div>
                      <span style={{ color: getAgeColor(r.daysAgo) }}>
                        {lastDate ? `${lastDate.toLocaleDateString()} (${formatAge(r.daysAgo)})` : "N/A"}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ant-color-textSecondary)", marginTop: 1 }}>
                      {(r as any).last_commit_additions > 0 || (r as any).last_commit_deletions > 0 ? (
                        <>
                          <span style={{ color: "#21B573" }}>+{(r as any).last_commit_additions}</span>
                          {" "}
                          <span style={{ color: "#E5484D" }}>-{(r as any).last_commit_deletions}</span>
                        </>
                      ) : lastDate ? (
                        <span>N/A</span>
                      ) : null}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {r.branchAge !== null ? <span style={{ color: "var(--ant-color-text-secondary)" }}>{formatAge(r.branchAge)}</span> : "N/A"}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: "#3A8DFF", cursor: "pointer" }} onClick={() => onContributorClick?.((r as any).last_commit_author_email || r.display_author)}>{r.display_author}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--ant-color-border-secondary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "var(--ant-color-text-secondary)" }}>Показано {paged.length} из {filtered.length} веток</span>
            <Button size="small" icon={<DownloadOutlined />} onClick={() => {
              const headers = ["Проект", "Ветка", "Статус", "Последний коммит", "Дней назад", "Дифф", "Автор", "Защищена"];
              const rows = filtered.map((r: any) => {
                const d = r.last_commit_date ? new Date(r.last_commit_date) : null;
                const daysAgo = r.daysAgo ?? 0;
                const diff = (r.last_commit_additions || 0) > 0 || (r.last_commit_deletions || 0) > 0
                  ? `+${r.last_commit_additions || 0} -${r.last_commit_deletions || 0}` : "N/A";
                const status = r.merged ? "замержена" : r.default ? "основная" : r.protected ? "защищена" : daysAgo > 90 ? "заброшена" : "активная";
                return [r.project_label, r.name, status, d ? d.toLocaleDateString() : "N/A", daysAgo, diff, r.display_author, r.protected ? "да" : "нет"];
              });
              downloadCsv("branches.csv", headers, rows);
            }}>CSV</Button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--ant-color-text-secondary)" }}>Страница</span>
            <Select size="small" style={{ width: 80 }} value={page} onChange={setPage}
              options={Array.from({ length: Math.ceil(filtered.length / pageSize) }, (_, i) => ({ value: i + 1, label: `${i + 1}` }))} />
            <span style={{ fontSize: 13, color: "var(--ant-color-text-secondary)" }}>из {Math.ceil(filtered.length / pageSize)}</span>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 20px", marginTop: 16, background: "var(--ant-color-fill-secondary)", borderRadius: 12, border: "1px solid var(--ant-color-border-secondary)" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ant-color-text)", marginBottom: 10 }}>Легенда</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px", fontSize: 12, color: "var(--ant-color-text-secondary)" }}>
          <div><b style={{ color: "var(--ant-color-text)" }}>Основная</b> — дефолтная ветка проекта (main/master)</div>
          <div><b style={{ color: "#FFB020" }}>Защищена</b> — ветка с правилами защиты в GitLab</div>
          <div><b style={{ color: "var(--ant-color-text)" }}>Последний коммит</b> — дата + сколько дней назад. Цвет: зелёный (&lt;30д), жёлтый (30-90д), красный (&gt;90д)</div>
          <div><b style={{ color: "var(--ant-color-text)" }}>Жизнь ветки</b> — сколько дней существует ветка (от первого до последнего коммита)</div>
          <div><b style={{ color: "var(--ant-color-text)" }}>Ср. дн. без коммита</b> — среднее количество дней с момента последнего коммита по всем веткам</div>
          <div><b style={{ color: "var(--ant-color-text)" }}>Здоровье проекта</b> — % заброшенных веток. Зелёный (&lt;20%), жёлтый (20-50%), красный (&gt;50%)</div>
          <div><b style={{ color: "var(--ant-color-text)" }}>Прогресс-бар</b> — показывает соотношение активных / заброшенных / замерженных веток</div>
        </div>
      </div>
    </div>
  );
});
