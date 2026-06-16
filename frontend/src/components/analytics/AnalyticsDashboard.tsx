import { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Spin, Select, DatePicker, Empty } from "antd";
import { fetchProjects } from "../../api/client";
import { fetchContributorMetrics, fetchContributorHeatmap } from "../../api/client";
import { fetchBranches } from "../../api/client";
import { fetchIssues } from "../../api/client";
import { fetchDependencies } from "../../api/client";
import type { ProjectConfig } from "../../types";
import type { ContributorMetrics, HeatmapData } from "../../types";
import type { BranchSummary } from "../../types/analytics";
import type { IssueSummary } from "../../types/analytics";
import type { DependencySummary } from "../../types/analytics";

export function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [metrics, setMetrics] = useState<ContributorMetrics | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData>({ by_project: {}, by_contributor: {}, project_contributors: {}, by_project_contributor: {} });
  const [branchSummary, setBranchSummary] = useState<BranchSummary | null>(null);
  const [issueSummary, setIssueSummary] = useState<IssueSummary | null>(null);
  const [depSummary, setDepSummary] = useState<DependencySummary | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);

  useEffect(() => {
    fetchProjects().then((r) => { if (r.ok) setProjects(r.data as ProjectConfig[]); });
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const filters = {
        project_ids: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
      };
      const [mRes, hRes, bRes, iRes, dRes] = await Promise.all([
        fetchContributorMetrics(filters),
        fetchContributorHeatmap(filters),
        fetchBranches(selectedProjectIds.length > 0 ? selectedProjectIds : undefined),
        fetchIssues(selectedProjectIds.length > 0 ? selectedProjectIds : undefined),
        fetchDependencies(selectedProjectIds.length > 0 ? selectedProjectIds : undefined),
      ]);
      if (mRes.ok) setMetrics(mRes.data!);
      if (hRes.ok) setHeatmap(hRes.data!);
      if (bRes.ok) setBranchSummary(bRes.data!.summary);
      if (iRes.ok) setIssueSummary(iRes.data!.summary);
      if (dRes.ok) setDepSummary(dRes.data!.summary);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [selectedProjectIds]);

  const projectOptions = projects.map((p) => ({
    value: p.id,
    label: p.tag ? `${p.label} [${p.tag}]` : p.label,
  }));

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Аналитика</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Сводная статистика по всем модулям</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 30 }}>
        <Select
          mode="multiple"
          placeholder="Проекты"
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 400, maxWidth: 700 }}
          value={selectedProjectIds}
          onChange={setSelectedProjectIds}
          options={projectOptions}
          maxTagCount="responsive"
        />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>
      ) : (
        <>
          {/* Contributor Metrics */}
          <h3 style={{ fontSize: 18, color: "#333", borderLeft: "4px solid #667eea", paddingLeft: 12, marginBottom: 16 }}>Контрибьюторы</h3>
          <Row gutter={16} style={{ marginBottom: 30 }}>
            <Col span={6}><Card><Statistic title="Контрибьюторов" value={metrics?.unique_contributors || 0} /></Card></Col>
            <Col span={6}><Card><Statistic title="Всего коммитов" value={metrics?.total_commits || 0} /></Card></Col>
            <Col span={6}><Card><Statistic title="Добавлено строк" value={metrics?.total_additions || 0} valueStyle={{ color: "#3f8600" }} /></Card></Col>
            <Col span={6}><Card><Statistic title="Удалено строк" value={metrics?.total_deletions || 0} valueStyle={{ color: "#cf1322" }} /></Card></Col>
          </Row>

          {/* Branch Metrics */}
          <h3 style={{ fontSize: 18, color: "#333", borderLeft: "4px solid #667eea", paddingLeft: 12, marginBottom: 16 }}>Ветки</h3>
          <Row gutter={16} style={{ marginBottom: 30 }}>
            <Col span={6}><Card><Statistic title="Всего веток" value={branchSummary?.total || 0} /></Card></Col>
            <Col span={6}><Card><Statistic title="Активные (<90д)" value={branchSummary?.active || 0} valueStyle={{ color: "#3f8600" }} /></Card></Col>
            <Col span={6}><Card><Statistic title="Заброшенные (>90д)" value={branchSummary?.stale || 0} valueStyle={{ color: "#cf1322" }} /></Card></Col>
            <Col span={6}><Card><Statistic title="Замерженные" value={branchSummary?.merged || 0} valueStyle={{ color: "#667eea" }} /></Card></Col>
          </Row>

          {/* Issue Metrics */}
          {issueSummary && (
            <>
              <h3 style={{ fontSize: 18, color: "#333", borderLeft: "4px solid #667eea", paddingLeft: 12, marginBottom: 16 }}>Задачи</h3>
              <Row gutter={16} style={{ marginBottom: 30 }}>
                <Col span={6}><Card><Statistic title="Всего задач" value={issueSummary.total} /></Card></Col>
                <Col span={6}><Card><Statistic title="Открытых" value={issueSummary.opened} valueStyle={{ color: "#3f8600" }} /></Card></Col>
                <Col span={6}><Card><Statistic title="Закрытых" value={issueSummary.closed} valueStyle={{ color: "#cf1322" }} /></Card></Col>
                <Col span={6}><Card><Statistic title="Ср. время закрытия (дн.)" value={issueSummary.avg_days_to_close} /></Card></Col>
              </Row>
            </>
          )}

          {/* Dependency Metrics */}
          {depSummary && (
            <>
              <h3 style={{ fontSize: 18, color: "#333", borderLeft: "4px solid #667eea", paddingLeft: 12, marginBottom: 16 }}>Зависимости</h3>
              <Row gutter={16} style={{ marginBottom: 30 }}>
                <Col span={6}><Card><Statistic title="Всего зависимостей" value={depSummary.total} /></Card></Col>
                <Col span={6}><Card><Statistic title="Устаревших" value={depSummary.outdated} valueStyle={{ color: "#cf1322" }} /></Card></Col>
              </Row>
            </>
          )}

          {/* Heatmap */}
          <h3 style={{ fontSize: 18, color: "#333", borderLeft: "4px solid #667eea", paddingLeft: 12, marginBottom: 16 }}>Тепловая карта</h3>
          <div style={{ overflowX: "auto" }}>
            {Object.keys(heatmap.by_contributor).length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <div>
                  <h4 style={{ marginBottom: 12 }}>Проекты</h4>
                  {Object.entries(heatmap.by_project).map(([project, daily]) => {
                    const total = Object.values(daily).reduce((s, v) => s + v, 0);
                    return (
                      <div key={project} style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{project}</div>
                        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                          {Object.entries(daily).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => (
                            <div key={date} title={`${date}: ${count}`} style={{
                              width: 14, height: 14, borderRadius: 3,
                              background: count === 0 ? "#ebedf0" :
                                count <= 2 ? "#9be9a8" : count <= 5 ? "#40c463" : count <= 10 ? "#30a14e" : "#216e39"
                            }} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div>
                  <h4 style={{ marginBottom: 12 }}>Контрибьюторы</h4>
                  {Object.entries(heatmap.by_contributor).map(([contrib, daily]) => {
                    const total = Object.values(daily).reduce((s, v) => s + v, 0);
                    return (
                      <div key={contrib} style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{contrib}</div>
                        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                          {Object.entries(daily).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => (
                            <div key={date} title={`${date}: ${count}`} style={{
                              width: 14, height: 14, borderRadius: 3,
                              background: count === 0 ? "#ebedf0" :
                                count <= 2 ? "#9be9a8" : count <= 5 ? "#40c463" : count <= 10 ? "#30a14e" : "#216e39"
                            }} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Empty description="Нет данных. Соберите данные на вкладках." />
            )}
          </div>
        </>
      )}
    </div>
  );
}
