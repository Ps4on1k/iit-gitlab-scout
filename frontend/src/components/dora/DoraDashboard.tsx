import { useState, useEffect, useMemo } from "react";
import { Card, Row, Col, Statistic, Select, Spin, Empty, Tooltip } from "antd";
import { RocketOutlined, ClockCircleOutlined, WarningOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { fetchProjects, fetchDoraMetrics } from "../../api/client";
import { chartColors } from "../../utils/chartTheme";
import type { ProjectConfig } from "../../types";
import type { GlobalFilters } from "../GlobalFilterBar";

interface Props { filters: GlobalFilters; }

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
  if (rate <= 5) return "#3f8600";
  if (rate <= 15) return "#d4b106";
  return "#cf1322";
}

function freqColor(freq: number): string {
  if (freq >= 1) return "#3f8600";
  if (freq >= 0.1) return "#d4b106";
  return "#cf1322";
}

function leadTimeColor(seconds: number): string {
  if (seconds < 3600) return "#3f8600";
  if (seconds < 86400) return "#d4b106";
  return "#cf1322";
}

function MiniBarChart({ data, height = 120, valueKey, color, label }: {
  data: any[]; height?: number; valueKey: string; color: string; label: string;
}) {
  const vals = data.map((d: any) => d[valueKey] ?? 0);
  const maxVal = Math.max(1, ...vals);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 0, height, borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
        {data.map((d: any, i: number) => {
          const v = d[valueKey] ?? 0;
          return (
            <div key={i} title={`${d.date}: ${v} ${label}`}
              style={{ flex: 1, background: v > 0 ? color : "transparent",
                borderRadius: "2px 2px 0 0", height: `${(v / maxVal) * 100}%`, minHeight: v > 0 ? 2 : 0, minWidth: 1 }} />
          );
        })}
      </div>
      <div style={{ position: "relative", height: 18, marginTop: 2 }}>
        {data.map((d: any, i: number) => {
          const step = Math.max(1, Math.floor(data.length / 6));
          if (i % step !== 0 && i !== data.length - 1) return null;
          const leftPct = (i / Math.max(1, data.length - 1)) * 100;
          return <span key={i} style={{ position: "absolute", left: `${leftPct}%`, transform: "translateX(-50%)", fontSize: 9, color: "var(--ant-color-textTertiary)", whiteSpace: "nowrap" }}>{d.date.slice(5)}</span>;
        })}
      </div>
    </div>
  );
}

function LineChart({ data, height = 120, valueKey, color, label, unit = "" }: {
  data: any[]; height?: number; valueKey: string; color: string; label: string; unit?: string;
}) {
  const vals = data.map((d: any) => d[valueKey] ?? 0).filter((v) => v !== null);
  if (vals.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`Нет данных: ${label}`} />;
  const maxVal = Math.max(1, ...vals);
  const points = data.map((d: any, i: number) => {
    const v = d[valueKey];
    if (v === null || v === undefined) return null;
    const x = (i / Math.max(1, data.length - 1)) * 100;
    const y = 100 - (v / maxVal) * 100;
    return `${x},${y}`;
  }).filter(Boolean).join(" ");

  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        {data.map((d: any, i: number) => {
          const v = d[valueKey];
          if (v === null || v === undefined) return null;
          const cx = (i / Math.max(1, data.length - 1)) * 100;
          const cy = 100 - (v / maxVal) * 100;
          return <circle key={i} cx={`${cx}`} cy={`${cy}`} r="0.8" fill={color} opacity="0.7">
            <title>{`${d.date}: ${v}${unit}`}</title>
          </circle>;
        })}
      </svg>
      <div style={{ position: "relative", height: 18, marginTop: 2 }}>
        {data.map((d: any, i: number) => {
          const step = Math.max(1, Math.floor(data.length / 6));
          if (i % step !== 0 && i !== data.length - 1) return null;
          const leftPct = (i / Math.max(1, data.length - 1)) * 100;
          return <span key={i} style={{ position: "absolute", left: `${leftPct}%`, transform: "translateX(-50%)", fontSize: 9, color: "var(--ant-color-textTertiary)", whiteSpace: "nowrap" }}>{d.date.slice(5)}</span>;
        })}
      </div>
    </div>
  );
}

