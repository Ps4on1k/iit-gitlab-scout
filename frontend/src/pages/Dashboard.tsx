import { useState, useEffect, useMemo } from "react";
import { Card, Row, Col, Statistic, Spin, Empty, Table, Tag, Segmented } from "antd";
import { ProjectOutlined, TeamOutlined, FireOutlined, CheckCircleOutlined, MergeOutlined, RocketOutlined, WarningOutlined, ClockCircleOutlined, ArrowUpOutlined, ArrowDownOutlined, MinusOutlined } from "@ant-design/icons";
import { Line } from "@ant-design/charts";
import { fetchDashboard } from "../api/client";
import { chartColors } from "../utils/chartTheme";
import { getTagColor } from "../utils/tagColors";

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
  const [period, setPeriod] = useState<number>(30);
  const cc = chartColors();

  useEffect(() => {
    setLoading(true);
    fetchDashboard(period).then((r) => { if (r.ok) setData(r.data); setLoading(false); });
  }, [period]);

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!data) return <Empty description="Ошибка загрузки" />;

  const { summary, topContributors, inactiveContributors, activeProjects, inactiveProjects, recentActivity, mrByProject } = data;

  const deploySuccessRate = summary.deploysTotal > 0 ? Math.round(summary.deploysSuccess / summary.deploysTotal * 100) : null;
  const mrMergeRate = (summary.mrOpened + summary.mrMerged + summary.mrClosed) > 0
    ? Math.round(summary.mrMerged / (summary.mrOpened + summary.mrMerged + summary.mrClosed) * 100) : null;

  const activityChartData = recentActivity.map((a: any) => ({ date: a.date, commits: a.commits }));

  const activeProjectColumns = [
    { title: "Проект", dataIndex: "label", key: "label",
      render: (v: string, r: any) => (
        <span>{v}{r.tags?.length > 0 && r.tags.slice(0, 2).map((t: string) => {
          const c = getTagColor(t);
          return <Tag key={t} style={{ marginLeft: 4, fontSize: 10, background: c.bg, color: c.text, border: "none" }}>{t}</Tag>;
        })}</span>
      ),
    },
    { title: "Коммиты", dataIndex: "commits", key: "commits", width: 90, sorter: (a: any, b: any) => a.commits - b.commits, defaultSortOrder: "descend" as const },
    { title: "Контриб.", dataIndex: "contributors", key: "contributors", width: 80 },
    { title: "Последний", dataIndex: "lastCommit", key: "lastCommit", width: 100,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : "—" },
  ];

  const inactiveProjectColumns = [
    { title: "Проект", dataIndex: "label", key: "label",
      render: (v: string, r: any) => (
        <span style={{ color: "var(--ant-color-textTertiary)" }}>{v}{r.tags?.length > 0 && r.tags.slice(0, 2).map((t: string) => {
          const c = getTagColor(t);
          return <Tag key={t} style={{ marginLeft: 4, fontSize: 10, background: c.bg, color: c.text, border: "none", opacity: 0.5 }}>{t}</Tag>;
        })}</span>
      ),
    },
  ];

  const activeContributorColumns = [
    { title: "Контрибьютор", dataIndex: "name", key: "name",
      render: (v: string, r: any) => <a onClick={() => onContributorClick?.(r.email)} style={{ cursor: "pointer" }}>{v}</a> },
    { title: "Коммиты", dataIndex: "commits", key: "commits", width: 80 },
    { title: "Изменения", dataIndex: "changes", key: "changes", width: 100, render: (v: number) => v.toLocaleString() },
    { title: "Последний", dataIndex: "lastCommit", key: "lastCommit", width: 100,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : "—" },
  ];

  const inactiveContributorColumns = [
    { title: "Контрибьютор", dataIndex: "name", key: "name",
      render: (v: string, r: any) => <a onClick={() => onContributorClick?.(r.email)} style={{ cursor: "pointer" }}>{v}</a> },
    { title: "Последний коммит", dataIndex: "lastCommit", key: "lastCommit", width: 120,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : "—" },
  ];

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 10 }}>Обзор</h1>
          <div style={{ opacity: 0.9, fontSize: 14 }}>Проекты, контрибьюторы и активность за период</div>
        </div>
        <Segmented
          value={period}
          onChange={(v) => setPeriod(v as number)}
          options={[
            { label: "7 дней", value: 7 },
            { label: "30 дней", value: 30 },
            { label: "90 дней", value: 90 },
          ]}
          style={{ background: "rgba(255,255,255,0.15)" }}
        />
      </div>

      {/* Summary cards row 1 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Проектов" value={summary.projects} prefix={<ProjectOutlined />} valueStyle={statSmall} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Контрибьюторов" value={summary.contributors} prefix={<TeamOutlined />} valueStyle={statSmall} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Коммитов" value={summary.commits} prefix={<FireOutlined />} valueStyle={statSmall} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Дней активности" value={summary.activeDays} valueStyle={statSmall} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Активные ветки" value={summary.activeBranches || 0} valueStyle={{ color: "#3f8600", ...statSmall }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Заброшенные" value={summary.staleBranches || 0} valueStyle={{ color: "#cf1322", ...statSmall }} /></Card></Col>
      </Row>

      {/* Summary cards row 2 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="MR Открытых" value={summary.mrOpened} valueStyle={{ color: "#1677ff", ...statSmall }} prefix={<MergeOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="MR Замержено" value={summary.mrMerged} valueStyle={{ color: "#3f8600", ...statSmall }} prefix={<CheckCircleOutlined />} suffix={mrMergeRate !== null && <span style={{ fontSize: 11, color: "#999" }}>({mrMergeRate}%)</span>} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="MR Закрыто" value={summary.mrClosed} valueStyle={{ color: "#cf1322", ...statSmall }} prefix={<WarningOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Пайплайнов" value={summary.deploysTotal || 0} valueStyle={statSmall} prefix={<RocketOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Деплоев OK" value={summary.deploysSuccess || 0} valueStyle={{ color: "#3f8600", ...statSmall }} suffix={deploySuccessRate !== null && <span style={{ fontSize: 11, color: "#999" }}>({deploySuccessRate}%)</span>} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Деплоев Failed" value={summary.deploysFailed || 0} valueStyle={{ color: "#cf1322", ...statSmall }} /></Card></Col>
      </Row>

      {/* Activity chart */}
      <Row gutter={16} style={{ marginBottom: 16, minHeight: 350 }} align="stretch">
        <Col span={24}>
          <Card title={`Активность за ${period} дн.`} size="small" style={{ height: "100%" }}>
            {activityChartData.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ height: "calc(100% - 40px)" }}>
                <Line data={activityChartData} xField="date" yField="commits"
                  point={{ size: 2 }} style={{ lineWidth: 2, stroke: "#667eea" }}
                  axis={{
                    x: { labelAutoRotate: true, labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
                    y: { labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
                  }}
                  tooltip={{ title: "date", items: [{ field: "commits", name: "Коммиты" }] }}
                  legend={false} autoFit
                />
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Active vs Inactive Projects */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title={<span><ArrowUpOutlined style={{ color: "#3f8600", marginRight: 6 }} />Активные проекты ({activeProjects.length})</span>} size="small" style={{ height: 400 }}>
            {activeProjects.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет активных проектов за период" /> : (
              <Table dataSource={activeProjects} columns={activeProjectColumns} rowKey="id" size="small" pagination={false} scroll={{ y: 300 }} />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<span><MinusOutlined style={{ color: "#999", marginRight: 6 }} />Неактивные проекты ({inactiveProjects.length})</span>} size="small" style={{ height: 400 }}>
            {inactiveProjects.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Все проекты активны" /> : (
              <Table dataSource={inactiveProjects} columns={inactiveProjectColumns} rowKey="id" size="small" pagination={false} scroll={{ y: 300 }} />
            )}
          </Card>
        </Col>
      </Row>

      {/* Active vs Inactive Contributors */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title={<span><ArrowUpOutlined style={{ color: "#3f8600", marginRight: 6 }} />Активные контрибьюторы ({topContributors.length})</span>} size="small" style={{ height: 400 }}>
            {topContributors.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <Table dataSource={topContributors} columns={activeContributorColumns} rowKey="email" size="small" pagination={false} scroll={{ y: 300 }} />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card title={<span><ArrowDownOutlined style={{ color: "#cf1322", marginRight: 6 }} />Неактивные контрибьюторы ({inactiveContributors.length})</span>} size="small" style={{ height: 400 }}>
            {inactiveContributors.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет отвалившихся контрибьюторов" /> : (
              <Table dataSource={inactiveContributors} columns={inactiveContributorColumns} rowKey="email" size="small" pagination={false} scroll={{ y: 300 }} />
            )}
          </Card>
        </Col>
      </Row>

      {/* MR by project */}
      {mrByProject.length > 0 && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={24}>
            <Card title="MR по проектам (top 10)" size="small"
              extra={<span style={{ fontSize: 10, color: "var(--ant-color-textTertiary)" }}>открытых / замерженных / закрытых</span>}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 8 }}>
                {mrByProject.map((p: any) => {
                  const pct = p.total > 0 ? Math.round(p.merged / p.total * 100) : 0;
                  return (
                    <div key={p.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{p.label}</span>
                        <span style={{ color: "var(--ant-color-text-secondary)", fontSize: 10 }}>
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
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}
