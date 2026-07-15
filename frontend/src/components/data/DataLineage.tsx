import { useState, useEffect } from "react";
import { Card, Spin, Empty, Typography, Tag, Row, Col, Statistic, Table, Badge, Button } from "antd";
import { DatabaseOutlined, CloudOutlined, ApiOutlined, SyncOutlined, ReloadOutlined, LinkOutlined } from "@ant-design/icons";
import { fetchLineageFlow, fetchLineageTableStats, fetchLineageMetadata } from "../../api/client";

const { Text, Title } = Typography;

interface LineageData {
  collectors: Record<string, { writes_to: string[]; description: string }>;
  tables: Record<string, { written_by: string[]; read_by: string[]; description: string; fields?: any[] }>;
  api_endpoints: Record<string, { reads_from: string[]; description: string }>;
}

const NODE_W = 170;
const NODE_H = 50;
const COL_X = 20;
const TABLE_X = 260;
const EP_X = 500;
const ROW_H = 80;
const SVG_PAD = 40;

const COLORS = { collector: "#3A8DFF", table: "#21B573", endpoint: "#42D9C8" };

function SvgNode({ x, y, label, sub, color, badge }: { x: number; y: number; label: string; sub: string; color: string; badge?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={8} fill={color} fillOpacity={0.1} stroke={color} strokeWidth={1.5} />
      <text x={x + 10} y={y + 18} fontSize={11} fontWeight={600} fill={color}>{label.length > 22 ? label.slice(0, 20) + "…" : label}</text>
      <text x={x + 10} y={y + 34} fontSize={9} fill="#888">{sub.length > 28 ? sub.slice(0, 26) + "…" : sub}</text>
      {badge && <text x={x + NODE_W - 8} y={y + 18} fontSize={9} fill="#fff" textAnchor="end" fontWeight={600}><rect x={x + NODE_W - 40} y={y + 6} width={32} height={16} rx={8} fill={color} /><text x={x + NODE_W - 10} y={y + 18} fontSize={8} fill="#fff" textAnchor="middle" fontWeight={600}>{badge}</text></text>}
    </g>
  );
}

function buildGraph(data: LineageData, stats: any) {
  const nodes: { id: string; x: number; y: number; label: string; sub: string; color: string; badge?: string }[] = [];
  const edges: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];

  const collectorNames = Object.keys(data.collectors);
  collectorNames.forEach((name, i) => {
    const y = SVG_PAD + i * ROW_H;
    nodes.push({ id: `c-${name}`, x: COL_X, y, label: name, sub: data.collectors[name].description, color: COLORS.collector });
  });

  const tableNames = Object.keys(data.tables);
  tableNames.forEach((name, i) => {
    const y = SVG_PAD + i * ROW_H;
    const ts = stats?.tables?.find((t: any) => t.name === name);
    const badge = ts?.stats?.rowCount ? String(ts.stats.rowCount) : undefined;
    nodes.push({ id: `t-${name}`, x: TABLE_X, y, label: name, sub: data.tables[name].description, color: COLORS.table, badge });
  });

  const epNames = Object.keys(data.api_endpoints);
  epNames.forEach((name, i) => {
    const y = SVG_PAD + i * ROW_H;
    nodes.push({ id: `e-${name}`, x: EP_X, y, label: name, sub: data.api_endpoints[name].description, color: COLORS.endpoint });
  });

  collectorNames.forEach((cName) => {
    const cIdx = collectorNames.indexOf(cName);
    const cy = SVG_PAD + cIdx * ROW_H + NODE_H / 2;
    data.collectors[cName].writes_to.forEach((tName) => {
      const tIdx = tableNames.indexOf(tName);
      if (tIdx >= 0) {
        const ty = SVG_PAD + tIdx * ROW_H + NODE_H / 2;
        edges.push({ x1: COL_X + NODE_W, y1: cy, x2: TABLE_X, y2: ty, color: COLORS.collector });
      }
    });
  });

  tableNames.forEach((tName) => {
    const tIdx = tableNames.indexOf(tName);
    const ty = SVG_PAD + tIdx * ROW_H + NODE_H / 2;
    data.api_endpoints && Object.entries(data.api_endpoints).forEach(([eName, info]) => {
      if (info.reads_from.includes(tName)) {
        const eIdx = epNames.indexOf(eName);
        if (eIdx >= 0) {
          const ey = SVG_PAD + eIdx * ROW_H + NODE_H / 2;
          edges.push({ x1: TABLE_X + NODE_W, y1: ty, x2: EP_X, y2: ey, color: COLORS.endpoint });
        }
      }
    });
  });

  return { nodes, edges, svgHeight: SVG_PAD + Math.max(collectorNames.length, tableNames.length, epNames.length) * ROW_H + SVG_PAD };
}

