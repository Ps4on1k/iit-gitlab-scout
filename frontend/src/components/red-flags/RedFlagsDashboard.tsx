import { useState, useEffect, useMemo, useCallback, memo } from "react";
import { Card, Row, Col, Statistic, Button, Table, Tag, Modal, Empty, Tooltip, Typography, Descriptions } from "antd";
import { ReloadOutlined, WarningOutlined, MoonOutlined, BranchesOutlined, ThunderboltOutlined, MergeOutlined, RocketOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { fetchProjects, fetchRedFlags } from "../../api/client";
import { Column } from "@ant-design/charts";
import type { ProjectConfig, Role } from "../../types";
import type { GlobalFilters } from "../GlobalFilterBar";
import type { ProjectRedFlags, ContributorRedFlag } from "../../types/analytics";
import { matchesContributorFilter } from "../../utils/contributorFilter";

interface RedFlagsData {
  project: ProjectRedFlags;
  contributors: ContributorRedFlag[];
  summary: { project_flags: number; contributor_flags: number; critical_count: number; warning_count: number };
}

interface Props { userRole: Role; filters: GlobalFilters; onContributorClick?: (name: string) => void; }

function FlagTag({ value, redThreshold, yellowThreshold, suffix = "%" }: { value: number; redThreshold: number; yellowThreshold: number; suffix?: string }) {
  let color = "#10b981"; let label = "OK";
  if (value >= redThreshold) { color = "#ef4444"; label = "Критично"; }
  else if (value >= yellowThreshold) { color = "#f59e0b"; label = "Внимание"; }
  return <Tag color={color}>{value}{suffix} — {label}</Tag>;
}

function FlagTagInv({ value, redThreshold, yellowThreshold, suffix = "" }: { value: number; redThreshold: number; yellowThreshold: number; suffix?: string }) {
  let color = "#10b981"; let label = "OK";
  if (value <= redThreshold) { color = "#ef4444"; label = "Критично"; }
  else if (value <= yellowThreshold) { color = "#f59e0b"; label = "Внимание"; }
  return <Tag color={color}>{value}{suffix} — {label}</Tag>;
}

export const RedFlagsDashboard = memo(function RedFlagsDashboard({ userRole, filters, onContributorClick }: Props) {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [data, setData] = useState<RedFlagsData | null>(null);
  const [detailEntry, setDetailEntry] = useState<ContributorRedFlag | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const isDark = typeof window !== "undefined" && localStorage.getItem("darkMode") === "true";

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data!); }); }, []);

  const effectiveProjectIds = useMemo(() => {
    if (filters.tags.length === 0) return filters.projectIds;
    const tagIds = projects.filter((p) => p.tags?.some((t) => filters.tags.includes(t))).map((p) => p.id);
    return [...new Set([...filters.projectIds, ...tagIds])];
  }, [filters.projectIds, filters.tags, projects]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchRedFlags(
        effectiveProjectIds.length > 0 ? effectiveProjectIds : undefined,
        filters.dateFrom,
        filters.dateTo
      );
      if (res.ok) setData(res.data!);
    } finally { setLoading(false); }
  }, [effectiveProjectIds, filters.dateFrom, filters.dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  const p = data?.project;
  const summary = data?.summary;
  const allContributors = data?.contributors || [];

  const filteredContributors = useMemo(() => {
    if (filters.contributors.length === 0) return allContributors;
    return allContributors.filter((c) => matchesContributorFilter(c, filters.contributors));
  }, [allContributors, filters.contributors]);

  const contributorColumns = useMemo(() => [
    {
      title: "Оценка",
      dataIndex: "flag_score",
      key: "flag_score",
      width: 80,
      sorter: (a: ContributorRedFlag, b: ContributorRedFlag) => a.flag_score - b.flag_score,
      defaultSortOrder: "descend" as const,
      render: (v: number) => {
        let color = "#10b981"; let icon = "✓";
        if (v >= 6) { color = "#ef4444"; icon = "🔴"; }
        else if (v >= 2) { color = "#f59e0b"; icon = "🟡"; }
        return <span style={{ fontSize: 14, display: "inline-flex", alignItems: "center", gap: 4 }}><span>{icon}</span><span style={{ color, fontWeight: "bold" }}>{v}</span></span>;
      },
    },
    {
      title: "Контрибьютор",
      dataIndex: "author_name",
      key: "author_name",
      render: (name: string, record: ContributorRedFlag) => (
        <span style={{ cursor: "pointer", color: "#3A8DFF" }} onClick={() => onContributorClick?.(record.author_email)}>{name}</span>
      ),
    },
    {
      title: "Коммиты",
      dataIndex: "total_commits",
      key: "total_commits",
      sorter: (a: ContributorRedFlag, b: ContributorRedFlag) => a.total_commits - b.total_commits,
    },
    {
      title: "🌙 Ночь",
      dataIndex: "night_ratio",
      key: "night_ratio",
      sorter: (a: ContributorRedFlag, b: ContributorRedFlag) => a.night_ratio - b.night_ratio,
      render: (v: number) => <FlagTag value={v} redThreshold={25} yellowThreshold={10} />,
    },
    {
      title: "🟡 Жёлтая",
      dataIndex: "yellow_zone_ratio",
      key: "yellow_zone_ratio",
      sorter: (a: ContributorRedFlag, b: ContributorRedFlag) => a.yellow_zone_ratio - b.yellow_zone_ratio,
      render: (v: number) => <FlagTag value={v} redThreshold={50} yellowThreshold={25} />,
    },
    {
      title: "🚌 Bus",
      dataIndex: "bus_factor_pct",
      key: "bus_factor_pct",
      sorter: (a: ContributorRedFlag, b: ContributorRedFlag) => a.bus_factor_pct - b.bus_factor_pct,
      render: (v: number) => v > 0 ? <FlagTag value={v} redThreshold={70} yellowThreshold={50} suffix="% проекта" /> : <Tag>—</Tag>,
    },
    {
      title: "🔀 Churn",
      dataIndex: "churn_pct",
      key: "churn_pct",
      sorter: (a: ContributorRedFlag, b: ContributorRedFlag) => a.churn_pct - b.churn_pct,
      render: (v: number) => v > 0 ? <FlagTag value={v} redThreshold={40} yellowThreshold={25} /> : <Tag>—</Tag>,
    },
    {
      title: "🚀 Деплои %",
      dataIndex: "deploy_success_rate",
      key: "deploy_success_rate",
      sorter: (a: ContributorRedFlag, b: ContributorRedFlag) => a.deploy_success_rate - b.deploy_success_rate,
      render: (v: number) => v > 0 ? <FlagTagInv value={v} redThreshold={50} yellowThreshold={75} suffix="%" /> : <Tag>Нет данных</Tag>,
    },
    {
      title: "",
      key: "actions",
      width: 80,
      render: (_: any, record: ContributorRedFlag) => (
        <Button size="small" type="link" onClick={() => { setDetailEntry(record); setDetailOpen(true); }}>Детали</Button>
      ),
    },
  ], [onContributorClick]);

  const hourChartData = useMemo(() => {
    if (!detailEntry) return [];
    return Object.entries(detailEntry.night_commits_by_hour)
      .map(([h, cnt]) => ({ hour: h.padStart(2, "0") + ":00", count: cnt }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
  }, [detailEntry]);

  return (
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #EF4444 0%, #F59E0B 100%)", color: "#fff", padding: "14px 24px", borderRadius: "12px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 20, marginBottom: 4 }}>Красные флаги</h1>
          <div style={{ opacity: 0.9, fontSize: 13 }}>Проблемные места в проекте и контрибьюторах</div>
        </div>
        {summary && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: "bold" }}>{summary.critical_count + summary.warning_count}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>флагов</div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
        <Button icon={<QuestionCircleOutlined />} onClick={() => setLegendOpen(true)}>Легенда</Button>
        {summary && (
          <>
            <Tag color="red">Критичных: {summary.critical_count}</Tag>
            <Tag color="orange">Предупреждений: {summary.warning_count}</Tag>
            <Tag color="green">Норма: {filteredContributors.length - summary.contributor_flags}</Tag>
          </>
        )}
      </div>

      {/* Project metrics cards */}
      {p && (
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col span={4}>
            <Card size="small"><Statistic title="Застаревшие ветки" value={p.stale_branches_pct} suffix="%" prefix={<BranchesOutlined />} valueStyle={{ color: p.stale_branches_pct > 30 ? "#ef4444" : p.stale_branches_pct > 15 ? "#f59e0b" : "#10b981" }} /></Card>
          </Col>
          <Col span={4}>
            <Card size="small"><Statistic title="Падение пайплайнов" value={p.pipeline_failure_rate} suffix="%" prefix={<ThunderboltOutlined />} valueStyle={{ color: p.pipeline_failure_rate > 40 ? "#ef4444" : p.pipeline_failure_rate > 20 ? "#f59e0b" : "#10b981" }} /></Card>
          </Col>
          <Col span={4}>
            <Card size="small"><Statistic title="MR без ревью" value={p.mr_without_review_pct} suffix="%" prefix={<MergeOutlined />} valueStyle={{ color: p.mr_without_review_pct > 50 ? "#ef4444" : p.mr_without_review_pct > 20 ? "#f59e0b" : "#10b981" }} /></Card>
          </Col>
          <Col span={4}>
            <Card size="small"><Statistic title="Долгие MR (>14д)" value={p.long_living_mrs} prefix={<WarningOutlined />} valueStyle={{ color: p.long_living_mrs > 10 ? "#ef4444" : p.long_living_mrs > 3 ? "#f59e0b" : "#10b981" }} /></Card>
          </Col>
          <Col span={4}>
            <Card size="small"><Statistic title="Деплои/мес" value={p.deploy_frequency_monthly} prefix={<RocketOutlined />} valueStyle={{ color: p.deploy_frequency_monthly < 1 ? "#ef4444" : p.deploy_frequency_monthly < 2 ? "#f59e0b" : "#10b981" }} /></Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="Проблем проекта" value={p.total_flags} prefix={<WarningOutlined style={{ color: p.total_flags > 5 ? "#ef4444" : p.total_flags > 2 ? "#f59e0b" : "#10b981" }} />} valueStyle={{ color: p.total_flags > 5 ? "#ef4444" : p.total_flags > 2 ? "#f59e0b" : "#10b981" }} />
            </Card>
          </Col>
        </Row>
      )}

      {/* Legend Modal */}
      <Modal
        title="Легенда — Красные флаги"
        open={legendOpen}
        onCancel={() => setLegendOpen(false)}
        footer={null}
        width={700}
      >
        <div style={{ color: isDark ? "#e2e8f0" : "#1f2937" }}>
          <Typography.Title level={5} style={{ marginTop: 0, color: isDark ? "#e2e8f0" : "#1f2937" }}>Метрики проекта</Typography.Title>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={<><BranchesOutlined /> Застаревшие ветки</>}>
              Доля веток, не смержённых и без коммитов {'>'}90 дней. <Tag color="red">{'>'}30%</Tag> критично, <Tag color="orange">{'>'}15%</Tag> внимание
            </Descriptions.Item>
            <Descriptions.Item label={<><ThunderboltOutlined /> Падение пайплайнов</>}>
              Доля failed пайплайнов за период. <Tag color="red">{'>'}40%</Tag> критично, <Tag color="orange">{'>'}20%</Tag> внимание
            </Descriptions.Item>
            <Descriptions.Item label={<><MergeOutlined /> MR без ревью</>}>
              Доля смерженных MR без назначенных ревьюеров. <Tag color="red">{'>'}50%</Tag> критично, <Tag color="orange">{'>'}20%</Tag> внимание
            </Descriptions.Item>
            <Descriptions.Item label={<><WarningOutlined /> Долгие MR</>}>
              Открытые MR старше 14 дней. <Tag color="red">{'>'}10</Tag> критично, <Tag color="orange">{'>'}3</Tag> внимание
            </Descriptions.Item>
            <Descriptions.Item label={<><RocketOutlined /> Деплои/мес</>}>
              Частота деплоев в месяц. <Tag color="red">{'<'}1</Tag> критично, <Tag color="orange">{'<'}2</Tag> внимание
            </Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 16, color: isDark ? "#e2e8f0" : "#1f2937" }}>Метрики контрибьютора</Typography.Title>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="🌙 Ночные коммиты">
              Доля коммитов в период 20:00–08:00 MSK. <Tag color="red">{'>'}25%</Tag> критично, <Tag color="orange">{'>'}10%</Tag> внимание
            </Descriptions.Item>
            <Descriptions.Item label="🟡 Жёлтая зона">
              Дни без коммитов в 16:00–19:00 MSK. <Tag color="red">{'>'}50%</Tag> критично, <Tag color="orange">{'>'}25%</Tag> внимание
            </Descriptions.Item>
            <Descriptions.Item label="🚌 Bus factor">
              Доля коммитов проекта от одного человека. <Tag color="red">{'>'}70%</Tag> критично (точка отказа), <Tag color="orange">{'>'}50%</Tag> внимание
            </Descriptions.Item>
            <Descriptions.Item label="🔀 Churn">
              Дни с нулевым net changes (additions = deletions). <Tag color="red">{'>'}40%</Tag> критично, <Tag color="orange">{'>'}25%</Tag> внимание
            </Descriptions.Item>
            <Descriptions.Item label="📋 Direct commits">
              Коммиты в main/master без MR. <Tag color="red">{'>'}5</Tag> критично, <Tag color="orange">{'>'}2</Tag> внимание
            </Descriptions.Item>
            <Descriptions.Item label="💀 Инactivité">
              Контрибьютор был активен в начале периода, затем исчез. Статус: <Tag color="red">исчез</Tag>
            </Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 16, color: isDark ? "#e2e8f0" : "#1f2937" }}>Система оценки</Typography.Title>
          <div style={{ fontSize: 13, color: isDark ? "#94a3b8" : "#6b7280" }}>
            <div><Tag color="red">🔴 Критично</Tag> = 3 балла — высокий риск, требует внимания</div>
            <div><Tag color="orange">🟡 Внимание</Tag> = 1 балл — стоит проверить</div>
            <div><Tag color="green">🟢 Норма</Tag> = 0 баллов — всё ОК</div>
            <div style={{ marginTop: 8 }}>Оценка контрибьютора — сумма баллов по всем метрикам. Чем выше, тем больше внимания нужно.</div>
          </div>
        </div>
      </Modal>

      {/* Contributors table */}
      <Card title={`Контрибьюторы (${filteredContributors.length})`} style={{ marginBottom: 20 }}>
        <Table
          columns={contributorColumns}
          dataSource={filteredContributors}
          rowKey="author_email"
          loading={loading}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ["10", "20", "50", "100"] }}
          locale={{ emptyText: <Empty description="Нет данных по контрибьюторам" /> }}
        />
      </Card>

      {/* Detail modal */}
      <Modal
        title={`Детали: ${detailEntry?.author_name}`}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={700}
      >
        {detailEntry && (
          <div style={{ color: isDark ? "#e2e8f0" : "#1f2937" }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Всего коммитов">{detailEntry.total_commits}</Descriptions.Item>
              <Descriptions.Item label="Оценка">
                <span style={{ color: detailEntry.flag_score >= 6 ? "#ef4444" : detailEntry.flag_score >= 2 ? "#f59e0b" : "#10b981", fontWeight: "bold" }}>
                  {detailEntry.flag_score} баллов
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="🌙 Ночные коммиты">
                {detailEntry.night_commits} / {detailEntry.total_commits} ({detailEntry.night_ratio}%)
                <Tag color={detailEntry.night_ratio > 25 ? "red" : detailEntry.night_ratio > 10 ? "orange" : "green"} style={{ marginLeft: 8 }}>
                  {detailEntry.night_ratio > 25 ? "Критично" : detailEntry.night_ratio > 10 ? "Внимание" : "OK"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="🟡 Жёлтая зона">
                {detailEntry.missing_yellow_zone_days} / {detailEntry.total_active_days} дней ({detailEntry.yellow_zone_ratio}%)
                <Tag color={detailEntry.yellow_zone_ratio > 50 ? "red" : detailEntry.yellow_zone_ratio > 25 ? "orange" : "green"} style={{ marginLeft: 8 }}>
                  {detailEntry.yellow_zone_ratio > 50 ? "Критично" : detailEntry.yellow_zone_ratio > 25 ? "Внимание" : "OK"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="🚌 Bus factor">
                {detailEntry.bus_factor_pct}% проекта
                <Tag color={detailEntry.bus_factor_pct > 70 ? "red" : detailEntry.bus_factor_pct > 50 ? "orange" : "green"} style={{ marginLeft: 8 }}>
                  {detailEntry.bus_factor_pct > 70 ? "Критично" : detailEntry.bus_factor_pct > 50 ? "Внимание" : "OK"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="🔀 Churn">
                {detailEntry.churn_pct}% дней с net=0
                <Tag color={detailEntry.churn_pct > 40 ? "red" : detailEntry.churn_pct > 25 ? "orange" : "green"} style={{ marginLeft: 8 }}>
                  {detailEntry.churn_pct > 40 ? "Критично" : detailEntry.churn_pct > 25 ? "Внимание" : "OK"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="🚀 Надёжность деплоя">
                {detailEntry.deploy_success_rate > 0 ? `${detailEntry.deploy_success_rate}% success` : "Нет данных"}
                {detailEntry.deploy_success_rate > 0 && (
                  <Tag color={detailEntry.deploy_success_rate < 50 ? "red" : detailEntry.deploy_success_rate < 75 ? "orange" : "green"} style={{ marginLeft: 8 }}>
                    {detailEntry.deploy_success_rate < 50 ? "Критично" : detailEntry.deploy_success_rate < 75 ? "Внимание" : "OK"}
                  </Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="📋 Крупные MR">
                {detailEntry.large_mrs} MR {'>'}500 строк
                <Tag color={detailEntry.large_mrs > 3 ? "red" : detailEntry.large_mrs > 1 ? "orange" : "green"} style={{ marginLeft: 8 }}>
                  {detailEntry.large_mrs > 3 ? "Критично" : detailEntry.large_mrs > 1 ? "Внимание" : "OK"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="📋 Direct commits">
                {detailEntry.direct_commits} в main/master
                <Tag color={detailEntry.direct_commits > 5 ? "red" : detailEntry.direct_commits > 2 ? "orange" : "green"} style={{ marginLeft: 8 }}>
                  {detailEntry.direct_commits > 5 ? "Критично" : detailEntry.direct_commits > 2 ? "Внимание" : "OK"}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="💀 Инactivité" span={2}>
                <Tag color={detailEntry.disappeared ? "red" : "green"}>
                  {detailEntry.disappeared ? "Контрибьютор исчез в середине периода" : "Активен на протяжении периода"}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {hourChartData.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Typography.Text strong style={{ color: isDark ? "#e2e8f0" : "#1f2937" }}>Распределение ночных коммитов по часам (MSK)</Typography.Text>
                <Column
                  data={hourChartData}
                  xField="hour"
                  yField="count"
                  colorField="hour"
                  height={180}
                  axis={{ x: { title: { text: "Час" } }, y: { title: { text: "Кол-во" } } }}
                  style={{ fillColor: "#8b5cf6" }}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
});
