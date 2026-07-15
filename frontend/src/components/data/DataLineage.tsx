import { useState, useEffect } from "react";
import { Card, Spin, Empty, Typography, Tag, Row, Col, Statistic, Table, Button } from "antd";
import { DatabaseOutlined, CloudOutlined, ApiOutlined, SyncOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchLineageFlow, fetchLineageTableStats, fetchLineageMetadata } from "../../api/client";

const { Text, Title } = Typography;

interface LineageData {
  collectors: Record<string, { writes_to: string[]; description: string }>;
  staging: Record<string, { reads_from: string[]; description: string; category?: string }>;
  tables: Record<string, { written_by: string[]; read_by: string[]; description: string; fields?: any[] }>;
  marts: Record<string, { written_by: string[]; read_by: string[]; reads_from?: string[]; description: string; fields?: any[] }>;
  api_endpoints: Record<string, { reads_from: string[]; description: string }>;
}

const NODE_W = 150;
const NODE_H = 44;
const COL_X = 10;
const STAGING_X = 180;
const TABLE_X = 350;
const MART_X = 520;
const EP_X = 690;
const ROW_H = 56;
const SVG_PAD = 40;

const COLORS = { collector: "#3A8DFF", staging: "#FFB020", table: "#21B573", mart: "#9B59B6", endpoint: "#42D9C8" };

interface GraphNode {
  id: string;
  x: number;
  y: number;
  label: string;
  sub: string;
  color: string;
  badge?: string;
}

interface GraphEdge {
  x1: number; y1: number; x2: number; y2: number;
  source: string; target: string;
  color: string;
}

function buildGraph(data: LineageData, stats: any) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const collectorNames = Object.keys(data.collectors);
  const stagingNames = data.staging ? Object.keys(data.staging) : [];
  const tableNames = Object.keys(data.tables);
  const martNames = Object.keys(data.marts || {});
  const epNames = Object.keys(data.api_endpoints);

  collectorNames.forEach((name, i) => {
    nodes.push({ id: `c-${name}`, x: COL_X, y: SVG_PAD + i * ROW_H, label: name, sub: data.collectors[name].description, color: COLORS.collector });
  });

  stagingNames.forEach((name, i) => {
    nodes.push({ id: `s-${name}`, x: STAGING_X, y: SVG_PAD + i * ROW_H, label: name, sub: data.staging[name].description, color: COLORS.staging });
  });

  tableNames.forEach((name, i) => {
    const ts = stats?.tables?.find((t: any) => t.name === name);
    nodes.push({ id: `t-${name}`, x: TABLE_X, y: SVG_PAD + i * ROW_H, label: name, sub: data.tables[name].description, color: COLORS.table, badge: ts?.stats?.rowCount ? String(ts.stats.rowCount) : undefined });
  });

  martNames.forEach((name, i) => {
    const ts = stats?.marts?.find((t: any) => t.name === name);
    nodes.push({ id: `m-${name}`, x: MART_X, y: SVG_PAD + i * ROW_H, label: name, sub: data.marts[name].description, color: COLORS.mart, badge: ts?.stats?.rowCount ? String(ts.stats.rowCount) : undefined });
  });

  epNames.forEach((name, i) => {
    nodes.push({ id: `e-${name}`, x: EP_X, y: SVG_PAD + i * ROW_H, label: name, sub: data.api_endpoints[name].description, color: COLORS.endpoint });
  });

  collectorNames.forEach((cName) => {
    const cIdx = collectorNames.indexOf(cName);
    const cy = SVG_PAD + cIdx * ROW_H + NODE_H / 2;
    (data.collectors[cName].writes_to || []).forEach((tName) => {
      const tIdx = tableNames.indexOf(tName);
      if (tIdx >= 0) {
        edges.push({ x1: COL_X + NODE_W, y1: cy, x2: TABLE_X, y2: SVG_PAD + tIdx * ROW_H + NODE_H / 2, source: `c-${cName}`, target: `t-${tName}`, color: COLORS.collector });
      }
    });
  });

  tableNames.forEach((tName) => {
    const tIdx = tableNames.indexOf(tName);
    const ty = SVG_PAD + tIdx * ROW_H + NODE_H / 2;
    stagingNames.forEach((sName) => {
      if (data.staging[sName].reads_from?.includes(tName)) {
        const sIdx = stagingNames.indexOf(sName);
        edges.push({ x1: TABLE_X + NODE_W, y1: ty, x2: STAGING_X, y2: SVG_PAD + sIdx * ROW_H + NODE_H / 2, source: `t-${tName}`, target: `s-${sName}`, color: COLORS.staging });
      }
    });
  });

  martNames.forEach((mName) => {
    const mIdx = martNames.indexOf(mName);
    const my = SVG_PAD + mIdx * ROW_H + NODE_H / 2;
    (data.marts[mName].reads_from || []).forEach((sName) => {
      const sIdx = stagingNames.indexOf(sName);
      if (sIdx >= 0) {
        edges.push({ x1: STAGING_X + NODE_W, y1: SVG_PAD + sIdx * ROW_H + NODE_H / 2, x2: MART_X, y2: my, source: `s-${sName}`, target: `m-${mName}`, color: COLORS.mart });
      }
    });
  });

  epNames.forEach((eName) => {
    const eIdx = epNames.indexOf(eName);
    const ey = SVG_PAD + eIdx * ROW_H + NODE_H / 2;
    (data.api_endpoints[eName].reads_from || []).forEach((sourceName) => {
      const mIdx = martNames.indexOf(sourceName);
      if (mIdx >= 0) {
        edges.push({ x1: MART_X + NODE_W, y1: SVG_PAD + mIdx * ROW_H + NODE_H / 2, x2: EP_X, y2: ey, source: `m-${sourceName}`, target: `e-${eName}`, color: COLORS.endpoint });
        return;
      }
      const tIdx = tableNames.indexOf(sourceName);
      if (tIdx >= 0) {
        edges.push({ x1: TABLE_X + NODE_W, y1: SVG_PAD + tIdx * ROW_H + NODE_H / 2, x2: EP_X, y2: ey, source: `t-${sourceName}`, target: `e-${eName}`, color: COLORS.endpoint });
      }
    });
  });

  const svgH = SVG_PAD + Math.max(collectorNames.length, stagingNames.length, tableNames.length, martNames.length, epNames.length) * ROW_H + SVG_PAD;
  return { nodes, edges, svgHeight: svgH };
}

