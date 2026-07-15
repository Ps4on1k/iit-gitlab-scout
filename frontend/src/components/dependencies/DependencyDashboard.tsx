import { useState, useEffect, useMemo } from "react";
import { Card, Row, Col, Statistic, Table, Select, Button, Tag, message, Typography, Spin, Empty, Input } from "antd";
import { ReloadOutlined, SearchOutlined, LinkOutlined } from "@ant-design/icons";
import { Pie } from "@ant-design/charts";
import { fetchDependencies, fetchProjects } from "../../api/client";

import { chartColors } from "../../utils/chartTheme";
import { getProjectUrl } from "../../utils/projectUrl";
import type { ProjectConfig } from "../../types";
import type { DependencyAudit, DependencySummary } from "../../types/analytics";

const { Text } = Typography;

const SOURCE_COLORS: Record<string, string> = {
  npm: "#cb3837", pip: "#3776ab", go: "#00add8", cargo: "#dea584",
  maven: "#d94f00", gradle: "#02303a", nuget: "#512bd4", composer: "#885630",
  pub: "#0175c2", "swift-pm": "#f05138",
};

export function DependencyDashboard() {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [deps, setDeps] = useState<DependencyAudit[]>([]);
  const [summary, setSummary] = useState<DependencySummary | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string | undefined>();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchText, setSearchText] = useState("");
  const [sourceTableFilter, setSourceTableFilter] = useState<string | undefined>();
  const [statusTableFilter, setStatusTableFilter] = useState<string | undefined>();

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data as ProjectConfig[]); }); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchDependencies(
        selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
        selectedTags.length > 0 ? selectedTags.join(",") : undefined,
        sourceFilter
      );
      if (res.ok) { setDeps(res.data!.dependencies); setSummary(res.data!.summary); }
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [selectedProjectIds, sourceFilter, selectedTags]);

  const depProjectIds = useMemo(() => selectedProjectIds.length > 0 ? selectedProjectIds : projects.map((p) => p.id), [selectedProjectIds, projects]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const p of projects) { if (p.tags) p.tags.forEach((t) => tags.add(t)); }
    return Array.from(tags).sort();
  }, [projects]);

  const allSources = useMemo(() => {
    const sources = new Set<string>();
    for (const d of deps) sources.add(d.source);
    return Array.from(sources).sort();
  }, [deps]);

  const filteredDeps = useMemo(() => {
    let result = deps;
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter((d) => d.name.toLowerCase().includes(q) || d.project_label?.toLowerCase().includes(q));
    }
    if (sourceTableFilter) {
      result = result.filter((d) => d.source === sourceTableFilter);
    }
    if (statusTableFilter) {
      result = result.filter((d) => statusTableFilter === "outdated" ? d.is_outdated : !d.is_outdated);
    }
    return result;
  }, [deps, searchText, sourceTableFilter, statusTableFilter]);

  const pieData = useMemo(() => {
    const bySource: Record<string, number> = {};
    for (const d of filteredDeps) {
      bySource[d.source] = (bySource[d.source] || 0) + 1;
    }
    return Object.entries(bySource).map(([source, value]) => ({ type: source, value }));
  }, [filteredDeps]);

  const cc = chartColors();

  const columns = [
    { title: "Проект", dataIndex: "project_label", key: "project", width: 200,
      render: (_: string, r: DependencyAudit) => { const proj = projects.find((p) => p.label === r.project_label); return <div><span style={{ fontSize: 12 }}>{r.project_label}</span>{proj && <a href={getProjectUrl(proj.base_url, proj.path)} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4, color: "var(--ant-color-textTertiary)", fontSize: 11 }}><LinkOutlined /></a>}{r.project_tags?.length > 0 && <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>{r.project_tags.join(", ")}</Tag>}</div>; } },
    { title: "Имя", dataIndex: "name", key: "name", render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: "Версия", dataIndex: "current_version", key: "version", width: 120 },
    { title: "Источник", dataIndex: "source", key: "source", width: 100,
      render: (v: string) => <Tag color={SOURCE_COLORS[v] || "default"} style={{ fontSize: 10 }}>{v}</Tag> },
    { title: "Собрано", dataIndex: "collected_at", key: "collected_at", width: 120,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : "—" },
    { title: "Статус", key: "status", width: 100,
      render: (_: any, r: DependencyAudit) => r.is_outdated ? <Tag color="red">устаревшая</Tag> : <Tag color="green">актуальная</Tag> },
  ];

  return (
    <div style={{ width: "90%", margin: "0 auto", position: "relative", zIndex: 2 }}>
      <div style={{ background: "linear-gradient(135deg, #E8B8D0 0%, #D0B8E8 100%)", color: "#111315", padding: "14px 24px", borderRadius: "12px", marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>Зависимости</h1>
        <div style={{ opacity: 0.9, fontSize: 13 }}>Сбор и анализ зависимостей проектов</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Select mode="multiple" placeholder="Проекты" allowClear showSearch optionFilterProp="label"
          style={{ minWidth: 250, flex: 1 }} value={selectedProjectIds} onChange={setSelectedProjectIds}
          options={projects.map((p) => ({ value: p.id, label: p.tags ? `${p.label} [${p.tags}]` : p.label }))}
          maxTagCount="responsive" />
        <Select mode="multiple" placeholder="Теги" allowClear style={{ minWidth: 150, flex: 1 }}
          value={selectedTags} onChange={setSelectedTags}
          options={allTags.map((t) => ({ value: t, label: t }))} maxTagCount="responsive" />
        <Select placeholder="Экосистема" allowClear style={{ width: 140 }} value={sourceFilter} onChange={setSourceFilter}
          options={allSources.map((s) => ({ value: s, label: s }))} />

        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
      </div>

      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col flex="1"><Card><Statistic title="Всего зависимостей" value={summary.total} /></Card></Col>
          <Col flex="1"><Card><Statistic title="Устаревших" value={summary.outdated} valueStyle={{ color: "#E5484D" }} /></Card></Col>
        </Row>
      )}

      <Row gutter={16} style={{ marginBottom: 16 }} align="stretch">
        <Col span={8}>
          <Card title="Распределение по экосистемам" size="small" style={{ height: "100%" }}>
            {loading ? <Spin /> : pieData.length > 0 ? (
              <div style={{ height: "100%", minHeight: 300 }}>
                <Pie
                  data={pieData}
                  angleField="value" colorField="type" radius={0.9} innerRadius={0.55}
                  scale={{ color: { range: pieData.map((d) => SOURCE_COLORS[d.type] || "#999") } }}
                  label={false}
                  legend={{ color: { position: "bottom", layout: { justifyContent: "center" }, itemLabelFontSize: 11, itemLabelFill: cc.secondaryText } }}
                  statistic={false}
                  autoFit
                />
              </div>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        </Col>
        <Col span={16}>
          <Card title="Зависимости по проектам" size="small" style={{ height: "100%" }}>
            {loading ? <Spin /> : (() => {
              const byProject: Record<string, { total: number; outdated: number }> = {};
              for (const d of filteredDeps) {
                if (!byProject[d.project_label]) byProject[d.project_label] = { total: 0, outdated: 0 };
                byProject[d.project_label].total++;
                if (d.is_outdated) byProject[d.project_label].outdated++;
              }
              const sorted = Object.entries(byProject).sort((a, b) => b[1].total - a[1].total).slice(0, 20);
              if (sorted.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
              const maxTotal = sorted[0]?.[1].total || 1;
              return (
                <div style={{ overflowY: "auto", paddingRight: 4, scrollbarWidth: "thin", scrollbarColor: "#64748b transparent" }}>
                  {sorted.map(([proj, stats]) => (
                    <div key={proj} style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 250 }}>{proj}</span>
                        <span style={{ color: "var(--ant-color-textSecondary)" }}>
                          <span style={{ color: "#21B573" }}>{stats.total - stats.outdated}</span>/
                          <span>{stats.total}</span>
                          {stats.outdated > 0 && <span style={{ color: "#E5484D", marginLeft: 4 }}>({stats.outdated} устар.)</span>}
                        </span>
                      </div>
                      <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${((stats.total - stats.outdated) / maxTotal) * 100}%`, background: "#21B573" }} />
                        <div style={{ width: `${(stats.outdated / maxTotal) * 100}%`, background: "#E5484D" }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>
        </Col>
      </Row>

      <Card size="small">
        <div style={{ marginBottom: 12 }}>
          <Input placeholder="Поиск по имени зависимости..." prefix={<SearchOutlined />} allowClear value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <Table columns={columns} dataSource={filteredDeps} rowKey="id" loading={loading} size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Всего: ${t}` }} scroll={{ x: 700 }} />
      </Card>
    </div>
  );
}
