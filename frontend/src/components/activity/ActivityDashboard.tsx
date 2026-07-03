import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Select, Button, Space, message, Card, Row, Col, Statistic, Spin, Typography, Empty, Input } from "antd";
import { DatabaseOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchProjects, fetchMRAnalytics, collectMR } from "../../api/client";
import { collectActivity, fetchActivity } from "../../api/activity-client";
import { delay } from "../../utils/collect";
import { CollectButton } from "../common/CollectButton";
import { Line } from "@ant-design/charts";
import { chartColors } from "../../utils/chartTheme";
import type { ProjectConfig } from "../../types";
import type { ActivityDay, ActivityFilters } from "../../types/activity";
import type { Role } from "../../types";
import type { GlobalFilters } from "../GlobalFilterBar";

interface Props { userRole: Role; filters: GlobalFilters; onContributorClick?: (name: string) => void; }

export const ActivityDashboard = memo(function ActivityDashboard({ userRole, filters, onContributorClick }: Props) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [groupBy, setGroupBy] = useState<"day" | "week">("day");
  const [mrData, setMrData] = useState<any>(null);
  const [mrLoading, setMrLoading] = useState(true);

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data!); }); }, []);

  const effectiveProjectIds = useMemo(() => {
    if (filters.tags.length === 0) return filters.projectIds;
    const tagIds = projects.filter((p) => p.tags?.some((t) => filters.tags.includes(t))).map((p) => p.id);
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
      const contribs = filters.contributors.length > 0 ? filters.contributors.join(",") : undefined;
      const r = await fetchMRAnalytics(ids, filters.dateFrom, filters.dateTo, contribs);
      if (r.ok) setMrData(r.data);
    } finally { setMrLoading(false); }
  }, [effectiveProjectIds, filters.dateFrom, filters.dateTo, filters.contributors]);

  useEffect(() => { loadMRData(); }, [loadMRData]);

  const mrChartData = useMemo(() => {
    if (!mrData?.byDay) return [];
    const byDay = mrData.byDay;
    if (groupBy === "week") {
      const weekMap = new Map<string, { total: number; merged: number }>();
      for (const d of byDay) {
        const weekStart = new Date(d.date);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const key = weekStart.toISOString().slice(0, 10);
        const existing = weekMap.get(key) || { total: 0, merged: 0 };
        existing.total += d.total;
        existing.merged += d.merged;
        weekMap.set(key, existing);
      }
      return Array.from(weekMap.entries()).flatMap(([date, v]) => [
        { date, count: v.total, type: "Всего" },
        { date, count: v.merged, type: "Замержено" },
      ]);
    }
    return byDay.flatMap((d: any) => [
      { date: d.date, count: d.total, type: "Всего" },
      { date: d.date, count: d.merged, type: "Замержено" },
    ]);
  }, [mrData, groupBy]);

  const activityProjectIds = useMemo(() => effectiveProjectIds.length > 0 ? effectiveProjectIds : projects.map((p) => p.id), [effectiveProjectIds, projects]);

  const loadAll = useCallback(() => { loadData(); loadMRData(); }, []);

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

  const cc = chartColors();

  return (
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ background: "linear-gradient(135deg, #E0C0A0 0%, #D8D0C0 100%)", color: "#111315", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Активность проектов</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Коммиты, мерж-реквесты и пайплайны по дням/неделям</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Select value={groupBy} onChange={(v) => setGroupBy(v)} style={{ width: 120 }}
          options={[{ value: "day", label: "По дням" }, { value: "week", label: "По неделям" }]} />
        <Space>
          {userRole === "admin" && <CollectButton collector="activity_mr" projectIds={activityProjectIds} onComplete={loadAll} color="#E0C0A0" label="Собрать данные" />}
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
              axis={{
                x: { labelAutoRotate: true, labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
                y: { labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
              }}
              scale={{ color: { range: ["#7eb0d5", "#b3cde3", "#ccebc5"] } }}
              tooltip={{ title: "date", items: [{ field: "count", name: "count" }] }}
            />
          ) : <Typography.Text type="secondary">Нет данных. Нажмите «Собрать данные».</Typography.Text>
        )}
      </Card>

      {mrLoading ? <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div> : mrData && (
        <>
          <h3 style={{ fontSize: 18, color: "var(--ant-color-text)", borderLeft: "4px solid #B0C0D8", paddingLeft: 12, marginBottom: 16 }}>Merge Requests</h3>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={4}><Card style={{ height: "100%" }}><Statistic title="Всего MR" value={mrData.summary.total} /></Card></Col>
            <Col span={4}><Card style={{ height: "100%" }}><Statistic title="Замержено" value={mrData.summary.merged} valueStyle={{ color: "#21B573" }} /></Card></Col>
            <Col span={4}><Card style={{ height: "100%" }}><Statistic title="Открыто" value={mrData.summary.opened} valueStyle={{ color: "#3A8DFF" }} /></Card></Col>
            <Col span={4}><Card style={{ height: "100%" }}><Statistic title="Закрыто" value={mrData.summary.closed} valueStyle={{ color: "#E5484D" }} /></Card></Col>
            <Col span={4}><Card style={{ height: "100%" }}><Statistic title="Ср. дн. до мержа" value={Number(mrData.summary.avg_days_to_merge) || 0} suffix="дн." /></Card></Col>
            <Col span={4}><Card style={{ height: "100%" }}><Statistic title="Ср. одобрений" value={Number(mrData.summary.avg_approvals) || 0} /></Card></Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card title={groupBy === "day" ? "MR по дням" : "MR по неделям"} size="small" style={{ height: "100%" }}>
                {mrChartData.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <Line data={mrChartData} xField="date" yField="count" colorField="type"
                    point={{ size: 3 }} style={{ lineWidth: 2 }}
                    axis={{
                      x: { labelAutoRotate: true, labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
                      y: { labelFill: cc.axisLabel, lineStroke: cc.axisLine, gridStroke: cc.gridLine, tickStroke: cc.axisLine },
                    }}
                    scale={{ color: { range: ["#7eb0d5", "#21B573"] } }}
                    tooltip={{ title: "date", items: [{ field: "count", name: "Количество" }] }}
                  />
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card title="Ср. время мержа по проектам (дней)" size="small" style={{ height: "100%" }}>
                {mrData.avgMergeTime.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <div>
                    {mrData.avgMergeTime.map((p: any) => (
                      <div key={p.label} style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                          <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 250 }}>{p.label}</span>
                          <span style={{ color: Number(p.avgDays) <= 2 ? "#21B573" : Number(p.avgDays) <= 7 ? "#FFB020" : "#E5484D", fontWeight: 600 }}>{p.avgDays} дн.</span>
                        </div>
                        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--ant-color-fill-secondary)" }}>
                          <div style={{ width: `${Math.min(100, (Number(p.avgDays) / 30) * 100)}%`, background: Number(p.avgDays) <= 2 ? "#21B573" : Number(p.avgDays) <= 7 ? "#FFB020" : "#E5484D" }} />
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
              <Card title="Топ авторов MR (top 10)" size="small" style={{ height: "100%" }}
                extra={<span style={{ fontSize: 11, color: "var(--ant-color-textSecondary)" }}>Длина бара — относительно макс. кол-ва MR</span>}>
                {mrData.topAuthors.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <div>
                    {mrData.topAuthors.map((a: any, i: number) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13 }}>
                        <span style={{ width: 24, textAlign: "center", fontWeight: 700, color: i === 0 ? "#faad14" : i === 1 ? "#8c8c8c" : i === 2 ? "#d48806" : "#999", fontSize: 13 }}>
                          {i < 3 ? ["★", "●", "◆"][i] : `${i + 1}`}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 13, cursor: "pointer", color: "#3A8DFF" }}
                            onClick={() => onContributorClick?.(a.email || a.name)}>{a.name}</div>
                          {a.email && <div style={{ fontSize: 11, color: "var(--ant-color-textTertiary)" }}>{a.email}</div>}
                          <div style={{ fontSize: 12, color: "var(--ant-color-text-secondary)" }}>{a.total} MR создано, {a.merged} замержено</div>
                        </div>
                        <div style={{ width: 120 }}>
                          <div style={{ height: 10, borderRadius: 5, background: "var(--ant-color-fill-secondary)", overflow: "hidden" }}>
                            <div style={{ width: `${(a.total / (mrData.topAuthors[0]?.total || 1)) * 100}%`, height: "100%", background: "linear-gradient(90deg, #B0C8E0, #A8D8C8)", borderRadius: 5 }} />
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
              <Card title="Топ ревьюеров (top 10)" size="small" style={{ height: "100%" }}
                extra={<span style={{ fontSize: 11, color: "var(--ant-color-textSecondary)" }}>Кол-во одобрений MR (approvals)</span>}>
                {mrData.topReviewers.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Нет данных о ревью" /> : (
                  <div>
                    {mrData.topReviewers.map((r: any, i: number) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13 }}>
                        <span style={{ width: 24, textAlign: "center", fontWeight: 700, color: i < 3 ? ["#faad14", "#8c8c8c", "#d48806"][i] : "#999", fontSize: 13 }}>
                          {i < 3 ? ["★", "●", "◆"][i] : `${i + 1}`}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 13, cursor: "pointer", color: "#3A8DFF" }}
                            onClick={() => onContributorClick?.(r.email || r.name)}>{r.name}</div>
                          {r.email && <div style={{ fontSize: 11, color: "var(--ant-color-textTertiary)" }}>{r.email}</div>}
                          <div style={{ fontSize: 12, color: "var(--ant-color-text-secondary)" }}>{r.reviews} одобрений MR</div>
                        </div>
                        <div style={{ width: 120 }}>
                          <div style={{ height: 10, borderRadius: 5, background: "var(--ant-color-fill-secondary)", overflow: "hidden" }}>
                            <div style={{ width: `${(r.reviews / (mrData.topReviewers[0]?.reviews || 1)) * 100}%`, height: "100%", background: "linear-gradient(90deg, #B0D8D0, #C8C0D8)", borderRadius: 5 }} />
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
});
