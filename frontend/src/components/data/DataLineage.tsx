import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, Spin, Empty, Typography, Tag, Row, Col, Statistic, Table, Badge, Button } from "antd";
import { DatabaseOutlined, CloudOutlined, ApiOutlined, SyncOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchLineageFlow, fetchLineageTableStats, fetchLineageMetadata } from "../../api/client";
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, type NodeTypes, type OnNodesChange, type OnEdgesChange, applyNodeChanges, applyEdgeChanges, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

const { Text, Title } = Typography;

interface LineageData {
  collectors: Record<string, { writes_to: string[]; description: string }>;
  tables: Record<string, { written_by: string[]; read_by: string[]; description: string; fields?: any[] }>;
  api_endpoints: Record<string, { reads_from: string[]; description: string }>;
}

const nodeColors: Record<string, string> = {
  collector: "#3A8DFF",
  table: "#21B573",
  endpoint: "#42D9C8",
  metadata: "#FFB020",
};

function CollectorNode({ data }: { data: any }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 8, background: "linear-gradient(135deg, rgba(58,141,255,0.12) 0%, rgba(66,217,200,0.12) 100%)", border: "1px solid rgba(58,141,255,0.3)", minWidth: 180 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <CloudOutlined style={{ color: "#3A8DFF", fontSize: 14 }} />
        <Text strong style={{ fontSize: 12 }}>{data.label}</Text>
      </div>
      <div style={{ fontSize: 10, color: "#8c8c8c" }}>{data.description}</div>
    </div>
  );
}

function TableNode({ data }: { data: any }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(33,181,115,0.08)", border: "1px solid rgba(33,181,115,0.3)", minWidth: 180 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <DatabaseOutlined style={{ color: "#21B573", fontSize: 14 }} />
        <Text strong style={{ fontSize: 12 }}>{data.label}</Text>
        {data.rowCount !== undefined && <Badge count={data.rowCount.toLocaleString()} style={{ backgroundColor: "#21B573", fontSize: 9 }} overflowCount={999999} />}
      </div>
      <div style={{ fontSize: 10, color: "#8c8c8c" }}>{data.description}</div>
    </div>
  );
}

function EndpointNode({ data }: { data: any }) {
  return (
    <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(66,217,200,0.08)", border: "1px solid rgba(66,217,200,0.3)", minWidth: 180 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <ApiOutlined style={{ color: "#42D9C8", fontSize: 14 }} />
        <Text code style={{ fontSize: 11 }}>{data.label}</Text>
      </div>
      <div style={{ fontSize: 10, color: "#8c8c8c" }}>{data.description}</div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  collector: CollectorNode,
  table: TableNode,
  endpoint: EndpointNode,
};

function buildFlowGraph(data: LineageData, stats: any, metadata: any[]) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let xCollector = 0;
  let xTable = 300;
  let xEndpoint = 600;

  // Collector nodes
  const collectorNames = Object.keys(data.collectors);
  collectorNames.forEach((name, i) => {
    const info = data.collectors[name];
    nodes.push({
      id: `collector-${name}`,
      type: "collector",
      position: { x: xCollector, y: i * 90 },
      data: { label: name, description: info.description },
    });

    // Edges from collector to tables
    info.writes_to.forEach((table) => {
      if (!data.tables[table]) return; // skip if target table doesn't exist
      edges.push({
        id: `e-${name}-${table}`,
        source: `collector-${name}`,
        target: `table-${table}`,
        type: "default",
        animated: true,
        style: { stroke: "#3A8DFF", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#3A8DFF" },
      });
    });
  });

  // Table nodes
  const tableNames = Object.keys(data.tables);
  tableNames.forEach((name, i) => {
    const info = data.tables[name];
    const tableStats = stats?.tables?.find((t: any) => t.name === name);
    nodes.push({
      id: `table-${name}`,
      type: "table",
      position: { x: xTable, y: i * 90 },
      data: { label: name, description: info.description, rowCount: tableStats?.stats?.rowCount },
    });
  });

  // Endpoint nodes
  const endpointNames = Object.keys(data.api_endpoints);
  endpointNames.forEach((name, i) => {
    const info = data.api_endpoints[name];
    nodes.push({
      id: `endpoint-${name}`,
      type: "endpoint",
      position: { x: xEndpoint, y: i * 90 },
      data: { label: name, description: info.description },
    });

    // Edges from tables to endpoint
    info.reads_from.forEach((table) => {
      if (data.tables[table]) {
        edges.push({
          id: `e-${table}-${name}`,
          source: `table-${table}`,
          target: `endpoint-${name}`,
          type: "default",
          style: { stroke: "#42D9C8", strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#42D9C8" },
        });
      }
    });
  });

  // Dynamic metadata nodes
  metadata.forEach((m, i) => {
    nodes.push({
      id: `meta-${m.entity_type}-${m.entity_name}`,
      type: "collector",
      position: { x: xCollector, y: (collectorNames.length + i) * 90 + 40 },
      data: { label: `${m.entity_type}: ${m.entity_name}`, description: `Динамические метаданные (обновлено ${dayjs(m.updated_at).format("DD.MM HH:mm")})` },
    });
  });

  return { nodes, edges };
}

function dayjs(date: string) {
  return { format: (fmt: string) => new Date(date).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) };
}

export function DataLineage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LineageData | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [metadata, setMetadata] = useState<any[]>([]);
  const [flowNodes, setFlowNodes] = useState<Node[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchLineageFlow(), fetchLineageTableStats(), fetchLineageMetadata()])
      .then(([flowRes, statsRes, metaRes]) => {
        if (cancelled) return;
        if (flowRes.ok) {
          setData(flowRes.data);
          const { nodes: n, edges: e } = buildFlowGraph(flowRes.data, statsRes.data, metaRes.data || []);
          setFlowNodes(n);
          setFlowEdges(e);
        }
        if (statsRes.ok) setStats(statsRes.data);
        if (metaRes.ok) setMetadata(metaRes.data || []);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadKey]);

  const onNodesChange: OnNodesChange = useCallback((changes) => setFlowNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange: OnEdgesChange = useCallback((changes) => setFlowEdges((eds) => applyEdgeChanges(changes, eds)), []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  if (!data) return <Empty description="Не удалось загрузить lineage" />;

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

      {/* Interactive Graph */}
      <Card title="Интерактивный граф потока данных" style={{ marginBottom: 16 }}>
        <div style={{ height: 600, border: "1px solid var(--ant-color-border-secondary)", borderRadius: 8 }}>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls />
            <MiniMap
              nodeColor={(n) => nodeColors[n.type || ""] || "#666"}
              maskColor="rgba(0,0,0,0.1)"
              style={{ width: 120, height: 80 }}
            />
          </ReactFlow>
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: "#8c8c8c" }}>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: "#3A8DFF", marginRight: 4 }} /> Коллекторы ({flowNodes.filter((n) => n.type === "collector").length})</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: "#21B573", marginRight: 4 }} /> Таблицы ({flowNodes.filter((n) => n.type === "table").length})</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: "#42D9C8", marginRight: 4 }} /> API ({flowNodes.filter((n) => n.type === "endpoint").length})</span>
          <span><span style={{ display: "inline-block", width: 12, height: 12, borderRadius: 2, background: "#FFB020", marginRight: 4 }} /> Связи: {flowEdges.length}</span>
        </div>
      </Card>

      {/* Dynamic metadata */}
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
