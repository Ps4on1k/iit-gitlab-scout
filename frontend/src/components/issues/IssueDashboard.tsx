import { useState, useEffect, useMemo } from "react";
import { Card, Row, Col, Statistic, Table, Select, Button, Tag, message, Typography } from "antd";
import { DatabaseOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchIssues, collectIssues, fetchProjects } from "../../api/client";
import { CollectButton } from "../common/CollectButton";
import type { ProjectConfig } from "../../types";
import type { Issue, IssueSummary } from "../../types/analytics";

const { Text } = Typography;

export function IssueDashboard() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [summary, setSummary] = useState<IssueSummary | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [stateFilter, setStateFilter] = useState<string | undefined>();

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data as ProjectConfig[]); }); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchIssues(
        selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
        undefined,
        stateFilter
      );
      if (res.ok) { setIssues(res.data!.issues); setSummary(res.data!.summary); }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [selectedProjectIds, stateFilter]);

  const issueProjectIds = useMemo(() => selectedProjectIds.length > 0 ? selectedProjectIds : projects.map((p) => p.id), [selectedProjectIds, projects]);

  const columns = [
    { title: "Проект", dataIndex: "project_label", key: "project",
      render: (_: string, r: Issue) => <div><span>{r.project_label}</span>{r.project_tags?.length > 0 && <Tag color="blue" style={{ marginLeft: 6 }}>{r.project_tags.join(", ")}</Tag>}</div> },
    { title: "#", dataIndex: "gitlab_iid", key: "iid" },
    { title: "Заголовок", dataIndex: "title", key: "title", ellipsis: true },
    { title: "Статус", dataIndex: "state", key: "state",
      render: (v: string) => v === "opened" ? <Tag color="green">opened</Tag> : <Tag color="red">closed</Tag> },
    { title: "Автор", dataIndex: "author_email", key: "author", render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: "Создан", dataIndex: "created_at", key: "created", render: (v: string) => new Date(v).toLocaleDateString() },
    { title: "Закрыт", dataIndex: "closed_at", key: "closed",
      render: (v: string | null) => v ? new Date(v).toLocaleDateString() : "—" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Select mode="multiple" placeholder="Проекты" allowClear showSearch optionFilterProp="label"
          style={{ minWidth: 300 }} value={selectedProjectIds} onChange={setSelectedProjectIds}
          options={projects.map((p) => ({ value: p.id, label: p.tags ? `${p.label} [${p.tags}]` : p.label }))}
          maxTagCount="responsive" />
        <Select placeholder="Статус" allowClear style={{ width: 140 }} value={stateFilter} onChange={setStateFilter}
          options={[{ value: "opened", label: "Opened" }, { value: "closed", label: "Closed" }]} />
        <CollectButton collector="issues" projectIds={issueProjectIds} onComplete={loadData} />
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
      </div>

      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card><Statistic title="Всего" value={summary.total} /></Card></Col>
          <Col span={6}><Card><Statistic title="Открытых" value={summary.opened} valueStyle={{ color: "#3f8600" }} /></Card></Col>
          <Col span={6}><Card><Statistic title="Закрытых" value={summary.closed} valueStyle={{ color: "#cf1322" }} /></Card></Col>
          <Col span={6}><Card><Statistic title="Ср. время закрытия (дн.)" value={summary.avg_days_to_close} /></Card></Col>
        </Row>
      )}

      <Table columns={columns} dataSource={issues} rowKey="id" loading={loading} size="small"
        pagination={{ pageSize: 20, showSizeChanger: true }} scroll={{ x: 900 }} />
    </div>
  );
}