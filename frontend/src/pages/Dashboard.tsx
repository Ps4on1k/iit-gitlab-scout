import { useState, useEffect, useMemo, memo } from "react";
import { Card, Row, Col, Statistic, Spin, Empty, Table, Tag, Segmented, Button } from "antd";
import { ProjectOutlined, TeamOutlined, FireOutlined, CheckCircleOutlined, MergeOutlined, RocketOutlined, WarningOutlined, ClockCircleOutlined, ArrowUpOutlined, ArrowDownOutlined, MinusOutlined, UpOutlined, DownOutlined, LinkOutlined } from "@ant-design/icons";
import { Line } from "@ant-design/charts";
import { fetchDashboard, fetchProjects } from "../api/client";
import { chartColors } from "../utils/chartTheme";
import { getTagColor } from "../utils/tagColors";
import { getProjectUrl } from "../utils/projectUrl";

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  if (seconds < 60) return `${seconds}с`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}мин`;
  return `${Math.floor(seconds / 3600)}ч ${Math.round((seconds % 3600) / 60)}м`;
}

function formatMttr(minutes: number): string {
  if (minutes === 0) return "—";
  if (minutes < 60) return `${minutes}мин`;
  return `${Math.floor(minutes / 60)}ч ${minutes % 60}м`;
}

const CARD_STYLE = { height: "100%" as const };
const statSmall = { fontSize: 14 };

export const Dashboard = memo(function Dashboard({ onContributorClick }: { onContributorClick?: (name: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [period, setPeriod] = useState<number>(30);
  const [showAllActive, setShowAllActive] = useState(false);
  const [showAllInactive, setShowAllInactive] = useState(false);
  const [showAllActiveContrib, setShowAllActiveContrib] = useState(false);
  const [showAllInactiveContrib, setShowAllInactiveContrib] = useState(false);
  const cc = chartColors();
  const TOP_N = 15;

  useEffect(() => {
    setLoading(true);
    fetchDashboard(period).then((r) => { if (r.ok) setData(r.data); setLoading(false); });
    fetchProjects().then((r) => { if (r.ok) setProjects(r.data!); });
  }, [period]);

  const projectMap = useMemo(() => {
    const m = new Map<string, { base_url: string; path: string }>();
    for (const p of projects) m.set(p.label, { base_url: p.base_url, path: p.path });
    return m;
  }, [projects]);

  if (loading) return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  if (!data) return <Empty description="Ошибка загрузки" />;

  const { summary, dora, topContributors, inactiveContributors, activeProjects, inactiveProjects, recentActivity, mrByProject } = data;

  const deploySuccessRate = summary.deploysTotal > 0 ? Math.round(summary.deploysSuccess / summary.deploysTotal * 100) : null;
  const mrMergeRate = (summary.mrOpened + summary.mrMerged + summary.mrClosed) > 0
    ? Math.round(summary.mrMerged / (summary.mrOpened + summary.mrMerged + summary.mrClosed) * 100) : null;

  const activityChartData = recentActivity.map((a: any) => ({ date: a.date, commits: a.commits }));

  const activeProjectColumns = [
    { title: "Проект", dataIndex: "label", key: "label",
      render: (v: string, r: any) => (
        <div>
          <span style={{ fontWeight: 500 }}>{v}{projectMap.has(v) && <a href={getProjectUrl(projectMap.get(v)!.base_url, projectMap.get(v)!.path)} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4, color: "var(--ant-color-textTertiary)", fontSize: 11 }}><LinkOutlined /></a>}</span>
          {r.tags?.length > 0 && (
            <div style={{ marginTop: 2, display: "flex", flexWrap: "wrap", gap: 3 }}>
              {r.tags.slice(0, 2).map((t: string) => {
                const c = getTagColor(t);
                return <Tag key={t} style={{ fontSize: 10, background: c.bg, color: c.text, border: "none", margin: 0, lineHeight: "16px", padding: "0 6px" }}>{t}</Tag>;
              })}
            </div>
          )}
        </div>
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
        <div style={{ color: "var(--ant-color-textTertiary)" }}>
          <span style={{ fontWeight: 500 }}>{v}</span>
          {r.tags?.length > 0 && (
            <div style={{ marginTop: 2, display: "flex", flexWrap: "wrap", gap: 3 }}>
              {r.tags.slice(0, 2).map((t: string) => {
                const c = getTagColor(t);
                return <Tag key={t} style={{ fontSize: 10, background: c.bg, color: c.text, border: "none", margin: 0, lineHeight: "16px", padding: "0 6px", opacity: 0.5 }}>{t}</Tag>;
              })}
            </div>
          )}
        </div>
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
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ background: "linear-gradient(135deg, #8BAADB 0%, #9ED4C8 100%)", color: "#111315", padding: "14px 24px", borderRadius: "12px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 20, marginBottom: 4 }}>Обзор</h1>
          <div style={{ opacity: 0.9, fontSize: 13 }}>Проекты, контрибьюторы и активность за период</div>
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
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Активные ветки" value={summary.activeBranches || 0} valueStyle={{ color: "#21B573", ...statSmall }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Заброшенные" value={summary.staleBranches || 0} valueStyle={{ color: "#E5484D", ...statSmall }} /></Card></Col>
      </Row>

      {/* Summary cards row 2 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="MR Открытых" value={summary.mrOpened} valueStyle={{ color: "#3A8DFF", ...statSmall }} prefix={<MergeOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="MR Замержено" value={summary.mrMerged} valueStyle={{ color: "#21B573", ...statSmall }} prefix={<CheckCircleOutlined />} suffix={mrMergeRate !== null && <span style={{ fontSize: 11, color: "#999" }}>({mrMergeRate}%)</span>} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="MR Закрыто" value={summary.mrClosed} valueStyle={{ color: "#E5484D", ...statSmall }} prefix={<WarningOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Пайплайнов" value={summary.deploysTotal || 0} valueStyle={statSmall} prefix={<RocketOutlined />} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Деплоев OK" value={summary.deploysSuccess || 0} valueStyle={{ color: "#21B573", ...statSmall }} suffix={deploySuccessRate !== null && <span style={{ fontSize: 11, color: "#999" }}>({deploySuccessRate}%)</span>} /></Card></Col>
        <Col span={4}><Card size="small" style={CARD_STYLE}><Statistic title="Деплоев Failed" value={summary.deploysFailed || 0} valueStyle={{ color: "#E5484D", ...statSmall }} /></Card></Col>
      </Row>

      {/* DORA metrics row */}
      {dora && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col span={6}><Card size="small" style={CARD_STYLE}><Statistic title="Частота деплоев" value={dora.deployFrequency} suffix="в день" valueStyle={{ color: dora.deployFrequency >= 1 ? "#21B573" : dora.deployFrequency >= 0.1 ? "#FFB020" : "#E5484D", ...statSmall }} prefix={<RocketOutlined />} /></Card></Col>
          <Col span={6}><Card size="small" style={CARD_STYLE}><Statistic title="Lead Time" value={formatDuration(dora.avgLeadTimeSec)} valueStyle={{ color: dora.avgLeadTimeSec < 3600 ? "#21B573" : dora.avgLeadTimeSec < 86400 ? "#FFB020" : "#E5484D", ...statSmall }} prefix={<ClockCircleOutlined />} /></Card></Col>
          <Col span={6}><Card size="small" style={CARD_STYLE}><Statistic title="Failure Rate" value={dora.failureRate} suffix="%" valueStyle={{ color: dora.failureRate <= 15 ? "#21B573" : dora.failureRate <= 30 ? "#FFB020" : "#E5484D", ...statSmall }} prefix={<WarningOutlined />} /></Card></Col>
          <Col span={6}><Card size="small" style={CARD_STYLE}><Statistic title="MTTR" value={formatMttr(dora.avgMttrMin)} valueStyle={{ color: dora.avgMttrMin <= 60 ? "#21B573" : dora.avgMttrMin <= 1440 ? "#FFB020" : "#E5484D", ...statSmall }} /></Card></Col>
        </Row>
      )}

      {/* Activity chart */}
      <Row gutter={16} style={{ marginBottom: 16, minHeight: 350 }} align="stretch">
        <Col span={24}>
          <Card title={`Активность за ${period} дн.`} size="small" style={{ height: "100%" }}>
            {activityChartData.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <div style={{ height: "calc(100% - 40px)" }}>
                <Line data={activityChartData} xField="date" yField="commits"
                  point={{ size: 2 }} style={{ lineWidth: 2, stroke: "#3A8DFF" }}
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
      <Row gutter={16} style={{ marginBottom: 16 }} align="stretch">
        <Col span={12}>
          <Card size="small" style={{ height: "100%" }}
            title={<span><ArrowUpOutlined style={{ color: "#21B573", marginRight: 6 }} />Активные проекты ({activeProjects.length})</span>}
            extra={activeProjects.length > TOP_N && (
              <Button size="small" type="link" icon={showAllActive ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setShowAllActive(!showAllActive)}>
                {showAllActive ? "Свернуть" : `Показать все (${activeProjects.length})`}
              </Button>
            )}>
            {activeProjects.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет активных проектов за период" /> : (
              <Table dataSource={showAllActive ? activeProjects : activeProjects.slice(0, TOP_N)}
                columns={activeProjectColumns} rowKey="id" size="small" pagination={false} />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" style={{ height: "100%" }}
            title={<span><MinusOutlined style={{ color: "#999", marginRight: 6 }} />Неактивные проекты ({inactiveProjects.length})</span>}
            extra={inactiveProjects.length > TOP_N && (
              <Button size="small" type="link" icon={showAllInactive ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setShowAllInactive(!showAllInactive)}>
                {showAllInactive ? "Свернуть" : `Показать все (${inactiveProjects.length})`}
              </Button>
            )}>
            {inactiveProjects.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Все проекты активны" /> : (
              <Table dataSource={showAllInactive ? inactiveProjects : inactiveProjects.slice(0, TOP_N)}
                columns={inactiveProjectColumns} rowKey="id" size="small" pagination={false} />
            )}
          </Card>
        </Col>
      </Row>

      {/* Active vs Inactive Contributors */}
      <Row gutter={16} style={{ marginBottom: 16 }} align="stretch">
        <Col span={12}>
          <Card size="small" style={{ height: "100%" }}
            title={<span><ArrowUpOutlined style={{ color: "#21B573", marginRight: 6 }} />Активные контрибьюторы ({topContributors.length})</span>}
            extra={topContributors.length > TOP_N && (
              <Button size="small" type="link" icon={showAllActiveContrib ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setShowAllActiveContrib(!showAllActiveContrib)}>
                {showAllActiveContrib ? "Свернуть" : `Показать все (${topContributors.length})`}
              </Button>
            )}>
            {topContributors.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
              <Table dataSource={showAllActiveContrib ? topContributors : topContributors.slice(0, TOP_N)}
                columns={activeContributorColumns} rowKey="email" size="small" pagination={false} />
            )}
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" style={{ height: "100%" }}
            title={<span><ArrowDownOutlined style={{ color: "#E5484D", marginRight: 6 }} />Неактивные контрибьюторы ({inactiveContributors.length})</span>}
            extra={inactiveContributors.length > TOP_N && (
              <Button size="small" type="link" icon={showAllInactiveContrib ? <UpOutlined /> : <DownOutlined />}
                onClick={() => setShowAllInactiveContrib(!showAllInactiveContrib)}>
                {showAllInactiveContrib ? "Свернуть" : `Показать все (${inactiveContributors.length})`}
              </Button>
            )}>
            {inactiveContributors.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет отвалившихся контрибьюторов" /> : (
              <Table dataSource={showAllInactiveContrib ? inactiveContributors : inactiveContributors.slice(0, TOP_N)}
                columns={inactiveContributorColumns} rowKey="email" size="small" pagination={false} />
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
                        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{p.label}{projectMap.has(p.label) && <a href={getProjectUrl(projectMap.get(p.label)!.base_url, projectMap.get(p.label)!.path)} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4, color: "var(--ant-color-textTertiary)", fontSize: 11 }}><LinkOutlined /></a>}</span>
                        <span style={{ color: "var(--ant-color-text-secondary)", fontSize: 10 }}>
                          <span style={{ color: "#3A8DFF" }}>{p.opened}</span> / <span style={{ color: "#21B573" }}>{p.merged}</span> / <span style={{ color: "#E5484D" }}>{p.closed}</span>
                        </span>
                      </div>
                      <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${p.total > 0 ? (p.opened / p.total * 100) : 0}%`, background: "#3A8DFF" }} />
                        <div style={{ width: `${pct}%`, background: "#21B573" }} />
                        <div style={{ width: `${p.total > 0 ? (p.closed / p.total * 100) : 0}%`, background: "#E5484D" }} />
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
});
