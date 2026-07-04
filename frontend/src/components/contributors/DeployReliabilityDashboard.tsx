import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Card, Spin, Empty, Button, Table } from "antd";
import { ReloadOutlined, RocketOutlined } from "@ant-design/icons";
import { fetchProjects, fetchDeployReliability, fetchMetricWeights, type DeployReliabilityEntry } from "../../api/client";
import type { ProjectConfig } from "../../types";
import type { GlobalFilters } from "../GlobalFilterBar";

function computeScore(d: DeployReliabilityEntry, weights?: Record<string, number>): number {
  const quality = d.deploy_success_rate;
  const consistency = d.pipeline_coverage_rate;
  const volume = Math.min(d.successful_pipelines, 100);
  const w = {
    successRate: weights?.successRate ?? 50,
    coverage: weights?.coverage ?? 30,
    volume: weights?.volume ?? 20,
  };
  const total = w.successRate + w.coverage + w.volume;
  return Math.round(((quality * w.successRate + consistency * w.coverage + volume * w.volume) / total) * 10) / 10;
}

interface Props {
  filters: GlobalFilters;
  onContributorClick?: (name: string) => void;
}

export const DeployReliabilityDashboard = memo(function DeployReliabilityDashboard({ filters, onContributorClick }: Props) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [deployData, setDeployData] = useState<DeployReliabilityEntry[]>([]);
  const [deployWeights, setDeployWeights] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchProjects().then((r) => { if (r.ok) setProjects(r.data!); });
    fetchMetricWeights().then((r) => { if (r.ok && r.data?.deploy_reliability) setDeployWeights(r.data.deploy_reliability); });
  }, []);

  const effectiveProjectIds = useMemo(() => {
    if (filters.tags.length === 0) return filters.projectIds;
    const tagIds = projects.filter((p) => p.tags?.some((t) => filters.tags.includes(t))).map((p) => p.id);
    return [...new Set([...filters.projectIds, ...tagIds])];
  }, [filters.projectIds, filters.tags, projects]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const contribs = filters.contributors.length > 0 ? filters.contributors.join(",") : undefined;
      const r = await fetchDeployReliability(effectiveProjectIds.length > 0 ? effectiveProjectIds : undefined, filters.dateFrom, filters.dateTo, contribs);
      if (r.ok) setDeployData(r.data!);
    } finally { setLoading(false); }
  }, [effectiveProjectIds, filters.dateFrom, filters.dateTo, filters.contributors]);

  useEffect(() => { loadData(); }, [loadData]);

  const sortedData = useMemo(() => {
    return [...deployData]
      .map((d) => ({ ...d, _score: computeScore(d, deployWeights) }))
      .sort((a, b) => b._score - a._score);
  }, [deployData, deployWeights]);

  return (
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ background: "linear-gradient(135deg, #21B573 0%, #3A8DFF 100%)", color: "#fff", padding: "14px 24px", borderRadius: "12px", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Надёжность деплоя</h1>
        <div style={{ opacity: 0.9, fontSize: 13 }}>Как часто коммиты контрибуторов доходят до успешного деплоя</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div> : deployData.length === 0 ? (
        <Empty description="Нет данных о деплоях. Соберите данные на вкладке Коммиты или CI/CD." />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            {[
              { label: "Всего MR", value: deployData.reduce((s, d) => s + d.total_merged_mrs, 0), color: "#3A8DFF" },
              { label: "Запусков pipeline", value: deployData.reduce((s, d) => s + d.total_pipelines, 0), color: "#B8A8D8" },
              { label: "Успешных деплоев", value: deployData.reduce((s, d) => s + d.successful_pipelines, 0), color: "#21B573" },
              { label: "Провалов деплоя", value: deployData.reduce((s, d) => s + d.failed_pipelines, 0), color: "#E5484D" },
            ].map((s) => (
              <Card key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "var(--ant-color-textSecondary)" }}>{s.label}</div>
              </Card>
            ))}
          </div>

          <Card size="small" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--ant-color-textSecondary)", lineHeight: 1.8 }}>
              <b>Рейтинг</b> — составной скор: <code>Success Rate × {deployWeights.successRate ?? 50}% + Coverage × {deployWeights.coverage ?? 30}% + min(Successful, 100) × {deployWeights.volume ?? 20}%</code>.
              Учитывает качество (доля успешных), стабильность (охват MR pipeline) и объём (количество успешных деплоев, до 100).
              <span style={{ marginLeft: 16 }}><b>Deploy Success Rate</b> — % успешных pipeline из завершённых.</span>
              <span style={{ marginLeft: 16 }}><b>Pipeline Coverage</b> — % MR с запущенным pipeline.</span>
            </div>
          </Card>

          <Card title={<span><RocketOutlined /> Рейтинг контрибьюторов по надёжности деплоя</span>} size="small">
            <Table
              dataSource={sortedData}
              rowKey="email"
              size="small"
              pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"], showTotal: (total) => `Всего: ${total}` }}
              columns={[
                {
                  title: "#",
                  width: 50,
                  render: (_: any, __: any, i: number) => (
                    <span style={{ fontWeight: 700, color: i < 3 ? ["#faad14", "#8c8c8c", "#d48806"][i] : "#999" }}>
                      {i < 3 ? ["★", "●", "◆"][i] : i + 1}
                    </span>
                  ),
                },
                {
                  title: "Контрибьютор",
                  dataIndex: "name",
                  sorter: (a: any, b: any) => a.name.localeCompare(b.name),
                  render: (name: string, record: any) => (
                    <span style={{ cursor: "pointer", color: "#3A8DFF", fontWeight: 600 }} onClick={() => onContributorClick?.(record.email)}>
                      {name}
                      {record.email && name !== record.email && <span style={{ fontWeight: 400, color: "var(--ant-color-textSecondary)", fontSize: 12, marginLeft: 6 }}>{record.email}</span>}
                    </span>
                  ),
                },
                {
                  title: "Score",
                  dataIndex: "_score",
                  width: 70,
                  defaultSortOrder: "descend" as const,
                  sorter: (a: any, b: any) => a._score - b._score,
                  render: (v: number) => <span style={{ fontWeight: 700, color: v >= 70 ? "#21B573" : v >= 40 ? "#FFB020" : "#E5484D" }}>{v}</span>,
                },
                {
                  title: "MR",
                  dataIndex: "total_merged_mrs",
                  width: 70,
                  sorter: (a: DeployReliabilityEntry, b: DeployReliabilityEntry) => a.total_merged_mrs - b.total_merged_mrs,
                },
                {
                  title: "Pipeline",
                  dataIndex: "total_pipelines",
                  width: 70,
                  sorter: (a: DeployReliabilityEntry, b: DeployReliabilityEntry) => a.total_pipelines - b.total_pipelines,
                },
                {
                  title: "Успешн.",
                  dataIndex: "successful_pipelines",
                  width: 80,
                  sorter: (a: DeployReliabilityEntry, b: DeployReliabilityEntry) => a.successful_pipelines - b.successful_pipelines,
                },
                {
                  title: "Провалы",
                  dataIndex: "failed_pipelines",
                  width: 75,
                  sorter: (a: DeployReliabilityEntry, b: DeployReliabilityEntry) => a.failed_pipelines - b.failed_pipelines,
                  render: (v: number) => <span style={{ color: v > 0 ? "#E5484D" : undefined }}>{v}</span>,
                },
                {
                  title: "Success Rate",
                  dataIndex: "deploy_success_rate",
                  width: 100,
                  sorter: (a: DeployReliabilityEntry, b: DeployReliabilityEntry) => a.deploy_success_rate - b.deploy_success_rate,
                  render: (v: number) => (
                    <span style={{ color: v >= 80 ? "#21B573" : v >= 50 ? "#FFB020" : "#E5484D", fontWeight: 600 }}>{v}%</span>
                  ),
                },
                {
                  title: "Coverage",
                  dataIndex: "pipeline_coverage_rate",
                  width: 90,
                  sorter: (a: DeployReliabilityEntry, b: DeployReliabilityEntry) => a.pipeline_coverage_rate - b.pipeline_coverage_rate,
                  render: (v: number) => <span style={{ fontWeight: 500 }}>{v}%</span>,
                },
              ]}
            />
          </Card>
        </>
      )}
    </div>
  );
});