function SvgNode({ x, y, label, sub, color, badge, selected, connected, onClick }: {
  x: number; y: number; label: string; sub: string; color: string; badge?: string; selected: boolean; connected: boolean; onClick: (e: React.MouseEvent) => void;
}) {
  const opacity = selected || connected ? 1 : 0.35;
  const strokeW = selected ? 2.5 : 1.5;
  return (
    <g onClick={onClick} style={{ cursor: "pointer" }}>
      <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={8} fill={color} fillOpacity={selected ? 0.25 : connected ? 0.15 : 0.06} stroke={color} strokeWidth={strokeW} opacity={opacity} />
      <text x={x + 10} y={y + 18} fontSize={11} fontWeight={600} fill={color} opacity={opacity}>{label.length > 22 ? label.slice(0, 20) + "…" : label}</text>
      <text x={x + 10} y={y + 34} fontSize={9} fill="#888" opacity={opacity}>{sub.length > 28 ? sub.slice(0, 26) + "…" : sub}</text>
      {badge && <g opacity={opacity}><rect x={x + NODE_W - 42} y={y + 6} width={34} height={16} rx={8} fill={color} /><text x={x + NODE_W - 25} y={y + 17} fontSize={8} fill="#fff" textAnchor="middle" fontWeight={600}>{badge}</text></g>}
    </g>
  );
}

