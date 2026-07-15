import { useState, useEffect } from "react";
import { Card, Table, Spin, Empty, Typography, Tag, Row, Col, Statistic, Progress } from "antd";
import { CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { fetchCollectionHealth, fetchCollectionStats } from "../../api/client";
import dayjs from "dayjs";

const { Text, Title } = Typography;

export function DataHealth() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    Promise.all([fetchCollectionHealth(), fetchCollectionStats()]).then(([hRes, sRes]) => {
      if (hRes.ok) setHealth(hRes.data);
      if (sRes.ok) setStats(sRes.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  if (!health) return <Empty description="Не удалось загрузить данные" />;

  const freshnessColumns = [
    { title: "Источник", dataIndex: "source", key: "source" },
    { title: "Последнее обновление", dataIndex: "lastUpdate", key: "lastUpdate", render: (v: string) => v ? dayjs(v).format("DD.MM.YYYY HH:mm") : <Text type="secondary">Нет данных</Text> },
    { title: "Возраст (дн.)", dataIndex: "ageDays", key: "ageDays", render: (v: number) => {
      if (v === null) return <Text type="secondary">—</Text>;
      const color = v <= 1 ? "#21B573" : v <= 7 ? "#FFB020" : "#E5484D";
      return <span style={{ color, fontWeight: 600 }}>{v}</span>;
    }},
    { title: "Статус", dataIndex: "status", key: "status", render: (v: string) => v === "fresh" ? <Tag color="green">Свежие</Tag> : v === "stale" ? <Tag color="orange">Устарели</Tag> : <Tag color="red">Критично</Tag> },
  ];

  const freshnessData = [
    { source: "Коммиты", lastUpdate: stats.freshness?.lastCommit, ageDays: stats.freshness?.lastCommit ? Math.floor((Date.now() - new Date(stats.freshness.lastCommit).getTime()) / 86400000) : null, status: stats.freshness?.lastCommit ? (Math.floor((Date.now() - new Date(stats.freshness.lastCommit).getTime()) / 86400000) <= 7 ? "fresh" : "stale") : "unknown" },
    { source: "Merge Requests", lastUpdate: stats.freshness?.lastMr, ageDays: stats.freshness?.lastMr ? Math.floor((Date.now() - new Date(stats.freshness.lastMr).getTime()) / 86400000) : null, status: stats.freshness?.lastMr ? (Math.floor((Date.now() - new Date(stats.freshness.lastMr).getTime()) / 86400000) <= 7 ? "fresh" : "stale") : "unknown" },
    { source: "Пайплайны", lastUpdate: stats.freshness?.lastPipeline, ageDays: stats.freshness?.lastPipeline ? Math.floor((Date.now() - new Date(stats.freshness.lastPipeline).getTime()) / 86400000) : null, status: stats.freshness?.lastPipeline ? (Math.floor((Date.now() - new Date(stats.freshness.lastPipeline).getTime()) / 86400000) <= 7 ? "fresh" : "stale") : "unknown" },
  ];

  const healthIcon = health.health === "healthy" ? <CheckCircleOutlined style={{ color: "#21B573", fontSize: 24 }} />
    : health.health === "degraded" ? <WarningOutlined style={{ color: "#FFB020", fontSize: 24 }} />
    : <CloseCircleOutlined style={{ color: "#E5484D", fontSize: 24 }} />;

  return (
    <div>
      <Title level={4}>Здоровье данных</Title>
      <Text type="secondary" style={{ display: "block", marginBottom: 24 }}>
        Свежесть данных и предупреждения о проблемах
      </Text>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card>
            <div style={{ textAlign: "center" }}>
              {healthIcon}
              <div style={{ marginTop: 8, fontSize: 18, fontWeight: 600 }}>{health.health}</div>
              <Text type="secondary">Общее состояние</Text>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Предупреждений" value={health.warnings?.length || 0} valueStyle={{ color: health.warnings?.length > 0 ? "#FFB020" : "#21B573" }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Ошибок за 24ч" value={stats.errors24h || 0} valueStyle={{ color: (stats.errors24h || 0) > 0 ? "#E5484D" : "#21B573" }} />
          </Card>
        </Col>
      </Row>

      {health.warnings?.length > 0 && (
        <Card title="Предупреждения" style={{ marginBottom: 24 }}>
          {health.warnings.map((w: any, i: number) => (
            <div key={i} style={{ padding: "6px 0", borderBottom: i < health.warnings.length - 1 ? "1px solid var(--ant-color-border-secondary)" : "none", display: "flex", alignItems: "center", gap: 8 }}>
              {w.severity === "error" ? <CloseCircleOutlined style={{ color: "#E5484D" }} /> : <WarningOutlined style={{ color: "#FFB020" }} />}
              <Text strong>{w.table}</Text>
              <Text type="secondary">— {w.message}</Text>
            </div>
          ))}
        </Card>
      )}

      <Card title="Свежесть данных">
        <Table dataSource={freshnessData} columns={freshnessColumns} size="small" pagination={false} rowKey="source" />
      </Card>
    </div>
  );
}
