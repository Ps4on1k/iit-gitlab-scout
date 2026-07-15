import { useState, useEffect } from "react";
import { Card, Spin, Empty, Typography, Tag, Row, Col, Statistic, Tooltip } from "antd";
import { DatabaseOutlined, CloudOutlined, ApiOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { fetchLineageFlow, fetchLineageTableStats } from "../../api/client";

const { Text, Title } = Typography;

interface LineageData {
  collectors: Record<string, { reads_from: string[]; writes_to: string[]; description: string }>;
  tables: Record<string, { written_by: string[]; read_by: string[]; description: string; estimated_rows_per_project?: string }>;
  api_endpoints: Record<string, { reads_from: string[]; description: string }>;
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

      {/* Collectors → Tables */}
      <Card title="Коллекторы → Таблицы" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {Object.entries(data.collectors).map(([name, info]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", borderRadius: 6, background: "var(--ant-color-fill-secondary)" }}>
              <Tag color="blue" style={{ margin: 0 }}>{name}</Tag>
              <ArrowRightOutlined style={{ color: "var(--ant-color-textTertiary)" }} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {info.writes_to.map((t) => (
                  <Tag key={t} color="green" style={{ margin: 0 }}>{t}</Tag>
                ))}
              </div>
              <Text type="secondary" style={{ fontSize: 12, marginLeft: "auto" }}>{info.description}</Text>
            </div>
          ))}
        </div>
      </Card>

      {/* Tables */}
      <Card title="Таблицы и их использование" style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(data.tables).map(([name, info]) => {
            const tableStats = stats?.tables?.find((t: any) => t.name === name);
            return (
              <div key={name} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--ant-color-border-secondary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <DatabaseOutlined style={{ color: "#3A8DFF" }} />
                  <Text strong style={{ fontSize: 13 }}>{name}</Text>
                  {tableStats && <Text type="secondary" style={{ fontSize: 11 }}>{tableStats.stats?.rowCount?.toLocaleString()} записей · {tableStats.stats?.size}</Text>}
                  {info.estimated_rows_per_project && <Text type="secondary" style={{ fontSize: 11 }}>~{info.estimated_rows_per_project}/проект</Text>}
                </div>
                <div style={{ fontSize: 12, color: "var(--ant-color-textSecondary)" }}>
                  <span>Записывают: </span>
                  {info.written_by.map((w) => <Tag key={w} style={{ fontSize: 10, margin: 0 }}>{w}</Tag>)}
                  <span style={{ margin: "0 4px" }}>|</span>
                  <span>Читают: </span>
                  {info.read_by.map((r) => <Tag key={r} color="blue" style={{ fontSize: 10, margin: 0 }}>{r}</Tag>)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* API Endpoints */}
      <Card title="API эндпоинты и их источники данных">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(data.api_endpoints).map(([endpoint, info]) => (
            <div key={endpoint} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid var(--ant-color-border-secondary)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <ApiOutlined style={{ color: "#42D9C8" }} />
                <Text code style={{ fontSize: 12 }}>{endpoint}</Text>
              </div>
              <div style={{ fontSize: 12, color: "var(--ant-color-textSecondary)" }}>
                <span>Источники: </span>
                {info.reads_from.map((r) => <Tag key={r} color="blue" style={{ fontSize: 10, margin: 0 }}>{r}</Tag>)}
                <span style={{ marginLeft: 8 }}>{info.description}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