export function DataLineage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LineageData | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [metadata, setMetadata] = useState<any[]>([]);
  const [graph, setGraph] = useState<ReturnType<typeof buildGraph> | null>(null);
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

  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  if (!data || !graph) return <Empty description="Не удалось загрузить lineage" />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <Title level={4}>Потоки данных</Title>
          <Text type="secondary">Откуда берутся данные и как попадают в дашборды</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => setLoadKey((k) => k + 1)}>Обновить</Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}><Card><Statistic title="Коллекторы" value={Object.keys(data.collectors).length} prefix={<CloudOutlined />} /></Card></Col>
        <Col span={8}><Card><Statistic title="Таблицы" value={Object.keys(data.tables).length} prefix={<DatabaseOutlined />} /></Card></Col>
        <Col span={8}><Card><Statistic title="API эндпоинты" value={Object.keys(data.api_endpoints).length} prefix={<ApiOutlined />} /></Card></Col>
      </Row>

      <Card title="Граф потока данных" style={{ marginBottom: 16 }}>
        <div style={{ overflowX: "auto" }}>
          <svg width={EP_X + NODE_W + SVG_PAD} height={graph.svgHeight} style={{ minWidth: 700 }}>
            {/* Column headers */}
            <text x={COL_X + NODE_W / 2} y={20} fontSize={13} fontWeight={700} fill={COLORS.collector} textAnchor="middle">Коллекторы</text>
            <text x={TABLE_X + NODE_W / 2} y={20} fontSize={13} fontWeight={700} fill={COLORS.table} textAnchor="middle">Таблицы</text>
            <text x={EP_X + NODE_W / 2} y={20} fontSize={13} fontWeight={700} fill={COLORS.endpoint} textAnchor="middle">API</text>

            {/* Edges */}
            {graph.edges.map((edge, i) => (
              <line key={`edge-${i}`} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} stroke={edge.color} strokeWidth={1.5} strokeOpacity={0.5} markerEnd="url(#arrow)" />
            ))}

            {/* Arrow marker */}
            <defs>
              <marker id="arrow" markerWidth={8} markerHeight={6} refX={8} refY={3} orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L8,3 L0,6 Z" fill="#888" />
              </marker>
            </defs>

            {/* Nodes */}
            {graph.nodes.map((n) => (
              <SvgNode key={n.id} x={n.x} y={n.y} label={n.label} sub={n.sub} color={n.color} badge={n.badge} />
            ))}
          </svg>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "#8c8c8c" }}>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: COLORS.collector, marginRight: 4 }} /> Коллекторы</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: COLORS.table, marginRight: 4 }} /> Таблицы</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: COLORS.endpoint, marginRight: 4 }} /> API эндпоинты</span>
          <span>→ направление потока данных</span>
        </div>
      </Card>

      {metadata.length > 0 && (
        <Card title={<span><SyncOutlined style={{ marginRight: 6 }} />Динамические метаданные (dbt/Dagster)</span>}>
          <Table
            dataSource={metadata}
            columns={[
              { title: "Тип", dataIndex: "entity_type", key: "type", render: (v: string) => <Tag color="orange">{v}</Tag> },
              { title: "Имя", dataIndex: "entity_name", key: "name" },
              { title: "Обновлено", dataIndex: "updated_at", key: "updated_at", render: (v: string) => new Date(v).toLocaleString("ru-RU") },
            ]}
            size="small"
            pagination={false}
            rowKey="id"
          />
        </Card>
      )}
    </div>
  );
}
