import { useState, useEffect, useMemo } from "react";
import { Card, Row, Col, Statistic, Select, Button, Tag, message, Spin, Empty } from "antd";
import { DatabaseOutlined, ReloadOutlined, DownloadOutlined } from "@ant-design/icons";
import { Line, Pie } from "@ant-design/charts";
import { fetchProjects } from "../../api/client";
import { collectPipelines } from "../../api/pipeline-client";
import { chartColors } from "../../utils/chartTheme";
import type { ProjectConfig, Role } from "../../types";
import type { GlobalFilters } from "../GlobalFilterBar";

interface Props { userRole: Role; filters: GlobalFilters; }

function downloadCsv(filename: string, headers: string[], rows: any[][]) {
  const bom = "\uFEFF";
  const csv = [headers.join(";"), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"))].join("\n");
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const PIE_COLORS = ["#3f8600", "#cf1322", "#1677ff", "#d4b106", "#722ed1"];

export function PipelineDashboard({ userRole, filters }: Props) {
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [data, setData] = useState<any>(null);

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data!); }); }, []);

  const effectiveProjectIds = useMemo(() => {
    if (filters.tags.length === 0) return filters.projectIds;
    const tagIds = projects.filter((p) => p.tags?.some((t) => filters.tags.includes(t))).map((p) => p.id);
    return [...new Set([...filters.projectIds, ...tagIds])];
  }, [filters.projectIds, filters.tags, projects]);

  const loadData = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (effectiveProjectIds.length > 0) qs.set("project_ids", effectiveProjectIds.join(","));
      if (filters.dateFrom) qs.set("date_from", filters.dateFrom);
      if (filters.dateTo) qs.set("date_to", filters.dateTo);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/v1/pipelines${qs.toString() ? "?" + qs.toString() : ""}`, { headers: { Authorization: `Bearer ${token}` } });
      const r = await res.json();
      if (r.ok) setData(r.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [effectiveProjectIds, filters.dateFrom, filters.dateTo]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const ids = effectiveProjectIds.length > 0 ? effectiveProjectIds : projects.map((p) => p.id);
      for (const id of ids) {
        const res = await collectPipelines(id);
        if (res.ok) message.success(`Проект ${id}: ${res.data!.total} пайплайнов`);
        else message.error(res.error!);
      }
      loadData();
    } finally { setCollecting(false); }
  };

  const cc = chartColors();

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #722ed1 0%, #13c2c2 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>CI/CD Пайплайны <span style={{ fontSize: 14, background: "rgba(255,255,255,0.2)", padding: "2px 10px", borderRadius: 10, verticalAlign: "middle" }}>Бэта</span></h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Длительность, успешность и распределение пайплайнов</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {userRole === "admin" && <Button type="primary" icon={<DatabaseOutlined />} loading={collecting} onClick={handleCollect} style={{ background: "#722ed1" }}>Собрать</Button>}
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
        {data && <Button size="small" icon={<DownloadOutlined />} onClick={() => {
          const headers = ["Статус", "Кол-во", "Успешность %"];
          const s = data.summary;
          const rows = [
            ["Всего", s.total, ""],
            ["Успешно", s.success, s.total > 0 ? Math.round(s.success / s.total * 100) + "%" : "0%"],
            ["Провалено", s.failed, s.total > 0 ? Math.round(s.failed / s.total * 100) + "%" : "0%"],
            ["Ср. длительность (сек)", s.avg_duration ?? "N/A", ""],
            ["Мин. длительность (сек)", s.min_duration ?? "N/A", ""],
            ["Макс. длительность (сек)", s.max_duration ?? "N/A", ""],
          ];
          downloadCsv("pipelines_summary.csv", headers, rows);
        }}>CSV</Button>}
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div> : data && (
        <>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={4}><Card><Statistic title="Всего" value={data.summary.total} /></Card></Col>
            <Col span={4}><Card><Statistic title="Успешно" value={data.summary.success} valueStyle={{ color: "#3f8600" }} /></Card></Col>
            <Col span={4}><Card><Statistic title="Провалено" value={data.summary.failed} valueStyle={{ color: "#cf1322" }} /></Card></Col>
            <Col span={4}><Card><Statistic title="Выполняется" value={data.summary.running} valueStyle={{ color: "#1677ff" }} /></Card></Col>
            <Col span={4}><Card><Statistic title="Ср. время (сек)" value={data.summary.avg_duration ?? "N/A"} /></Card></Col>
            <Col span={4}><Card><Statistic title="Макс. время (сек)" value={data.summary.max_duration ?? "N/A"} /></Card></Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={14}>
              <Card title="Пайплайны по дням" size="small">
                {data.byDay.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <Line
                    data={data.byDay.flatMap((d: any) => [
                      { date: d.date, count: d.success, type: "Успешно" },
                      { date: d.date, count: d.failed, type: "Провалено" },
                    ])}
                    xField="date" yField="count" colorField="type"
                    point={{ size: 3 }} style={{ lineWidth: 2 }}
                    axis={{
                      x: { labelAutoRotate: true, labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
                      y: { labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
                    }}
                    scale={{ color: { range: ["#3f8600", "#cf1322"] } }}
                    tooltip={{ title: "date", items: [{ field: "count", name: "Количество" }] }}
                  />
                )}
              </Card>
            </Col>
            <Col span={10}>
              <Card title="Статус пайплайнов" size="small">
                {data.summary.total === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <div style={{ height: 260 }}>
                    <Pie
                      data={[
                        { type: "Успешно", value: data.summary.success },
                        { type: "Провалено", value: data.summary.failed },
                        { type: "Выполняется", value: data.summary.running },
                        { type: "Отменено", value: data.summary.canceled || 0 },
                      ].filter((d) => d.value > 0)}
                      angleField="value" colorField="type" radius={0.9} innerRadius={0.55}
                      color={PIE_COLORS}
                      label={false as const}
                      legend={{ color: { position: "bottom", layout: { justifyContent: "center" }, itemLabelFontSize: 11, itemLabelFill: cc.secondaryText } }}
                      statistic={false}
                      tooltip={{ title: "type", items: [{ field: "value", name: "Количество" }] }}
                      height={260}
                    />
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card title="Пайплайны по проектам (top 10)" size="small">
                {data.byProject.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <div>
                    {data.byProject.map((p: any) => (
                      <div key={p.label} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                          <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{p.label}{p.tags?.length > 0 && <Tag style={{ marginLeft: 6, fontSize: 10 }}>{p.tags.join(", ")}</Tag>}</span>
                          <span style={{ color: "var(--ant-color-textSecondary)" }}>{p.total} ({p.avgDuration || 0}с)</span>
                        </div>
                        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ width: `${p.total > 0 ? (p.success / p.total * 100) : 0}%`, background: "#3f8600" }} />
                          <div style={{ width: `${p.total > 0 ? (p.failed / p.total * 100) : 0}%`, background: "#cf1322" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card title="Длительность пайплайнов" size="small">
                {data.durationDistribution ? (
                  <div>
                    {[
                      { label: "< 1 мин", value: data.durationDistribution.under_1min, color: "#3f8600" },
                      { label: "1–5 мин", value: data.durationDistribution.min_1_5, color: "#667eea" },
                      { label: "5–15 мин", value: data.durationDistribution.min_5_15, color: "#d4b106" },
                      { label: "15–60 мин", value: data.durationDistribution.min_15_60, color: "#fa8c16" },
                      { label: "> 1 час", value: data.durationDistribution.over_1hour, color: "#cf1322" },
                    ].map((d) => {
                      const total = (data.summary.success || 1);
                      const pct = Math.round(d.value / total * 100);
                      return (
                        <div key={d.label} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                            <span style={{ fontWeight: 500 }}>{d.label}</span>
                            <span style={{ color: "var(--ant-color-textSecondary)" }}>{d.value} ({pct}%)</span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, overflow: "hidden", background: "var(--ant-color-fill-secondary)" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: d.color, borderRadius: 4 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
              </Card>
            </Col>
          </Row>

          <Card title="Пайплайны по веткам (top 10)" size="small">
            {data.byRef.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div>
                {data.byRef.map((r: any) => (
                  <div key={r.ref} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 500 }}><code>{r.ref}</code></span>
                      <span style={{ color: "var(--ant-color-textSecondary)" }}>{r.total}</span>
                    </div>
                    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${r.total > 0 ? (r.success / r.total * 100) : 0}%`, background: "#3f8600" }} />
                      <div style={{ width: `${r.total > 0 ? (r.failed / r.total * 100) : 0}%`, background: "#cf1322" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
