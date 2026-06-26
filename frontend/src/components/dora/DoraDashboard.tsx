import { useState, useEffect, useMemo } from "react";
import { Card, Row, Col, Statistic, Select, Spin, Empty, Tag, Tooltip } from "antd";
import { RocketOutlined, ClockCircleOutlined, WarningOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { fetchProjects, fetchDoraMetrics } from "../../api/client";
import { chartColors } from "../../utils/chartTheme";
import { getTagColor } from "../../utils/tagColors";
import type { ProjectConfig } from "../../types";
import type { GlobalFilters } from "../GlobalFilterBar";

interface Props { filters: GlobalFilters; }

const ROW_HEIGHT = 400;
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

export function DoraDashboard({ filters }: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [selectedEnv, setSelectedEnv] = useState<string | undefined>();
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
  const byProject = data?.byProject || [];
  const environments = data?.environments || [];
  const maxDeploys = Math.max(1, ...trend.map((t: any) => t.total));

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #0052cc 0%, #36b37e 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>DORA Метрики</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Четыре ключевые метрики DevOps-производительности</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Select placeholder="Окружение" allowClear style={{ width: 200 }} value={selectedEnv} onChange={setSelectedEnv}>
          <Select.Option key="__all__" value="__all__">Все окружения</Select.Option>
          {environments.map((e: string) => <Select.Option key={e} value={e}>{e}</Select.Option>)}
        </Select>
      </div>

      {s && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card style={CARD_STYLE}>
                <Statistic
                  title={<span>Частота деплоев <Tooltip title="Среднее кол-во деплоев в день"><ThunderboltOutlined /></Tooltip></span>}
                  value={s.deployFrequency}
                  suffix="в день"
                  valueStyle={{ color: freqColor(s.deployFrequency) }}
                  prefix={<RocketOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={CARD_STYLE}>
                <Statistic
                  title={<span>Lead Time <Tooltip title="Среднее время от деплоя до завершения"><ClockCircleOutlined /></Tooltip></span>}
                  value={formatDuration(s.avgLeadTimeSec)}
                  valueStyle={{ color: leadTimeColor(s.avgLeadTimeSec) }}
                  prefix={<ClockCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={CARD_STYLE}>
                <Statistic
                  title={<span>Процент сбоев <Tooltip title="% деплоев, вызвавших ошибку"><WarningOutlined /></Tooltip></span>}
                  value={s.failureRate}
                  suffix="%"
                  valueStyle={{ color: rateColor(s.failureRate) }}
                  prefix={<WarningOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={CARD_STYLE}>
                <Statistic
                  title="MTTR (время восстановления)"
                  value={formatMttr(s.avgMttrMin)}
                  valueStyle={{ color: s.avgMttrMin <= 60 ? "#3f8600" : s.avgMttrMin <= 360 ? "#d4b106" : "#cf1322" }}
                />
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
              <Card title="Деплои по дням" size="small" style={CARD_STYLE}>
                {trend.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных о деплоях" /> : (
                  <div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 0, height: 160, borderBottom: "1px solid var(--ant-color-border-secondary)" }}>
                      {trend.map((t: any) => (
                        <div key={t.date} title={`${t.date}: ${t.total} (${t.success} OK, ${t.failed} FAIL)`}
                          style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                          <div style={{ display: "flex", flexDirection: "column", height: `${(t.total / maxDeploys) * 100}%` }}>
                            {t.failed > 0 && <div style={{ flex: t.failed, background: "#cf1322", borderRadius: "2px 2px 0 0" }} />}
                            {t.success > 0 && <div style={{ flex: t.success, background: "#3f8600" }} />}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 6, fontSize: 11, color: "var(--ant-color-textTertiary)" }}>
                      <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#3f8600", marginRight: 4, verticalAlign: "middle" }} />Успешные</span>
                      <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#cf1322", marginRight: 4, verticalAlign: "middle" }} />Провалены</span>
                    </div>
                  </div>
                )}
              </Card>
            </Col>
            <Col span={8}>
              <Card title="По проектам (top 10)" size="small" style={CARD_STYLE}>
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

          <Row gutter={16}>
            <Col span={24}>
              <Card size="small" title={<span>Легенда DORA-метрик</span>}>
                <Row gutter={24}>
                  <Col span={6}>
                    <div style={{ fontSize: 13 }}>
                      <b>Частота деплоев</b> — сколько успешных деплоев в день. <b style={{ color: "#3f8600" }}>Elite</b>: ≥1/день, <b style={{ color: "#d4b106" }}>High</b>: ≥1/неделю, <b style={{ color: "#cf1322" }}>Low</b>: ≥1/месяц.
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 13 }}>
                      <b>Lead Time</b> — время от создания деплоя до его завершения. <b style={{ color: "#3f8600" }}>Elite</b>: &lt;1ч, <b style={{ color: "#d4b106" }}>High</b>: &lt;1день, <b style={{ color: "#cf1322" }}>Low</b>: &lt;1неделю.
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 13 }}>
                      <b>Change Failure Rate</b> — % деплоев с ошибками. <b style={{ color: "#3f8600" }}>Elite</b>: 0-15%, <b style={{ color: "#d4b106" }}>High</b>: 16-30%, <b style={{ color: "#cf1322" }}>Low</b>: &gt;30%.
                    </div>
                  </Col>
                  <Col span={6}>
                    <div style={{ fontSize: 13 }}>
                      <b>MTTR</b> — среднее время восстановления после сбоя. <b style={{ color: "#3f8600" }}>Elite</b>: &lt;1ч, <b style={{ color: "#d4b106" }}>High</b>: &lt;1день, <b style={{ color: "#cf1322" }}>Low</b>: &gt;1неделя.
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
