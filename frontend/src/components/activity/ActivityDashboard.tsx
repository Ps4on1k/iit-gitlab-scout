import { useState, useEffect, useMemo, useCallback } from "react";
import { Select, Button, Space, message, Card, Row, Col, Statistic, Spin, Typography, Empty, Input } from "antd";
import { DatabaseOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchProjects, fetchMRAnalytics, collectMR } from "../../api/client";
import { collectActivity, fetchActivity } from "../../api/activity-client";
import { Line } from "@ant-design/charts";
import type { ProjectConfig } from "../../types";
import type { ActivityDay, ActivityFilters } from "../../types/activity";
import type { Role } from "../../types";
import type { GlobalFilters } from "../GlobalFilterBar";

interface Props { userRole: Role; filters: GlobalFilters; onContributorClick?: (name: string) => void; }

export function ActivityDashboard({ userRole, filters, onContributorClick }: Props) {
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [groupBy, setGroupBy] = useState<"day" | "week">("day");
  const [mrData, setMrData] = useState<any>(null);
  const [mrLoading, setMrLoading] = useState(true);

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data!); }); }, []);

  const effectiveProjectIds = useMemo(() => {
    if (filters.tags.length === 0) return filters.projectIds;
    const tagIds = projects.filter((p) => filters.tags.includes(p.tag)).map((p) => p.id);
    return [...new Set([...filters.projectIds, ...tagIds])];
  }, [filters.projectIds, filters.tags, projects]);

  const activityFilters = useMemo((): ActivityFilters => ({
    project_ids: effectiveProjectIds.length > 0 ? effectiveProjectIds : undefined,
    tag: filters.tags.length > 0 ? filters.tags : undefined,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    group_by: groupBy,
    contributor: filters.contributors.length > 0 ? filters.contributors[0] : undefined,
  }), [effectiveProjectIds, filters, groupBy]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try { const r = await fetchActivity(activityFilters); if (r.ok) setActivity(r.data!); }
    finally { setLoading(false); }
  }, [activityFilters]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadMRData = useCallback(async () => {
    setMrLoading(true);
    try {
      const ids = effectiveProjectIds.length > 0 ? effectiveProjectIds : undefined;
      const contrib = filters.contributors.length > 0 ? filters.contributors[0] : undefined;
      const r = await fetchMRAnalytics(ids, filters.dateFrom, filters.dateTo, contrib);
      if (r.ok) setMrData(r.data);
    } finally { setMrLoading(false); }
  }, [effectiveProjectIds, filters.dateFrom, filters.dateTo, filters.contributors]);

  useEffect(() => { loadMRData(); }, [loadMRData]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const ids = effectiveProjectIds.length > 0 ? effectiveProjectIds : projects.map((p) => p.id);
      for (const id of ids) {
        const actRes = await collectActivity(id, filters.dateFrom, filters.dateTo);
        if (actRes.ok) message.success(`Активность проекта ${id}: ${actRes.data!.days} дней`);
        else message.error(actRes.error!);
        const mrRes = await collectMR(id);
        if (mrRes.ok) message.success(`MR проекта ${id}: ${mrRes.data!.total} собрано`);
        else message.error(mrRes.error!);
      }
      loadData();
      loadMRData();
    } finally { setCollecting(false); }
  };

  const totals = useMemo(() => ({
    commits: activity.reduce((s, d) => s + d.commits, 0),
    merge_requests: activity.reduce((s, d) => s + d.merge_requests, 0),
    pipelines: activity.reduce((s, d) => s + d.pipelines, 0),
    days: activity.length,
  }), [activity]);

  const chartData = useMemo(() => activity.flatMap((d) => [
    { date: d.date, count: d.commits, type: "Коммиты" },
    { date: d.date, count: d.merge_requests, type: "MR" },
    { date: d.date, count: d.pipelines, type: "Пайплайны" },
  ]), [activity]);

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #e8956a 0%, #d4a574 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Активность проектов</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Коммиты, мерж-реквесты и пайплайны по дням/неделям</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Select value={groupBy} onChange={(v) => setGroupBy(v)} style={{ width: 120 }}
          options={[{ value: "day", label: "По дням" }, { value: "week", label: "По неделям" }]} />
        <Space>
          {userRole === "admin" && <Button type="primary" icon={<DatabaseOutlined />} loading={collecting} onClick={handleCollect}
            style={{ background: "#c47a5a", borderColor: "#c47a5a" }}>Собрать данные</Button>}
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="Всего коммитов" value={totals.commits} /></Card></Col>
        <Col span={6}><Card><Statistic title="Мерж-реквестов" value={totals.merge_requests} /></Card></Col>
        <Col span={6}><Card><Statistic title="Пайплайнов" value={totals.pipelines} /></Card></Col>
        <Col span={6}><Card><Statistic title="Дней в выборке" value={totals.days} /></Card></Col>
      </Row>

      <Card title={`Активность по ${groupBy === "week" ? "неделям" : "дням"}`} style={{ marginBottom: 24 }}>
        {loading ? <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div> : (
          chartData.length > 0 ? (
            <Line data={chartData} xField="date" yField="count" colorField="type"
              point={{ size: 3 }} style={{ lineWidth: 2 }}
              axis={{ x: { labelAutoRotate: true } }}
              scale={{ color: { range: ["#7eb0d5", "#b3cde3", "#ccebc5"] } }}
              tooltip={{ title: "date", items: [{ field: "count", name: "count" }] }}
            />
          ) : <Typography.Text type="secondary">Нет данных. Нажмите «Собрать данные».</Typography.Text>
        )}
      </Card>

      {mrLoading ? <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div> : mrData && (
        <>
          <h3 style={{ fontSize: 18, color: "var(--ant-color-text)", borderLeft: "4px solid #667eea", paddingLeft: 12, marginBottom: 16 }}>Merge Requests</h3>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={4}><Card><Statistic title="Всего MR" value={mrData.summary.total} /></Card></Col>
            <Col span={4}><Card><Statistic title="Замержено" value={mrData.summary.merged} valueStyle={{ color: "#3f8600" }} /></Card></Col>
            <Col span={4}><Card><Statistic title="Открыто" value={mrData.summary.opened} valueStyle={{ color: "#1677ff" }} /></Card></Col>
            <Col span={4}><Card><Statistic title="Закрыто" value={mrData.summary.closed} valueStyle={{ color: "#cf1322" }} /></Card></Col>
            <Col span={4}><Card><Statistic title="Ср. дн. до мержа" value={Number(mrData.summary.avg_days_to_merge) || 0} suffix="дн." /></Card></Col>
            <Col span={4}><Card><Statistic title="Ср. одобрений" value={Number(mrData.summary.avg_approvals) || 0} /></Card></Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card title="MR по неделям" size="small">
                {mrData.byWeek.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <Line data={mrData.byWeek.flatMap((w: any) => [
                    { date: w.week, count: w.total, type: "Всего" },
                    { date: w.week, count: w.merged, type: "Замержено" },
                  ])} xField="date" yField="count" colorField="type"
                    point={{ size: 3 }} style={{ lineWidth: 2 }}
                    scale={{ color: { range: ["#7eb0d5", "#3f8600"] } }}
                    tooltip={{ title: "date", items: [{ field: "count", name: "Количество" }] }}
                  />
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card title="Ср. время мержа по проектам (дней)" size="small">
                {mrData.avgMergeTime.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <div>
                    {mrData.avgMergeTime.map((p: any) => (
                      <div key={p.label} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                          <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 250 }}>{p.label}</span>
                          <span style={{ color: Number(p.avgDays) <= 2 ? "#3f8600" : Number(p.avgDays) <= 7 ? "#d4b106" : "#cf1322", fontWeight: 600 }}>{p.avgDays} дн.</span>
                        </div>
                        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "#f0f0f0" }}>
                          <div style={{ width: `${Math.min(100, (Number(p.avgDays) / 30) * 100)}%`, background: Number(p.avgDays) <= 2 ? "#3f8600" : Number(p.avgDays) <= 7 ? "#d4b106" : "#cf1322" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card title="Топ авторов MR (top 10)" size="small"
                extra={<span style={{ fontSize: 11, color: "#999" }}>Длина бара — относительно макс. кол-ва MR</span>}>
                {mrData.topAuthors.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <div>
                    {mrData.topAuthors.map((a: any, i: number) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13 }}>
                        <span style={{ width: 24, textAlign: "center", fontWeight: 700, color: i === 0 ? "#faad14" : i === 1 ? "#8c8c8c" : i === 2 ? "#d48806" : "#999", fontSize: 13 }}>
                          {i < 3 ? ["★", "●", "◆"][i] : `${i + 1}`}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 13, cursor: "pointer", color: "#667eea" }}
                            onClick={() => onContributorClick?.(a.email || a.name)}>{a.name}</div>
                          {a.email && <div style={{ fontSize: 11, color: "#999" }}>{a.email}</div>}
                          <div style={{ fontSize: 12, color: "var(--ant-color-text-secondary)" }}>{a.total} MR создано, {a.merged} замержено</div>
                        </div>
                        <div style={{ width: 120 }}>
                          <div style={{ height: 10, borderRadius: 5, background: "#f0f0f0", overflow: "hidden" }}>
                            <div style={{ width: `${(a.total / (mrData.topAuthors[0]?.total || 1)) * 100}%`, height: "100%", background: "linear-gradient(90deg, #667eea, #764ba2)", borderRadius: 5 }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 12, color: "var(--ant-color-text-secondary)", width: 30, textAlign: "right" }}>{a.total}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card title="Топ ревьюеров (top 10)" size="small"
                extra={<span style={{ fontSize: 11, color: "#999" }}>Кол-во одобрений MR (approvals)</span>}>
                {mrData.topReviewers.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных о ревью" /> : (
                  <div>
                    {mrData.topReviewers.map((r: any, i: number) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13 }}>
                        <span style={{ width: 24, textAlign: "center", fontWeight: 700, color: i < 3 ? ["#faad14", "#8c8c8c", "#d48806"][i] : "#999", fontSize: 13 }}>
                          {i < 3 ? ["★", "●", "◆"][i] : `${i + 1}`}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 13, cursor: "pointer", color: "#764ba2" }}
                            onClick={() => onContributorClick?.(r.email || r.name)}>{r.name}</div>
                          {r.email && <div style={{ fontSize: 11, color: "#999" }}>{r.email}</div>}
                          <div style={{ fontSize: 12, color: "var(--ant-color-text-secondary)" }}>{r.reviews} одобрений MR</div>
                        </div>
                        <div style={{ width: 120 }}>
                          <div style={{ height: 10, borderRadius: 5, background: "#f0f0f0", overflow: "hidden" }}>
                            <div style={{ width: `${(r.reviews / (mrData.topReviewers[0]?.reviews || 1)) * 100}%`, height: "100%", background: "linear-gradient(90deg, #764ba2, #f093fb)", borderRadius: 5 }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 12, color: "var(--ant-color-text-secondary)", width: 30, textAlign: "right" }}>{r.reviews}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