export function DoraDashboard({ filters }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<string | undefined>();
  const [granularity, setGranularity] = useState<"day" | "week">("day");
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

  if (loading && !data) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;

  const s = data?.summary;
  const trend = data?.trend || [];
  const chartData = granularity === "week" ? (data?.weeklyTrend || []) : (data?.dailyTrend || []);
  const byProject = data?.byProject || [];
  const environments = data?.environments || [];
  const maxDeploys = Math.max(1, ...trend.map((t: any) => t.total));

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #0052cc 0%, #36b37e 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>DORA Метрики</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Четыре ключевые метрики DevOps-производительности</div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Select placeholder="Окружение" allowClear style={{ width: 200 }} value={selectedEnv} onChange={setSelectedEnv}>
          <Select.Option key="__all__" value="__all__">Все окружения</Select.Option>
          {environments.map((e: string) => <Select.Option key={e} value={e}>{e}</Select.Option>)}
        </Select>
        <Select value={granularity} onChange={(v) => setGranularity(v)} style={{ width: 160 }}>
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
                  valueStyle={{ color: s.avgMttrMin <= 60 ? "#3f8600" : s.avgMttrMin <= 360 ? "#d4b106" : "#cf1322" }} />
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}><Card size="small"><Statistic title="Всего деплоев" value={s.total} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="Успешных" value={s.success} valueStyle={{ color: "#3f8600" }} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="Провалено" value={s.failed} valueStyle={{ color: "#cf1322" }} /></Card></Col>
            <Col span={6}><Card size="small"><Statistic title="Отменено" value={s.canceled} valueStyle={{ color: "#999" }} /></Card></Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={16}>
              <Card title="Деплои" size="small" style={CARD_STYLE}>
                {trend.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных о деплоях" /> : (
                  <MiniBarChart data={chartData} height={140} valueKey="deploys" color="#667eea" label="деплоев" />
                )}
              </Card>
            </Col>
            <Col span={8}>
              <Card title="По проектам (top 10)" size="small" style={{ ...CARD_STYLE, paddingBottom: 32 }} extra={<span style={{ fontSize: 10, color: "var(--ant-color-textTertiary)" }}>всего / (% успеха)</span>}>
                {byProject.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <div>
                    {byProject.map((p: any) => {
                      const pct = p.total > 0 ? Math.round(p.success / p.total * 100) : 0;
                      return (
                        <div key={p.label} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{p.label}</span>
                            <span style={{ color: "var(--ant-color-textSecondary)" }}>{p.total} ({pct}%)</span>
                          </div>
                          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, background: "#3f8600" }} />
                            {p.failed > 0 && <div style={{ width: `${p.total > 0 ? (p.failed / p.total * 100) : 0}%`, background: "#cf1322" }} />}
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
            <Col span={8}>
              <Card title="Lead Time (динамика)" size="small" style={CARD_STYLE}>
                <LineChart data={chartData} height={120} valueKey="avgLeadTimeSec" color="#1677ff" label="Lead Time" unit="с" />
              </Card>
            </Col>
            <Col span={8}>
              <Card title="% Сбоев (динамика)" size="small" style={CARD_STYLE}>
                <MiniBarChart data={chartData} height={120} valueKey="failureRate" color="#cf1322" label="% сбоев" />
              </Card>
            </Col>
            <Col span={8}>
              <Card title="MTTR (динамика)" size="small" style={CARD_STYLE}>
                <LineChart data={chartData} height={120} valueKey="avgMttrMin" color="#fa541c" label="MTTR" unit="мин" />
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
                        <b>Уровни:</b> <b style={{ color: "#3f8600" }}>Elite</b> ≥1/день, <b style={{ color: "#d4b106" }}>High</b> ≥1/неделю, <b style={{ color: "#cf1322" }}>Low</b> ≥1/месяц.
                      </div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 4 }}><b>Lead Time for Changes</b></div>
                      <div style={{ color: "var(--ant-color-textTertiary)", lineHeight: 1.5 }}>
                        <b>Формула:</b> Среднее(deploy.created_at − commit.committed_date) для успешных деплоев.<br />
                        <b>Данные:</b> из <code>raw_json.deployable.commit.committed_date</code> и <code>created_at</code>.<br />
                        <b>Уровни:</b> <b style={{ color: "#3f8600" }}>Elite</b> &lt;1ч, <b style={{ color: "#d4b106" }}>High</b> &lt;1день, <b style={{ color: "#cf1322" }}>Low</b> &lt;1неделю.
                      </div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 4 }}><b>Change Failure Rate</b></div>
                      <div style={{ color: "var(--ant-color-textTertiary)", lineHeight: 1.5 }}>
                        <b>Формула:</b> Кол-во failed деплоев × 100 / Всего деплоев.<br />
                        <b>Данные:</b> <code>status = 'failed'</code> или <code>pipeline_status = 'failed'</code>.<br />
                        <b>Уровни:</b> <b style={{ color: "#3f8600" }}>Elite</b> 0–15%, <b style={{ color: "#d4b106" }}>High</b> 16–30%, <b style={{ color: "#cf1322" }}>Low</b> &gt;30%.
                      </div>
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 4 }}><b>MTTR (Mean Time to Restore)</b></div>
                      <div style={{ color: "var(--ant-color-textTertiary)", lineHeight: 1.5 }}>
                        <b>Формула:</b> Среднее время от failed деплоя до следующего success деплоя.<br />
                        <b>Данные:</b> пары failed→success в хронологическом порядке, разница в минутах.<br />
                        <b>Уровни:</b> <b style={{ color: "#3f8600" }}>Elite</b> &lt;1ч, <b style={{ color: "#d4b106" }}>High</b> &lt;1день, <b style={{ color: "#cf1322" }}>Low</b> &gt;1неделя.
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
