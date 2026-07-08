import { useState, useEffect, useMemo } from "react";
import { Card, Row, Col, Statistic, Select, Spin, Empty, Tooltip } from "antd";
import { RocketOutlined, ClockCircleOutlined, WarningOutlined, ThunderboltOutlined, LinkOutlined } from "@ant-design/icons";
import { Line, Column } from "@ant-design/charts";
import { fetchProjects, fetchDoraMetrics } from "../../api/client";
import { getProjectUrl } from "../../utils/projectUrl";
import { chartColors } from "../../utils/chartTheme";
import type { ProjectConfig } from "../../types";
import type { GlobalFilters } from "../GlobalFilterBar";

interface Props { filters: GlobalFilters; onParamChange?: (key: string, value: string | undefined) => void; tabParams?: Record<string, string>; }

const CARD_STYLE = { height: "100%" as const };

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  if (seconds < 60) return `${seconds}с`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}мин`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}ч ${m}мин`;
}

function formatMttr(minutes: number): string {
  if (minutes === 0) return "—";
  if (minutes < 60) return `${Math.round(minutes)}мин`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}ч ${m}мин`;
}

function rateColor(rate: number): string {
  if (rate <= 5) return "#21B573";
  if (rate <= 15) return "#FFB020";
  return "#E5484D";
}

function freqColor(freq: number): string {
  if (freq >= 1) return "#21B573";
  if (freq >= 0.1) return "#FFB020";
  return "#E5484D";
}

function leadTimeColor(seconds: number): string {
  if (seconds < 3600) return "#21B573";
  if (seconds < 86400) return "#FFB020";
  return "#E5484D";
}

export function DoraDashboard({ filters, onParamChange, tabParams }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<string | undefined>(tabParams?.dora_env);
  const [granularity, setGranularity] = useState<"day" | "week">(tabParams?.dora_granularity as "day" | "week" || "day");
  const cc = chartColors();

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data!); }); }, []);

  const projectIds = useMemo(() => {
    if (filters.projectIds.length > 0) return filters.projectIds;
    if (filters.tags.length > 0) {
      return projects.filter((p) => p.tags?.some((t) => filters.tags.includes(t))).map((p) => p.id);
    }
    return projects.map((p) => p.id);
  }, [filters.projectIds, filters.tags, projects]);

  const loadData = async () => {
    setLoading(true);
    const res = await fetchDoraMetrics(
      projectIds.length > 0 ? projectIds : undefined,
      selectedEnv || "__all__",
      filters.dateFrom,
      filters.dateTo
    );
    if (res.ok) setData(res.data);
    setLoading(false);
  };

  useEffect(() => { if (projectIds.length > 0 || projects.length > 0) loadData(); }, [projectIds, selectedEnv, filters.dateFrom, filters.dateTo]);

  const projectMap = useMemo(() => {
    const m = new Map<string, { base_url: string; path: string }>();
    for (const p of projects) m.set(p.label, { base_url: p.base_url, path: p.path });
    return m;
  }, [projects]);

  if (loading && !data) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;

  const s = data?.summary;
  const trend = data?.trend || [];
  const chartData = granularity === "week" ? (data?.weeklyTrend || []) : (data?.dailyTrend || []);
  const byProject = data?.byProject || [];
  const environments = data?.environments || [];

  const deployChartData = chartData.flatMap((d: any) => [
    { date: d.date, count: d.success, type: "Успешные" },
    { date: d.date, count: d.failed, type: "Провалены" },
  ]);

  const leadTimeData = chartData.filter((d: any) => d.avgLeadTimeSec !== null).map((d: any) => ({
    date: d.date, value: d.avgLeadTimeSec, label: formatDuration(d.avgLeadTimeSec),
  }));

  const mttrData = chartData.filter((d: any) => d.avgMttrMin !== null).map((d: any) => ({
    date: d.date, value: d.avgMttrMin, label: formatMttr(d.avgMttrMin),
  }));

  const axisStyle = {
    x: { labelAutoRotate: true, labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
    y: { labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
  };

  return (
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ background: "linear-gradient(135deg, #2A3A5A 0%, #3A4A6A 100%)", color: "#E8ECF1", padding: "14px 24px", borderRadius: "12px", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>DORA метрики</h1>
        <div style={{ opacity: 0.9, fontSize: 13 }}>Key metrics for measuring software delivery performance</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Select placeholder="Окружение" allowClear style={{ width: 200 }} value={selectedEnv} onChange={(v) => { setSelectedEnv(v); onParamChange?.("dora_env", v); }}>
          <Select.Option key="__all__" value="__all__">Все окружения</Select.Option>
          {environments.map((e: string) => <Select.Option key={e} value={e}>{e}</Select.Option>)}
        </Select>
        <Select value={granularity} onChange={(v) => { setGranularity(v); onParamChange?.("dora_granularity", v); }} style={{ width: 160 }}>
          <Select.Option value="day">По дням</Select.Option>
          <Select.Option value="week">По неделям</Select.Option>
        </Select>
      </div>

      {s && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card style={CARD_STYLE}>
                <Statistic title={<span>Частота деплоев <Tooltip title="Среднее кол-во деплоев в день"><ThunderboltOutlined /></Tooltip></span>}
                  value={s.deployFrequency} suffix="в день" valueStyle={{ color: freqColor(s.deployFrequency) }} prefix={<RocketOutlined />} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={CARD_STYLE}>
                <Statistic title={<span>Lead Time <Tooltip title="Время от коммита до деплоя"><ClockCircleOutlined /></Tooltip></span>}
                  value={formatDuration(s.avgLeadTimeSec)} valueStyle={{ color: leadTimeColor(s.avgLeadTimeSec) }} prefix={<ClockCircleOutlined />} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={CARD_STYLE}>
                <Statistic title={<span>Процент сбоев <Tooltip title="% деплоев, вызвавших ошибку"><WarningOutlined /></Tooltip></span>}
                  value={s.failureRate} suffix="%" valueStyle={{ color: rateColor(s.failureRate) }} prefix={<WarningOutlined />} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={CARD_STYLE}>
                <Statistic title="MTTR (время восстановления)" value={formatMttr(s.avgMttrMin)}
                  valueStyle={{ color: s.avgMttrMin <= 60 ? "#21B573" : s.avgMttrMin <= 360 ? "#FFB020" : "#E5484D" }} />
              </Card>
            </Col>
          </Row>

          <Row gutter={12} style={{ marginBottom: 16 }} align="stretch">
            <Col span={4}><Card size="small"><Statistic title="Всего" value={s.total} /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="Успешных" value={s.success} valueStyle={{ color: "#21B573" }} /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="Провалено" value={s.failed} valueStyle={{ color: "#E5484D" }} /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="Отменено" value={s.canceled} valueStyle={{ color: "#999" }} /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="Другие" value={s.other || 0} valueStyle={{ color: "#999" }}
              suffix={<span style={{ fontSize: 11, color: "var(--ant-color-textTertiary)" }}>({s.total > 0 ? Math.round(((s.total - s.success - s.failed - s.canceled) / s.total) * 100) : 0}%)</span>} /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="Ср. деплоев/день" value={s.deployFrequency} /></Card></Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16, minHeight: 500 }}>
            <Col span={16}>
              <Card title="Деплои" size="small" style={{ height: "100%" }}
                extra={<span style={{ fontSize: 10, color: "var(--ant-color-textTertiary)" }}>успешные / провалены</span>}>
                {deployChartData.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных о деплоях" /> : (
                  <div style={{ height: "calc(100% - 40px)" }}>
                    <Column data={deployChartData} xField="date" yField="count" colorField="type"
                      stack={true} style={{ radiusTopLeft: 2, radiusTopRight: 2 }}
                      axis={axisStyle}
                      scale={{ color: { range: ["#21B573", "#E5484D"] } }}
                      tooltip={{ title: "date", items: [{ field: "count", name: "Кол-во" }] }}
                      legend={{ color: { position: "top", layout: { justifyContent: "center" }, itemLabelFontSize: 11, itemLabelFill: cc.secondaryText } }}
                      autoFit
                    />
                  </div>
                )}
              </Card>
            </Col>
            <Col span={8}>
              <Card title="По проектам (top 10)" size="small" style={{ height: "100%" }}
                extra={<span style={{ fontSize: 10, color: "var(--ant-color-textTertiary)" }}>всего / (% успеха)</span>}>
                {byProject.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <div>
                    {byProject.map((p: any) => {
                      const pct = p.total > 0 ? Math.round(p.success / p.total * 100) : 0;
                      return (
                        <div key={p.label} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{p.label}{projectMap.has(p.label) && <a href={getProjectUrl(projectMap.get(p.label)!.base_url, projectMap.get(p.label)!.path)} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4, color: "var(--ant-color-textTertiary)", fontSize: 11 }}><LinkOutlined /></a>}</span>
                            <span style={{ color: "var(--ant-color-textSecondary)" }}>{p.total} ({pct}%)</span>
                          </div>
                          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, background: "#21B573" }} />
                            {p.failed > 0 && <div style={{ width: `${p.total > 0 ? (p.failed / p.total * 100) : 0}%`, background: "#E5484D" }} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card title="Lead Time (динамика)" size="small" style={CARD_STYLE}
                extra={<span style={{ fontSize: 10, color: "var(--ant-color-textTertiary)" }}>коммит → деплой</span>}>
                {leadTimeData.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных" /> : (
                  <div style={{ height: 200 }}>
                    <Line data={leadTimeData} xField="date" yField="value"
                      point={{ size: 3 }} style={{ lineWidth: 2, stroke: "#3A8DFF" }}
                      axis={axisStyle}
                      tooltip={{ title: "date", items: [{ field: "value", name: "Lead Time", valueFormatter: (v: any) => formatDuration(v) }] }}
                      legend={false}
                    />
                  </div>
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card title="MTTR (динамика)" size="small" style={CARD_STYLE}
                extra={<span style={{ fontSize: 10, color: "var(--ant-color-textTertiary)" }}>сбой → восстановление</span>}>
                {mttrData.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных" /> : (
                  <div style={{ height: 200 }}>
                    <Line data={mttrData} xField="date" yField="value"
                      point={{ size: 3 }} style={{ lineWidth: 2, stroke: "#E5484D" }}
                      axis={axisStyle}
                      tooltip={{ title: "date", items: [{ field: "value", name: "MTTR", valueFormatter: (v: any) => formatMttr(v) }] }}
                      legend={false}
                    />
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Card size="small" title="Легенда DORA-метрик">
                <Row gutter={24}>
                  <Col span={6}>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 4 }}><b>Частота деплоев</b></div>
                      <div style={{ color: "var(--ant-color-textTertiary)", lineHeight: 1.5 }}>
                        <b>Формула:</b> Всего деплоев / Кол-во дней в периоде.<br />
                        <b>Данные:</b> таблица <code>project_deployments</code>, статус = success.<br />
                        <b>Уровни:</b> <b style={{ color: "#21B573" }}>Elite</b> ≥1/день, <b style={{ color: "#FFB020" }}>High</b> ≥1/неделю, <b style={{ color: "#E5484D" }}>Low</b> ≥1/месяц.
                      </div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 4 }}><b>Lead Time for Changes</b></div>
                      <div style={{ color: "var(--ant-color-textTertiary)", lineHeight: 1.5 }}>
                        <b>Формула:</b> Среднее(deploy.created_at − commit.committed_date) для успешных деплоев.<br />
                        <b>Данные:</b> из <code>raw_json.deployable.commit.committed_date</code> и <code>created_at</code>.<br />
                        <b>Уровни:</b> <b style={{ color: "#21B573" }}>Elite</b> &lt;1ч, <b style={{ color: "#FFB020" }}>High</b> &lt;1день, <b style={{ color: "#E5484D" }}>Low</b> &lt;1неделю.
                      </div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 4 }}><b>Change Failure Rate</b></div>
                      <div style={{ color: "var(--ant-color-textTertiary)", lineHeight: 1.5 }}>
                        <b>Формула:</b> Кол-во failed деплоев × 100 / Всего деплоев.<br />
                        <b>Данные:</b> <code>status = 'failed'</code> или <code>pipeline_status = 'failed'</code>.<br />
                        <b>Уровни:</b> <b style={{ color: "#21B573" }}>Elite</b> 0–15%, <b style={{ color: "#FFB020" }}>High</b> 16–30%, <b style={{ color: "#E5484D" }}>Low</b> &gt;30%.
                      </div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 4 }}><b>MTTR (Mean Time to Restore)</b></div>
                      <div style={{ color: "var(--ant-color-textTertiary)", lineHeight: 1.5 }}>
                        <b>Формула:</b> Среднее время от failed деплоя до следующего success деплоя.<br />
                        <b>Данные:</b> пары failed→success в хронологическом порядке, разница в минутах.<br />
                        <b>Уровни:</b> <b style={{ color: "#21B573" }}>Elite</b> &lt;1ч, <b style={{ color: "#FFB020" }}>High</b> &lt;1день, <b style={{ color: "#E5484D" }}>Low</b> &gt;1неделя.
                      </div>
                    </div>
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
