import { useState, useEffect, useMemo } from "react";
import { Card, Row, Col, Statistic, Select, Button, Tag, message } from "antd";
import { DatabaseOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchBranches, collectBranches, fetchProjects } from "../../api/client";
import type { ProjectConfig } from "../../types";
import type { Branch, BranchSummary } from "../../types/analytics";

type SortKey = "project_label" | "name" | "status" | "last_commit_date" | "last_commit_author";

export function BranchDashboard() {
  const [loading, setLoading] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [summary, setSummary] = useState<BranchSummary | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [sortKey, setSortKey] = useState<SortKey>("last_commit_date");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => { fetchProjects().then((r) => { if (r.ok) setProjects(r.data as ProjectConfig[]); }); }, []);

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

  const sorted = useMemo(() => {
    return [...branches].sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      if (sortKey === "status") {
        aVal = a.merged ? "merged" : a.default ? "default" : a.protected ? "protected" : "active";
        bVal = b.merged ? "merged" : b.default ? "default" : b.protected ? "protected" : "active";
      } else {
        aVal = a[sortKey] || "";
        bVal = b[sortKey] || "";
      }
      if (typeof aVal === "string") return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [branches, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? " ↑" : " ↓") : " ↕";

  const handleCollect = async () => {
    setCollecting(true);
    try {
      const ids = selectedProjectIds.length > 0 ? selectedProjectIds : projects.map((p) => p.id);
      for (const id of ids) {
        const res = await collectBranches(id);
        if (res.ok) message.success(`${res.data!.total} веток собрано`);
        else message.error(res.error!);
      }
      loadData();
    } finally { setCollecting(false); }
  };

  const thStyle: React.CSSProperties = {
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    color: "white", padding: "15px 12px", textAlign: "left",
    fontWeight: 600, cursor: "pointer", userSelect: "none", fontSize: 13,
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px 12px", borderBottom: "1px solid #e0e0e0", fontSize: 13,
  };

  return (
    <div style={{ width: "90%", margin: "0 auto" }}>
      <div style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", color: "white", padding: "30px 40px", borderRadius: "20px", marginBottom: 30 }}>
        <h1 style={{ fontSize: 28, marginBottom: 10 }}>Ветки проектов</h1>
        <div style={{ opacity: 0.9, fontSize: 14 }}>Анализ веток: активные, заброшенные, замерженные</div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Select mode="multiple" placeholder="Проекты" allowClear showSearch optionFilterProp="label"
          style={{ minWidth: 300, maxWidth: 500 }} value={selectedProjectIds} onChange={setSelectedProjectIds}
          options={projects.map((p) => ({ value: p.id, label: p.tag ? `${p.label} [${p.tag}]` : p.label }))}
          tagRender={({ label, closable, onClose }) => (
            <Tag closable={closable} onClose={onClose} style={{ marginRight: 3, background: "#667eea", color: "white", border: "none" }}>{label}</Tag>
          )}
          maxTagCount="responsive" />
        <Select placeholder="Статус" allowClear style={{ width: 180 }} value={statusFilter} onChange={setStatusFilter}
          options={[
            { value: "active", label: "Активные (<90д)" },
            { value: "stale", label: "Заброшенные (>90д)" },
            { value: "merged", label: "Замерженные" },
          ]} />
        <Button type="primary" icon={<DatabaseOutlined />} loading={collecting} onClick={handleCollect} style={{ background: "#667eea" }}>Собрать</Button>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
      </div>

      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card><Statistic title="Всего веток" value={summary.total} /></Card></Col>
          <Col span={6}><Card><Statistic title="Активные (<90д)" value={summary.active} valueStyle={{ color: "#3f8600" }} /></Card></Col>
          <Col span={6}><Card><Statistic title="Заброшенные (>90д)" value={summary.stale} valueStyle={{ color: "#cf1322" }} /></Card></Col>
          <Col span={6}><Card><Statistic title="Замерженные" value={summary.merged} valueStyle={{ color: "#667eea" }} /></Card></Col>
        </Row>
      )}

      <div style={{ overflowX: "auto", background: "white", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle} onClick={() => handleSort("project_label")}>Проект{arrow("project_label")}</th>
              <th style={thStyle} onClick={() => handleSort("name")}>Ветка{arrow("name")}</th>
              <th style={thStyle} onClick={() => handleSort("status")}>Статус{arrow("status")}</th>
              <th style={thStyle} onClick={() => handleSort("last_commit_date")}>Последний коммит{arrow("last_commit_date")}</th>
              <th style={thStyle} onClick={() => handleSort("last_commit_author")}>Автор{arrow("last_commit_author")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r: any) => {
              const lastDate = r.last_commit_date ? new Date(r.last_commit_date) : null;
              const daysAgo = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86400000) : null;
              return (
                <tr key={r.id} onMouseEnter={(e) => (e.currentTarget.style.background = "#f8f9fa")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <td style={tdStyle}>{r.project_label}{r.project_tag && <Tag color="blue" style={{ marginLeft: 6 }}>{r.project_tag}</Tag>}</td>
                  <td style={tdStyle}><code>{r.name}</code></td>
                  <td style={tdStyle}>
                    {r.merged ? <Tag color="green">замержена</Tag> : r.default ? <Tag color="blue">основная</Tag> : r.protected ? <Tag color="orange">защищена</Tag> : <Tag>активная</Tag>}
                  </td>
                  <td style={tdStyle}>{lastDate ? `${lastDate.toLocaleDateString()} (${daysAgo}д. назад)` : "—"}</td>
                  <td style={tdStyle}>{r.last_commit_author}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
