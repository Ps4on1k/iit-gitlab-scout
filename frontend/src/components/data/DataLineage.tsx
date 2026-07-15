import { useState, useEffect } from "react";
import { Card, Spin, Empty, Typography, Tag, Row, Col, Statistic, Collapse, Table, Tooltip, Badge } from "antd";
import { DatabaseOutlined, CloudOutlined, ApiOutlined, ArrowRightOutlined, ArrowDownOutlined, InfoCircleOutlined, ExpandOutlined } from "@ant-design/icons";
import { fetchLineageFlow, fetchLineageTableStats } from "../../api/client";

const { Text, Title } = Typography;

interface FieldInfo {
  name: string;
  type: string;
  description: string;
}

interface TableInfo {
  written_by: string[];
  read_by: string[];
  description: string;
  fields?: FieldInfo[];
  stats?: { rowCount: number; size: string; lastUpdated: string | null };
}

interface LineageData {
  collectors: Record<string, { writes_to: string[]; description: string }>;
  tables: Record<string, TableInfo>;
  api_endpoints: Record<string, { reads_from: string[]; description: string }>;
}

function CollectorNode({ name, info }: { name: string; info: any }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "linear-gradient(135deg, rgba(58,141,255,0.08) 0%, rgba(66,217,200,0.08) 100%)", border: "1px solid rgba(58,141,255,0.2)" }}>
      <CloudOutlined style={{ color: "#3A8DFF", fontSize: 16 }} />
      <div style={{ flex: 1 }}>
        <Text strong style={{ fontSize: 13 }}>{name}</Text>
        <div style={{ fontSize: 11, color: "var(--ant-color-textSecondary)" }}>{info.description}</div>
      </div>
      <ArrowRightOutlined style={{ color: "#3A8DFF", fontSize: 14 }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {info.writes_to.map((t: string) => (
          <Tag key={t} color="green" style={{ margin: 0, fontSize: 10 }}>{t}</Tag>
        ))}
      </div>
    </div>
  );
}

function TableCard({ name, info, stats }: { name: string; info: TableInfo; stats: any }) {
  const [expanded, setExpanded] = useState(false);
  const tableStats = stats?.tables?.find((t: any) => t.name === name);
  const rowCount = tableStats?.stats?.rowCount || 0;
  const size = tableStats?.stats?.size || "0 bytes";

  return (
    <Card
      size="small"
      style={{ marginBottom: 8 }}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DatabaseOutlined style={{ color: "#3A8DFF" }} />
          <Text strong style={{ fontSize: 13 }}>{name}</Text>
          <Badge count={rowCount.toLocaleString()} style={{ backgroundColor: "#3A8DFF" }} overflowCount={999999} />
          <Text type="secondary" style={{ fontSize: 11 }}>{size}</Text>
        </div>
      }
      extra={
        info.fields && info.fields.length > 0 && (
          <Tooltip title="Показать поля таблицы">
            <ExpandOutlined
              style={{ color: expanded ? "#3A8DFF" : "var(--ant-color-textTertiary)", cursor: "pointer", fontSize: 14 }}
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            />
          </Tooltip>
        )
      }
    >
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{info.description}</Text>
      </div>

      <div style={{ marginBottom: 4 }}>
        <Text style={{ fontSize: 11, color: "#21B573", fontWeight: 600 }}>Записывают:</Text>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {info.written_by.map((w) => (
            <Tag key={w} color="green" style={{ fontSize: 10, margin: 0 }}>{w}</Tag>
          ))}
        </div>
      </div>

      <div>
        <Text style={{ fontSize: 11, color: "#3A8DFF", fontWeight: 600 }}>Читают:</Text>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {info.read_by.map((r) => (
            <Tag key={r} color="blue" style={{ fontSize: 10, margin: 0 }}>{r}</Tag>
          ))}
        </div>
      </div>

      {expanded && info.fields && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--ant-color-border-secondary)", paddingTop: 12 }}>
          <Text strong style={{ fontSize: 11, marginBottom: 8, display: "block" }}>Поля таблицы:</Text>
          <Table
            dataSource={info.fields}
            columns={[
              { title: "Поле", dataIndex: "name", key: "name", width: 150, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
              { title: "Тип", dataIndex: "type", key: "type", width: 80, render: (v: string) => <Tag style={{ fontSize: 10, margin: 0 }}>{v}</Tag> },
              { title: "Описание", dataIndex: "description", key: "description" },
            ]}
            size="small"
            pagination={false}
            rowKey="name"
          />
        </div>
      )}
    </Card>
  );
}

function EndpointNode({ endpoint, info }: { endpoint: string; info: any }) {
  return (
    <div style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(66,217,200,0.3)", background: "rgba(66,217,200,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <ApiOutlined style={{ color: "#42D9C8", fontSize: 14 }} />
        <Text code style={{ fontSize: 12 }}>{endpoint}</Text>
      </div>
      <div style={{ fontSize: 12, color: "var(--ant-color-textSecondary)", marginBottom: 4 }}>
        {info.description}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {info.reads_from.map((r: string) => (
          <Tag key={r} color="blue" style={{ fontSize: 10, margin: 0 }}>{r}</Tag>
        ))}
      </div>
    </div>
  );
}

export function DataLineage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LineageData | null>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    Promise.all([fetchLineageFlow(), fetchLineageTableStats()]).then(([flowRes, statsRes]) => {
      if (flowRes.ok) setData(flowRes.data);
      if (statsRes.ok) setStats(statsRes.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  if (!data) return <Empty description="Не удалось загрузить lineage" />;

  return (
    <div>
      <Title level={4}>Потоки данных</Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
        Откуда берутся данные и как попадают в дашборды
      </Text>

      {/* Summary */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}><Card><Statistic title="Коллекторы" value={Object.keys(data.collectors).length} prefix={<CloudOutlined />} /></Card></Col>
        <Col span={8}><Card><Statistic title="Таблицы" value={Object.keys(data.tables).length} prefix={<DatabaseOutlined />} /></Card></Col>
        <Col span={8}><Card><Statistic title="API эндпоинты" value={Object.keys(data.api_endpoints).length} prefix={<ApiOutlined />} /></Card></Col>
      </Row>

      {/* Visual Flow: Collectors → Tables → API */}
      <Card title="Поток данных: Коллекторы → Таблицы → API" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Collectors */}
          <div>
            <Text strong style={{ fontSize: 12, color: "#3A8DFF", display: "block", marginBottom: 8 }}>Коллекторы</Text>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(data.collectors).map(([name, info]) => (
                <CollectorNode key={name} name={name} info={info} />
              ))}
            </div>
          </div>

          {/* Tables */}
          <div>
            <Text strong style={{ fontSize: 12, color: "#21B573", display: "block", marginBottom: 8 }}>Таблицы</Text>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(data.tables).map(([name, info]) => (
                <TableCard key={name} name={name} info={info} stats={stats} />
              ))}
            </div>
          </div>

          {/* API Endpoints */}
          <div>
            <Text strong style={{ fontSize: 12, color: "#42D9C8", display: "block", marginBottom: 8 }}>API эндпоинты</Text>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(data.api_endpoints).map(([endpoint, info]) => (
                <EndpointNode key={endpoint} endpoint={endpoint} info={info} />
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
