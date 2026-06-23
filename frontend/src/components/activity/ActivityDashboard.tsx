import { useState, useEffect, useMemo, useCallback } from "react";
import { Select, DatePicker, Button, Space, message, Tag, Card, Row, Col, Statistic, Spin, Typography, Empty, Collapse, Input } from "antd";
import dayjs from "dayjs";
import { DatabaseOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { fetchProjects, fetchMRAnalytics, collectMR } from "../../api/client";
import { collectActivity, fetchActivity } from "../../api/activity-client";
import { getTagColor } from "../../utils/tagColors";
import { Line, Pie } from "@ant-design/charts";
import type { ProjectConfig } from "../../types";
import type { ActivityDay, ActivityFilters } from "../../types/activity";
import type { Role } from "../../types";

const { RangePicker } = DatePicker;

interface Props { userRole: Role; onContributorClick?: (name: string) => void; selectedContributor?: string; }

function getDefaultDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

export function ActivityDashboard({ userRole, onContributorClick, selectedContributor }: Props) {
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [activity, setActivity] = useState<ActivityDay[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string | undefined>(getDefaultDateFrom);
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [groupBy, setGroupBy] = useState<"day" | "week">("day");
  const [mrData, setMrData] = useState<any>(null);
  const [mrLoading, setMrLoading] = useState(true);
  const [contributorFilter, setContributorFilter] = useState<string>("");

  useEffect(() => { if (selectedContributor) setContributorFilter(selectedContributor); }, [selectedContributor]);

  useEffect(() => {
    fetchProjects().then((res) => { if (res.ok) setProjects(res.data!); });
  }, []);

  const filters = useMemo((): ActivityFilters => ({
    project_ids: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
    tag: selectedTags.length > 0 ? selectedTags : undefined,
    date_from: dateFrom,
    date_to: dateTo,
    group_by: groupBy,
    contributor: contributorFilter || undefined,
  }), [selectedProjectIds, selectedTags, dateFrom, dateTo, groupBy, contributorFilter]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchActivity(filters);
      if (res.ok) setActivity(res.data!);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadMRData = useCallback(async () => {
    setMrLoading(true);
    try {
      const ids = selectedProjectIds.length > 0 ? selectedProjectIds : undefined;
      const res = await fetchMRAnalytics(ids, dateFrom, dateTo);
      if (res.ok) setMrData(res.data);
    } finally { setMrLoading(false); }
  }, [selectedProjectIds, dateFrom, dateTo]);

  useEffect(() => { loadMRData(); }, [loadMRData]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const targetIds = selectedProjectIds.length > 0 ? selectedProjectIds : projects.map((p) => p.id);
      for (const id of targetIds) {
        const actRes = await collectActivity(id, dateFrom, dateTo);
        if (actRes.ok) message.success(`Активность проекта ${id}: ${actRes.data!.days} дней`);
        else message.error(actRes.error!);
        const mrRes = await collectMR(id);
        if (mrRes.ok) message.success(`MR проекта ${id}: ${mrRes.data!.total} собрано`);
        else message.error(mrRes.error!);
      }
      loadData();
      loadMRData();
    } finally {
      setCollecting(false);
    }
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

  const projectOptions = useMemo(() =>
    projects.map((p) => ({ value: p.id, label: p.tag ? `${p.label} [${p.tag}]` : p.label })),
    [projects]
  );

  const tagOptions = useMemo(() => {
    const tags = new Set<string>();
    for (const p of projects) { if (p.tag) tags.add(p.tag); }
    return Array.from(tags).sort().map((t) => ({ value: t, label: t }));
  }, [projects]);

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #e8956a 0%, #d4a574 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Активность проектов</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Коммиты, мерж-реквесты и пайплайны по дням/неделям</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        <Select mode="multiple" placeholder="Проекты" allowClear showSearch optionFilterProp="label"
          style={{ minWidth: 360, maxWidth: 600 }} value={selectedProjectIds} onChange={setSelectedProjectIds}
          options={projectOptions}
          tagRender={({ label, closable, onClose }) => {
            const tagText = String(label);
            const tagMatch = tagText.match(/\[(.+)\]$/);
            const tagVal = tagMatch ? tagMatch[1] : "";
            const c = tagVal ? getTagColor(tagVal) : { bg: "#f5222d", text: "#fff" };
            return <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: c.bg, color: c.text, border: "none" }}>{label}</Tag>;
          }}
          maxTagCount="responsive" />
        {tagOptions.length > 0 && (
          <Select mode="multiple" placeholder="Теги" allowClear style={{ minWidth: 180 }}
            value={selectedTags} onChange={setSelectedTags} options={tagOptions}
            tagRender={({ label, closable, onClose }) => <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: "#1677ff", color: "white", border: "none" }}>{label}</Tag>} />
        )}
        <RangePicker defaultValue={[dayjs().subtract(90, "day"), dayjs()]} onChange={(dates) => { setDateFrom(dates?.[0]?.format("YYYY-MM-DD")); setDateTo(dates?.[1]?.format("YYYY-MM-DD")); }} />
        <Select value={groupBy} onChange={(v) => setGroupBy(v)} style={{ width: 120 }}
          options={[{ value: "day", label: "По дням" }, { value: "week", label: "По неделям" }]} />
        <Input placeholder="Контрибьютор..." prefix={<SearchOutlined />} allowClear style={{ width: 200 }} value={contributorFilter} onChange={(e) => setContributorFilter(e.target.value)} />
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
            <Line
              data={chartData}
              xField="date"
              yField="count"
              colorField="type"
              point={{ size: 3 }}
              style={{ lineWidth: 2 }}
              axis={{ x: { labelAutoRotate: true } }}
              scale={{ color: { range: ["#7eb0d5", "#b3cde3", "#ccebc5"] } }}
              tooltip={{
                title: "date",
                items: [{ field: "count", name: "count" }],
              }}
            />
          ) : <Typography.Text type="secondary">Нет данных. Нажмите «Собрать данные».</Typography.Text>
        )}
      </Card>

      {mrLoading ? <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div> : mrData && (
        <>
          <h3 style={{ fontSize: 18, color: "#333", borderLeft: "4px solid #667eea", paddingLeft: 12, marginBottom: 16 }}>Merge Requests</h3>
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={4}><Card><Statistic title="Всего MR" value={mrData.summary.total} /></Card></Col>
            <Col span={4}><Card><Statistic title="Замержено" value={mrData.summary.merged} valueStyle={{ color: "#3f8600" }} /></Card></Col>
            <Col span={4}><Card><Statistic title="Открыто" value={mrData.summary.opened} valueStyle={{ color: "#1677ff" }} /></Card></Col>
            <Col span={4}><Card><Statistic title="Закрыто" value={mrData.summary.closed} valueStyle={{ color: "#cf1322" }} /></Card></Col>
            <Col span={4}><Card><Statistic title="Ср. дн. до мержа" value={mrData.summary.avg_days_to_merge || 0} suffix="дн." /></Card></Col>
            <Col span={4}><Card><Statistic title="Ср. одобрений" value={mrData.summary.avg_approvals || 0} /></Card></Col>
          </Row>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card title="MR по неделям" size="small">
                {mrData.byWeek.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <Line
                    data={mrData.byWeek.flatMap((w: any) => [
                      { date: w.week, count: w.total, type: "Всего" },
                      { date: w.week, count: w.merged, type: "Замержено" },
                    ])}
                    xField="date" yField="count" colorField="type"
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
                          <span style={{ color: p.avgDays <= 2 ? "#3f8600" : p.avgDays <= 7 ? "#d4b106" : "#cf1322", fontWeight: 600 }}>{p.avgDays} дн.</span>
                        </div>
                        <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "#f0f0f0" }}>
                          <div style={{ width: `${Math.min(100, (p.avgDays / 30) * 100)}%`, background: p.avgDays <= 2 ? "#3f8600" : p.avgDays <= 7 ? "#d4b106" : "#cf1322" }} />
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
                extra={<span style={{ fontSize: 11, color: "#999" }}>Длина бара — относительно автора с макс. кол-вом MR</span>}>
                {mrData.topAuthors.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> : (
                  <div>
                    {mrData.topAuthors.map((a: any, i: number) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, fontSize: 13 }}>
                        <span style={{ width: 24, textAlign: "center", fontWeight: 700, color: i === 0 ? "#faad14" : i === 1 ? "#8c8c8c" : i === 2 ? "#d48806" : "#999", fontSize: 13 }}>
                          {i < 3 ? ["★", "●", "◆"][i] : `${i + 1}`}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, fontSize: 13, cursor: "pointer", color: "#667eea" }}
                            onClick={() => onContributorClick?.(a.name)}>{a.name}</div>
                          <div style={{ fontSize: 12, color: "#666" }}>{a.total} MR создано, {a.merged} замержено</div>
                        </div>
                        <div style={{ width: 120 }}>
                          <div style={{ height: 10, borderRadius: 5, background: "#f0f0f0", overflow: "hidden" }}>
                            <div style={{ width: `${(a.total / (mrData.topAuthors[0]?.total || 1)) * 100}%`, height: "100%", background: "linear-gradient(90deg, #667eea, #764ba2)", borderRadius: 5 }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 12, color: "#666", width: 30, textAlign: "right" }}>{a.total}</span>
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
                            onClick={() => onContributorClick?.(r.name)}>{r.name}</div>
                          <div style={{ fontSize: 12, color: "#666" }}>{r.reviews} одобрений MR</div>
                        </div>
                        <div style={{ width: 120 }}>
                          <div style={{ height: 10, borderRadius: 5, background: "#f0f0f0", overflow: "hidden" }}>
                            <div style={{ width: `${(r.reviews / (mrData.topReviewers[0]?.reviews || 1)) * 100}%`, height: "100%", background: "linear-gradient(90deg, #764ba2, #f093fb)", borderRadius: 5 }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 12, color: "#666", width: 30, textAlign: "right" }}>{r.reviews}</span>
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