export function DataLineage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LineageData | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [metadata, setMetadata] = useState<any[]>([]);
  const [graph, setGraph] = useState<ReturnType<typeof buildGraph> | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchLineageFlow(), fetchLineageTableStats(), fetchLineageMetadata()])
      .then(([flowRes, statsRes, metaRes]) => {
        if (cancelled) return;
        if (flowRes.ok) {
          setData(flowRes.data);
          setGraph(buildGraph(flowRes.data, statsRes.data));
        }
        if (statsRes.ok) setStats(statsRes.data);
        if (metaRes.ok) setMetadata(metaRes.data || []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadKey]);

  const connectedIds = new Set<string>();
  if (selectedNodeId && graph) {
    graph.edges.forEach((e) => {
      if (e.source === selectedNodeId || e.target === selectedNodeId) {
        connectedIds.add(e.source);
        connectedIds.add(e.target);
      }
    });
  }

  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  if (!data || !graph) return <Empty description="Не удалось загрузить lineage" />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <Title level={4}>Потоки данных</Title>
          <Text type="secondary">Нажмите на элемент для подсветки связей</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => { setLoadKey((k) => k + 1); setSelectedNodeId(null); }}>Обновить</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}><Card><Statistic title="Коллекторы" value={Object.keys(data.collectors).length} prefix={<CloudOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Staging" value={Object.keys(data.staging || {}).length} prefix={<DatabaseOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Таблицы" value={Object.keys(data.tables).length} prefix={<DatabaseOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="Витрины" value={Object.keys(data.marts || {}).length} prefix={<DatabaseOutlined />} /></Card></Col>
        <Col span={4}><Card><Statistic title="API" value={Object.keys(data.api_endpoints).length} prefix={<ApiOutlined />} /></Card></Col>
      </Row>

      <Card title="Граф потока данных" style={{ marginBottom: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <svg width={EP_X + NODE_W + 40} height={graph.svgHeight} style={{ minWidth: 700 }} onClick={() => setSelectedNodeId(null)}>
            <text x={COL_X + NODE_W / 2} y={20} fontSize={13} fontWeight={700} fill={COLORS.collector} textAnchor="middle">Коллекторы</text>
            <text x={STAGING_X + NODE_W / 2} y={20} fontSize={13} fontWeight={700} fill={COLORS.staging} textAnchor="middle">Staging</text>
            <text x={TABLE_X + NODE_W / 2} y={20} fontSize={13} fontWeight={700} fill={COLORS.table} textAnchor="middle">Таблицы</text>
            <text x={MART_X + NODE_W / 2} y={20} fontSize={13} fontWeight={700} fill={COLORS.mart} textAnchor="middle">Витрины</text>
            <text x={EP_X + NODE_W / 2} y={20} fontSize={13} fontWeight={700} fill={COLORS.endpoint} textAnchor="middle">API</text>

            <defs>
              <marker id="arrow" markerWidth={8} markerHeight={6} refX={8} refY={3} orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,3 L0,6 Z" fill="#999" />
              </marker>
              <marker id="arrow-hl" markerWidth={8} markerHeight={6} refX={8} refY={3} orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,3 L0,6 Z" fill="#FF6B35" />
              </marker>
            </defs>

            {graph.edges.map((edge, i) => {
              const hl = selectedNodeId && (edge.source === selectedNodeId || edge.target === selectedNodeId);
              return (
                <line key={i} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                  stroke={hl ? "#FF6B35" : "#ccc"}
                  strokeWidth={hl ? 2.5 : 1}
                  strokeOpacity={selectedNodeId ? (hl ? 1 : 0.15) : 0.5}
                  markerEnd={hl ? "url(#arrow-hl)" : "url(#arrow)"} />
              );
            })}

            {graph.nodes.map((n) => (
              <SvgNode key={n.id} {...n}
                selected={selectedNodeId === n.id}
                connected={connectedIds.has(n.id)}
                onClick={(e) => { e.stopPropagation(); setSelectedNodeId(selectedNodeId === n.id ? null : n.id); }}
              />
            ))}
          </svg>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "#8c8c8c" }}>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: COLORS.collector, marginRight: 4 }} /> Коллекторы</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: COLORS.staging, marginRight: 4 }} /> Staging</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: COLORS.table, marginRight: 4 }} /> Таблицы</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: COLORS.mart, marginRight: 4 }} /> Витрины</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: COLORS.endpoint, marginRight: 4 }} /> API</span>
          <span><span style={{ display: "inline-block", width: 12, height: 2, background: "#FF6B35", marginRight: 4, verticalAlign: "middle" }} /> Выделенные связи</span>
        </div>
      </Card>

      {metadata.length > 0 && (
        <Card title={<span><SyncOutlined style={{ marginRight: 6 }} />Динамические метаданные (dbt/Dagster)</span>}>
          <Table dataSource={metadata} columns={[
            { title: "Тип", dataIndex: "entity_type", key: "type", render: (v: string) => <Tag color="orange">{v}</Tag> },
            { title: "Имя", dataIndex: "entity_name", key: "name" },
            { title: "Обновлено", dataIndex: "updated_at", key: "updated_at", render: (v: string) => new Date(v).toLocaleString("ru-RU") },
          ]} size="small" pagination={false} rowKey="id" />
        </Card>
      )}
    </div>
  );
}
