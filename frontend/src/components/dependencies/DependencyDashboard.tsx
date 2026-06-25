import { useState, useEffect } from "react";
import { Card, Row, Col, Statistic, Table, Select, Button, Tag, message, Typography } from "antd";
import { DatabaseOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchDependencies, collectDependencies, fetchProjects } from "../../api/client";
import { delay } from "../../utils/collect";
import { CollectButton } from "../common/CollectButton";
import type { ProjectConfig } from "../../types";
import type { DependencyAudit, DependencySummary } from "../../types/analytics";

const { Text } = Typography;

export function DependencyDashboard() {
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [collectProgress, setCollectProgress] = useState<{ current: number; total: number } | null>(null);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [deps, setDeps] = useState<DependencyAudit[]>([]);
  const [summary, setSummary] = useState<DependencySummary | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string | undefined>();

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data as ProjectConfig[]); }); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchDependencies(
        selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
        undefined,
        sourceFilter
      );
      if (res.ok) { setDeps(res.data!.dependencies); setSummary(res.data!.summary); }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [selectedProjectIds, sourceFilter]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const ids = selectedProjectIds.length > 0 ? selectedProjectIds : projects.map((p) => p.id);
      setCollectProgress({ current: 0, total: ids.length });
      for (let i = 0; i < ids.length; i++) {
        setCollectProgress({ current: i + 1, total: ids.length });
        const res = await collectDependencies(ids[i]);
        if (res.ok) message.success(`Project ${ids[i]}: ${res.data!.total} deps`);
        else message.error(res.error!);
        if (i < ids.length - 1) await delay();
      }
      loadData();
    } finally { setCollecting(false); setCollectProgress(null); }
  };

  const columns = [
    { title: "Проект", dataIndex: "project_label", key: "project",
      render: (_: string, r: DependencyAudit) => <div><span>{r.project_label}</span>{r.project_tags?.length > 0 && <Tag color="blue" style={{ marginLeft: 6 }}>{r.project_tags.join(", ")}</Tag>}</div> },
    { title: "Имя", dataIndex: "name", key: "name", render: (v: string) => <Text code>{v}</Text> },
    { title: "Версия", dataIndex: "current_version", key: "version" },
    { title: "Источник", dataIndex: "source", key: "source",
      render: (v: string) => <Tag color={v === "npm" ? "blue" : v === "pip" ? "green" : "orange"}>{v}</Tag> },
    { title: "Статус", key: "status",
      render: (_: any, r: DependencyAudit) => r.is_outdated ? <Tag color="red">устаревшая</Tag> : <Tag color="green">актуальная</Tag> },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Select mode="multiple" placeholder="Проекты" allowClear showSearch optionFilterProp="label"
          style={{ minWidth: 300 }} value={selectedProjectIds} onChange={setSelectedProjectIds}
          options={projects.map((p) => ({ value: p.id, label: p.tags ? `${p.label} [${p.tags}]` : p.label }))}
          maxTagCount="responsive" />
        <Select placeholder="Источник" allowClear style={{ width: 140 }} value={sourceFilter} onChange={setSourceFilter}
          options={[{ value: "npm", label: "npm" }, { value: "pip", label: "pip" }, { value: "go", label: "go" }]} />
        <CollectButton onClick={handleCollect} collecting={collecting} collectProgress={collectProgress} />
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
      </div>

      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card><Statistic title="Всего зависимостей" value={summary.total} /></Card></Col>
          <Col span={6}><Card><Statistic title="Устаревших" value={summary.outdated} valueStyle={{ color: "#cf1322" }} /></Card></Col>
          {Object.entries(summary.by_source).map(([src, cnt]) => (
            <Col span={4} key={src}><Card><Statistic title={src} value={cnt} /></Card></Col>
          ))}
        </Row>
      )}

      <Table columns={columns} dataSource={deps} rowKey="id" loading={loading} size="small"
        pagination={{ pageSize: 20, showSizeChanger: true }} scroll={{ x: 700 }} />
    </div>
  );
}