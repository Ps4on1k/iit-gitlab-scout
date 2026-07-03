import { useState, useEffect, useMemo } from "react";
import { Card, Row, Col, Statistic, Select, Button, Tag, message, Spin, Empty, Switch, Tooltip } from "antd";
import { DatabaseOutlined, ReloadOutlined, DownloadOutlined, SwapOutlined } from "@ant-design/icons";
import { Line, Pie } from "@ant-design/charts";
import { fetchProjects } from "../../api/client";
import { collectPipelines } from "../../api/pipeline-client";
import { chartColors } from "../../utils/chartTheme";
import { delay } from "../../utils/collect";
import { CollectButton } from "../common/CollectButton";
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

function formatDuration(secs: number | null): string {
  if (secs === null || secs === undefined) return "N/A";
  if (secs < 60) return `${secs}с`;
  if (secs < 3600) return `${Math.floor(secs / 60)}м ${secs % 60}с`;
  return `${Math.floor(secs / 3600)}ч ${Math.floor((secs % 3600) / 60)}м`;
}

export function PipelineDashboard({ userRole, filters }: Props) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [data, setData] = useState<any>(null);
  const [useMedian, setUseMedian] = useState(false);

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
      if (useMedian) qs.set("use_median", "1");
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/v1/pipelines${qs.toString() ? "?" + qs.toString() : ""}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const r = await res.json();
      if (r.ok) setData(r.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [effectiveProjectIds, filters.dateFrom, filters.dateTo, useMedian]);

  const pipelineProjectIds = useMemo(() => effectiveProjectIds.length > 0 ? effectiveProjectIds : projects.map((p) => p.id), [effectiveProjectIds, projects]);

  const cc = chartColors();
  const successRate = data?.summary?.total > 0 ? Math.round(data.summary.success / data.summary.total * 100) : 0;

  return (
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ background: "linear-gradient(135deg, #B8A8D8 0%, #98C8D8 100%)", color: "#111315", padding: "14px 24px", borderRadius: "12px", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>CI/CD Пайплайны</h1>
        <div style={{ opacity: 0.9, fontSize: 13 }}>Длительность, успешность и стабильность процессов сборки</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {userRole === "admin" && <CollectButton collector="pipelines" projectIds={pipelineProjectIds} onComplete={loadData} color="#B8A8D8" />}
        <Tooltip title={useMedian ? "Показывать средние (mean)" : "Показывать медианы (median)"}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--ant-color-textTertiary)" }}>
            <SwapOutlined />
            <Switch size="small" checked={useMedian} onChange={setUseMedian} />
            <span>{useMedian ? "Median" : "Mean"}</span>
          </span>
        </Tooltip>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
        {data && <Button size="small" icon={<DownloadOutlined />} onClick={() => {
          const headers = ["Статус", "Кол-во", "%"];
          const s = data.summary;
          const rows = [
            ["Всего", s.total, ""],
            ["Успешно", s.success, s.total > 0 ? Math.round(s.success / s.total * 100) + "%" : "0%"],
            ["Провалено", s.failed, s.total > 0 ? Math.round(s.failed / s.total * 100) + "%" : "0%"],
            ["Ср. время", formatDuration(s.avg_duration), ""],
            ["Мин. время", formatDuration(s.min_duration), ""],
            ["Макс. время", formatDuration(s.max_duration), ""],
          ];
          downloadCsv("pipelines_summary.csv", headers, rows);
        }}>CSV</Button>}
      </div>

      {loading ? <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div> : data && (
        <>
          {/* Summary Cards with success rate */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={4}><Card style={{ height: "100%" }}><Statistic title="Всего пайплайнов" value={data.summary.total} valueStyle={{ fontSize: 24 }} /></Card></Col>
            <Col span={4}>
              <Card style={{ height: "100%" }}>
                <Statistic title="Успешно" value={data.summary.success} valueStyle={{ color: "#21B573" }} suffix={<span style={{ fontSize: 12, color: "#999" }}>({successRate}%)</span>} />
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "#f0f0f0" }}>
                    <div style={{ width: `${successRate}%`, background: "#21B573", borderRadius: 3 }} />
                  </div>
                </div>
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ height: "100%" }}>
                <Statistic title="Провалено" value={data.summary.failed} valueStyle={{ color: "#E5484D" }} suffix={<span style={{ fontSize: 12, color: "#999" }}>({data.summary.total > 0 ? Math.round(data.summary.failed / data.summary.total * 100) : 0}%)</span>} />
              </Card>
            </Col>
            <Col span={4}><Card style={{ height: "100%" }}><Statistic title="Выполняется" value={data.summary.running} valueStyle={{ color: "#3A8DFF" }} /></Card></Col>
            <Col span={4}>
              <Card style={{ height: "100%" }}>
                <Statistic title="Ср. время" value={formatDuration(data.summary.avg_duration)} />
                <div style={{ fontSize: 11, color: "var(--ant-color-textTertiary)", marginTop: 2 }}>от {formatDuration(data.summary.min_duration)} до {formatDuration(data.summary.max_duration)}</div>
              </Card>
            </Col>
            <Col span={4}>
              <Card style={{ height: "100%" }}>
                <Statistic title="Отменено" value={data.summary.canceled || 0} valueStyle={{ color: "#FFB020" }} />
              </Card>
            </Col>
          </Row>

          {/* Explanation banner */}
          <div style={{ background: "var(--ant-color-fill-secondary)", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontSize: 12, color: "var(--ant-color-textSecondary)", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>📊 <b>Успешность</b> — доля пайплайнов без ошибок. Выше 80% — стабильная сборка</span>
            <span>⏱️ <b>Длительность</b> — время от запуска до завершения пайплайна</span>
            <span>🔄 <b>Тренд</b> — следите за ростом провалов, это может указывать на проблемы с кодом</span>
          </div>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={14}>
              <Card title="Пайплайны по дням" size="small" style={{ height: "100%" }}>
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
                    scale={{ color: { range: ["#21B573", "#E5484D"] } }}
                    tooltip={{ title: "date", items: [{ field: "count", name: "Количество" }] }}
                  />
                )}
              </Card>
            </Col>
            <Col span={10}>
              <Card title="Распределение по статусу" size="small" style={{ height: "100%" }}>
                {data.summary.total === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <div>
                    <Pie
                      data={[
                        { type: "Успешно", value: data.summary.success },
                        { type: "Провалено", value: data.summary.failed },
                        { type: "Выполняется", value: data.summary.running },
                        { type: "Отменено", value: data.summary.canceled || 0 },
                      ]}
                      angleField="value" colorField="type" radius={0.9} innerRadius={0.55}
                      scale={{ color: { domain: ["Успешно", "Провалено", "Выполняется", "Отменено"], range: ["#21B573", "#E5484D", "#3A8DFF", "#FFB020"] } }}
                      label={false as const}
                      legend={{ color: { position: "bottom", layout: { justifyContent: "center" }, itemLabelFontSize: 11, itemLabelFill: cc.secondaryText } }}
                      statistic={false}
                      tooltip={{ title: "type", items: [{ field: "value", name: "Количество" }] }}
                      autoFit
                    />
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card title="Пайплайны по проектам (top 10)" size="small" style={{ height: "100%" }}>
                {data.byProject.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <div>
                    {data.byProject.map((p: any) => {
                      const pct = p.total > 0 ? Math.round(p.success / p.total * 100) : 0;
                      return (
                        <div key={p.label} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                            <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{p.label}{p.tag?.length > 0 && <Tag style={{ marginLeft: 6, fontSize: 10 }}>{p.tag.join(", ")}</Tag>}</span>
                            <span style={{ color: "var(--ant-color-textSecondary)" }}>
                              <span style={{ color: "#21B573" }}>{p.success}</span>/<span>{p.total}</span>
                              <span style={{ marginLeft: 6, color: pct >= 80 ? "#21B573" : pct >= 50 ? "#FFB020" : "#E5484D", fontWeight: 600 }}>{pct}%</span>
                              {p.avgDuration > 0 && <span style={{ marginLeft: 6, color: "var(--ant-color-textTertiary)" }}>⏱{formatDuration(p.avgDuration)}</span>}
                            </span>
                          </div>
                          <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, background: "#21B573" }} />
                            <div style={{ width: `${p.total > 0 ? (p.failed / p.total * 100) : 0}%`, background: "#E5484D" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card title="Длительность пайплайнов" size="small" style={{ height: "100%" }}>
                {data.durationDistribution ? (
                  <div>
                    <div style={{ fontSize: 12, color: "var(--ant-color-textSecondary)", marginBottom: 12 }}>
                      Распределение времени выполнения <b>успешных</b> пайплайнов
                    </div>
                    {[
                      { label: "< 1 мин", value: data.durationDistribution.under_1min, color: "#21B573", hint: "Быстрые проверки" },
                      { label: "1–5 мин", value: data.durationDistribution.min_1_5, color: "#3A8DFF", hint: "Сборка + тесты" },
                      { label: "5–15 мин", value: data.durationDistribution.min_5_15, color: "#FFB020", hint: "Полный pipeline" },
                      { label: "15–60 мин", value: data.durationDistribution.min_15_60, color: "#FFB020", hint: "Долгие сборки" },
                      { label: "> 1 час", value: data.durationDistribution.over_1hour, color: "#E5484D", hint: "Критично долгие" },
                    ].map((d) => {
                      const total = data.summary.success || 1;
                      const pct = Math.round(d.value / total * 100);
                      return (
                        <div key={d.label} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                            <span style={{ fontWeight: 500 }}>{d.label}</span>
                            <span style={{ color: "var(--ant-color-textSecondary)" }}>{d.value} ({pct}%)</span>
                          </div>
                          <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--ant-color-fill-secondary)" }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: d.color, borderRadius: 4 }} />
                          </div>
                          <div style={{ fontSize: 10, color: "var(--ant-color-textTertiary)", marginTop: 1 }}>{d.hint}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
              </Card>
            </Col>
          </Row>

          <Card title="Пайплайны по веткам (top 10)" size="small"
            extra={<span style={{ fontSize: 11, color: "var(--ant-color-textSecondary)" }}>Зелёный — успех, красный — провал</span>}>
            {data.byRef.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div>
                {data.byRef.map((r: any) => {
                  const pct = r.total > 0 ? Math.round(r.success / r.total * 100) : 0;
                  return (
                    <div key={r.ref} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                        <span style={{ fontWeight: 500 }}><code>{r.ref}</code></span>
                        <span style={{ color: "var(--ant-color-textSecondary)" }}>
                          <span style={{ color: "#21B573" }}>{r.success}</span>/<span>{r.total}</span>
                          <span style={{ marginLeft: 6, color: pct >= 80 ? "#21B573" : "#E5484D", fontWeight: 600 }}>{pct}%</span>
                        </span>
                      </div>
                      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, background: "#21B573" }} />
                        <div style={{ width: `${r.total > 0 ? (r.failed / r.total * 100) : 0}%`, background: "#E5484D" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
