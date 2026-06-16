import { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Table, Select, Button, Tag, message, Empty, Typography } from "antd";
import { DatabaseOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchBranches, collectBranches, fetchProjects } from "../../api/client";
import type { ProjectConfig } from "../../types";
import type { Branch, BranchSummary } from "../../types/analytics";

export function BranchDashboard() {
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [summary, setSummary] = useState<BranchSummary | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data!); }); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchBranches(
        selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
        undefined,
        statusFilter
      );
      if (res.ok) { setBranches(res.data!.branches); setSummary(res.data!.summary); }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [selectedProjectIds, statusFilter]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const ids = selectedProjectIds.length > 0 ? selectedProjectIds : projects.map((p) => p.id);
      for (const id of ids) {
        const res = await collectBranches(id);
        if (res.ok) message.success(`Project ${id}: ${res.data!.total} branches`);
        else message.error(res.error!);
      }
      loadData();
    } finally { setCollecting(false); }
  };

  const columns = [
    { title: "Проект", dataIndex: "project_label", key: "project",
      render: (_: string, r: Branch) => <div><span>{r.project_label}</span>{r.project_tag && <Tag color="blue" style={{ marginLeft: 6 }}>{r.project_tag}</Tag>}</div> },
    { title: "Ветка", dataIndex: "name", key: "name", render: (v: string) => <Text code>{v}</Text> },
    { title: "Статус", key: "status", render: (_: any, r: Branch) => (
      r.merged ? <Tag color="green">merged</Tag> : r.default ? <Tag color="blue">default</Tag> : r.protected ? <Tag color="orange">protected</Tag> : <Tag>active</Tag>
    )},
    { title: "Последний коммит", dataIndex: "last_commit_date", key: "last",
      render: (v: string | null) => v ? new Date(v).toLocaleDateString() : "—" },
    { title: "Автор", dataIndex: "last_commit_author", key: "author" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Select mode="multiple" placeholder="Проекты" allowClear showSearch optionFilterProp="label"
          style={{ minWidth: 300 }} value={selectedProjectIds} onChange={setSelectedProjectIds}
          options={projects.map((p) => ({ value: p.id, label: p.tag ? `${p.label} [${p.tag}]` : p.label }))}
          maxTagCount="responsive" />
        <Select placeholder="Статус" allowClear style={{ width: 140 }} value={statusFilter} onChange={setStatusFilter}
          options={[{ value: "active", label: "Active" }, { value: "stale", label: "Stale (>90d)" }, { value: "merged", label: "Merged" }]} />
        <Button type="primary" icon={<DatabaseOutlined />} loading={collecting} onClick={handleCollect} style={{ background: "#667eea" }}>Собрать</Button>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
      </div>

      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card><Statistic title="Всего" value={summary.total} /></Card></Col>
          <Col span={6}><Card><Statistic title="Активных" value={summary.active} valueStyle={{ color: "#3f8600" }} /></Card></Col>
          <Col span={6}><Card><Statistic title="Заброшенных (>90d)" value={summary.stale} valueStyle={{ color: "#cf1322" }} /></Card></Col>
          <Col span={6}><Card><Statistic title="Замерженных" value={summary.merged} valueStyle={{ color: "#667eea" }} /></Card></Col>
        </Row>
      )}

      <Table columns={columns} dataSource={branches} rowKey="id" loading={loading} size="small"
        pagination={{ pageSize: 20, showSizeChanger: true }} scroll={{ x: 800 }} />
    </div>
  );
}

const { Text } = Typography;
