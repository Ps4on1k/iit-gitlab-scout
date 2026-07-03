import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Card, Spin, Empty, Button } from "antd";
import { ReloadOutlined, RocketOutlined } from "@ant-design/icons";
import { fetchProjects, fetchDeployReliability, type DeployReliabilityEntry } from "../../api/client";
import type { ProjectConfig } from "../../types";
import type { GlobalFilters } from "../GlobalFilterBar";

interface Props {
  filters: GlobalFilters;
  onContributorClick?: (name: string) => void;
}

export const DeployReliabilityDashboard = memo(function DeployReliabilityDashboard({ filters, onContributorClick }: Props) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [deployData, setDeployData] = useState<DeployReliabilityEntry[]>([]);

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data!); }); }, []);

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

  return (
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ background: "linear-gradient(135deg, #21B573 0%, #3A8DFF 100%)", color: "#fff", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Надёжность деплоя</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Как часто коммиты контрибуторов доходят до успешного деплоя</div>
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
            <div style={{ fontSize: 12, color: "var(--ant-color-textSecondary)" }}>
              <b>Deploy Success Rate</b> — % успешных pipeline из запущенных. Выше 80% — стабильный деплой.
              <b style={{ marginLeft: 16 }}>Pipeline Coverage</b> — % MR, для которых запускался pipeline.
            </div>
          </Card>

          <Card title={<span><RocketOutlined /> Топ контрибьюторов по надёжности деплоя</span>} size="small">
            <div style={{ maxHeight: 600, overflow: "auto" }}>
              {deployData.map((d, i) => {
                const barWidth = deployData[0]?.successful_pipelines ? (d.successful_pipelines / deployData[0].successful_pipelines) * 100 : 0;
                return (
                  <div key={d.email} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
                    <span style={{ width: 28, textAlign: "center", fontWeight: 700, color: i < 3 ? ["#faad14", "#8c8c8c", "#d48806"][i] : "#999", fontSize: 14 }}>
                      {i < 3 ? ["★", "●", "◆"][i] : `${i + 1}`}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#3A8DFF" }} onClick={() => onContributorClick?.(d.email)}>
                          {d.name}
                          {d.email && d.name !== d.email && <span style={{ fontWeight: 400, color: "var(--ant-color-textSecondary)", fontSize: 12, marginLeft: 6 }}>{d.email}</span>}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--ant-color-textSecondary)" }}>
                          {d.successful_pipelines}/{d.completed_pipelines} успешных pipeline
                        </span>
                      </div>
                      <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "var(--ant-color-fill-secondary)", marginBottom: 4 }}>
                        <div style={{ width: `${barWidth}%`, background: "linear-gradient(90deg, #21B573, #3A8DFF)", borderRadius: 5 }} />
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--ant-color-textSecondary)" }}>
                        <span>MR: <b>{d.total_merged_mrs}</b></span>
                        <span>Pipeline: <b>{d.total_pipelines}</b></span>
                        <span>Success: <b style={{ color: d.deploy_success_rate >= 80 ? "#21B573" : d.deploy_success_rate >= 50 ? "#FFB020" : "#E5484D" }}>{d.deploy_success_rate}%</b></span>
                        <span>Coverage: <b>{d.pipeline_coverage_rate}%</b></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
});
