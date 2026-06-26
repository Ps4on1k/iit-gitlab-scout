import { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Spin, Empty, Table, Tag } from "antd";
import { ProjectOutlined, TeamOutlined, FireOutlined, CheckCircleOutlined, BranchesOutlined, MergeOutlined, RocketOutlined, WarningOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { Line } from "@ant-design/charts";
import { fetchDashboard } from "../api/client";
import { getTagColor } from "../utils/tagColors";
import { chartColors } from "../utils/chartTheme";

const CARD_STYLE = { height: "100%" as const };
const statSmall = { fontSize: 14 };

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  if (seconds < 60) return `${seconds}с`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}мин`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}ч ${m}мин`;
}

export function Dashboard({ onContributorClick }: { onContributorClick?: (name: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetchDashboard().then((r) => { if (r.ok) setData(r.data); setLoading(false); });
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!data) return <Empty description="Ошибка загрузки" />;

  const { summary, topContributors, projectHealth, recentActivity, branchStatusDistribution, branchesByProject, pipelinesByProject, mrByProject } = data;
  const stalePct = summary.branches > 0 ? Math.round(summary.staleBranches / summary.branches * 100) : 0;
  const maxActivity = Math.max(1, ...recentActivity.map((a: any) => a.commits));
  const cc = chartColors();

  const activityChartData = recentActivity.map((a: any) => ({ date: a.date, commits: a.commits }));

  const contributorColumns = [
    { title: "#", width: 30, render: (_: any, __: any, i: number) => i + 1 },
    {
      title: "Контрибьютор", dataIndex: "name", key: "name",
      render: (v: string, r: any) => (
        <a onClick={() => onContributorClick?.(r.email)} style={{ cursor: "pointer" }}>{v}</a>
      ),
    },
    { title: "Коммиты", dataIndex: "commits", key: "commits", width: 80 },
    { title: "Изменения", dataIndex: "changes", key: "changes", width: 100, render: (v: number) => v.toLocaleString() },
  ];

  const deploySuccessRate = summary.deploysTotal > 0 ? Math.round(summary.deploysSuccess / summary.deploysTotal * 100) : null;
  const mrMergeRate = (summary.mrOpened + summary.mrMerged + summary.mrClosed) > 0
    ? Math.round(summary.mrMerged / (summary.mrOpened + summary.mrMerged + summary.mrClosed) * 100) : null;
  const pipelineSuccessRate = pipelinesByProject.length > 0
    ? Math.round(pipelinesByProject.reduce((s: number, p: any) => s + p.success, 0) / Math.max(1, pipelinesByProject.reduce((s: number, p: any) => s + p.total, 0)) * 100)
    : null;

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Обзор</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Сводная статистика за последние 30 дней</div>
      </div>

      {/* Summary cards row 1: core metrics */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Проектов" value={summary.projects} prefix={<ProjectOutlined />} valueStyle={statSmall} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Контрибьюторов" value={summary.contributors} prefix={<TeamOutlined />} valueStyle={statSmall} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Коммитов" value={summary.commits} prefix={<FireOutlined />} valueStyle={statSmall} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Дней активности" value={summary.activeDays} valueStyle={statSmall} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Активные ветки" value={summary.activeBranches} valueStyle={{ color: "#3f8600", ...statSmall }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Заброшенные" value={summary.staleBranches} valueStyle={{ color: stalePct > 50 ? "#cf1322" : "#d4b106", ...statSmall }} suffix={<span style={{ fontSize: 11, color: "#999" }}>({stalePct}%)</span>} /></Card></Col>
      </Row>

      {/* Summary cards row 2: MR + Pipeline + Deploy */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="MR Открытых" value={summary.mrOpened} valueStyle={{ color: "#1677ff", ...statSmall }} prefix={<MergeOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="MR Замержено" value={summary.mrMerged} valueStyle={{ color: "#3f8600", ...statSmall }} prefix={<CheckCircleOutlined />} suffix={mrMergeRate !== null && <span style={{ fontSize: 11, color: "#999" }}>({mrMergeRate}%)</span>} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="MR Закрыто" value={summary.mrClosed} valueStyle={{ color: "#cf1322", ...statSmall }} prefix={<WarningOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Пайплайнов" value={summary.deploysTotal || pipelinesByProject.reduce((s: number, p: any) => s + p.total, 0)} valueStyle={statSmall} prefix={<RocketOutlined />} suffix={pipelineSuccessRate !== null && <span style={{ fontSize: 11, color: "#3f8600" }}>({pipelineSuccessRate}%)</span>} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Деплоев" value={summary.deploysTotal} valueStyle={statSmall} prefix={<RocketOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Деплоев OK" value={summary.deploysSuccess} valueStyle={{ color: "#3f8600", ...statSmall }} suffix={deploySuccessRate !== null && <span style={{ fontSize: 11, color: "#999" }}>({deploySuccessRate}%)</span>} /></Card></Col>
      </Row>

      {/* Row 1: Activity chart + Project health */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card title="Активность за 30 дней" size="small" style={CARD_STYLE}>
            {recentActivity.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ height: 180 }}>
                <Line data={activityChartData} xField="date" yField="commits"
                  point={{ size: 2 }} style={{ lineWidth: 2, stroke: "#667eea" }}
                  axis={{
                    x: { labelAutoRotate: true, labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
                    y: { labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
                  }}
                  tooltip={{ title: "date", items: [{ field: "commits", name: "Коммиты" }] }}
                  legend={false}
                />
              </div>
            )}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="Здоровье проектов (top 10)" size="small" style={CARD_STYLE}
            extra={<span style={{ fontSize: 10, color: "var(--ant-color-textTertiary)" }}>% активных веток от не-замерженных</span>}>
            {projectHealth.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div>
                {projectHealth.sort((a: any, b: any) => a.healthPct - b.healthPct).slice(0, 8).map((p: any) => (
                  <div key={p.label} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>{p.label}</span>
                      <span style={{ color: p.healthPct >= 70 ? "#3f8600" : p.healthPct >= 40 ? "#d4b106" : "#cf1322", fontWeight: 600, fontSize: 12 }}>{p.healthPct}%</span>
                    </div>
                    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "var(--ant-color-fill-secondary)" }}>
                      <div style={{ width: `${p.healthPct}%`, background: p.healthPct >= 70 ? "#3f8600" : p.healthPct >= 40 ? "#d4b106" : "#cf1322" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Row 2: Top contributors + MR by project + Pipelines by project */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card title="Топ-10 контрибьюторов" size="small" style={CARD_STYLE}>
            {topContributors.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <Table
                dataSource={topContributors} columns={contributorColumns}
                rowKey="email" size="small" pagination={false}
                onRow={(record) => ({ onClick: () => onContributorClick?.(record.email), style: { cursor: "pointer" } })}
              />
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="MR по проектам (top 10)" size="small" style={CARD_STYLE}
            extra={<span style={{ fontSize: 10, color: "var(--ant-color-textTertiary)" }}>открытых / замерженных / закрытых</span>}>
            {(mrByProject || []).length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div>
                {mrByProject.map((p: any) => {
                  const pct = p.total > 0 ? Math.round(p.merged / p.total * 100) : 0;
                  return (
                    <div key={p.label} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{p.label}</span>
                        <span style={{ color: "var(--ant-color-textSecondary)", fontSize: 10 }}>
                          <span style={{ color: "#1677ff" }}>{p.opened}</span> / <span style={{ color: "#3f8600" }}>{p.merged}</span> / <span style={{ color: "#cf1322" }}>{p.closed}</span>
                        </span>
                      </div>
                      <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${p.total > 0 ? (p.opened / p.total * 100) : 0}%`, background: "#1677ff" }} />
                        <div style={{ width: `${pct}%`, background: "#3f8600" }} />
                        <div style={{ width: `${p.total > 0 ? (p.closed / p.total * 100) : 0}%`, background: "#cf1322" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="Пайплайны (top 10)" size="small" style={CARD_STYLE}
            extra={<span style={{ fontSize: 10, color: "var(--ant-color-textTertiary)" }}>успешных / всего (%успеха)</span>}>
            {pipelinesByProject.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных" /> : (
              <div>
                {pipelinesByProject.map((p: any) => {
                  const pct = p.total > 0 ? Math.round(p.success / p.total * 100) : 0;
                  return (
                    <div key={p.label} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{p.label}</span>
                        <span style={{ color: "var(--ant-color-textSecondary)", fontSize: 10 }}>
                          <span style={{ color: "#3f8600" }}>{p.success}</span>/{p.total} ({pct}%)
                        </span>
                      </div>
                      <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden" }}>
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

      {/* Row 3: Branches by project */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card title="Ветки по проектам (top 10)" size="small" style={CARD_STYLE}>
            {branchesByProject.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 8 }}>
                {branchesByProject.map((p: any) => (
                  <div key={p.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{p.label}</span>
                      <span style={{ color: "var(--ant-color-text-secondary)", fontSize: 11 }}>{p.active} акт / {p.stale} забр / {p.merged} мердж</span>
                    </div>
                    <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${(p.active / p.total) * 100}%`, background: "#3f8600" }} />
                      <div style={{ width: `${(p.stale / p.total) * 100}%`, background: "#cf1322" }} />
                      <div style={{ width: `${(p.merged / p.total) * 100}%`, background: "#667eea" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
