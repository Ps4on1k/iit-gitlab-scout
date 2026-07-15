import { useState, useEffect } from "react";
import { Card, Table, Spin, Empty, Typography, Tag, Row, Col, Statistic, Button, message } from "antd";
import { ReloadOutlined, CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { fetchCollectionStats, fetchCollectionHealth, triggerDagsterCollect } from "../../api/client";

const { Text, Title } = Typography;

export function DataCollectionMonitor() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [triggering, setTriggering] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([fetchCollectionStats(), fetchCollectionHealth()]).then(([statsRes, healthRes]) => {
      if (statsRes.ok) setStats(statsRes.data);
      if (healthRes.ok) setHealth(healthRes.data);
      setLoading(false);
    });
  };

  const handleTrigger = async () => {
    setTriggering(true);
    const res = await triggerDagsterCollect();
    setTriggering(false);
    if (res.ok) {
      message.success("Сбор данных запущен в Dagster. Мониторинг на http://localhost:3001");
    } else {
      message.error(res.error || "Ошибка запуска Dagster");
    }
  };

  useEffect(() => { loadData(); }, []);

  if (loading) return <Spin size="large" style={{ display: "block", margin: "80px auto" }} />;
  if (!stats) return <Empty description="Не удалось загрузить статистику" />;

  const healthIcon = health?.health === "healthy" ? <CheckCircleOutlined style={{ color: "#21B573" }} />
    : health?.health === "degraded" ? <WarningOutlined style={{ color: "#FFB020" }} />
    : <CloseCircleOutlined style={{ color: "#E5484D" }} />;

  const recordColumns = [
    { title: "Таблица", dataIndex: "name", key: "name", render: (v: string) => <Text code>{v}</Text> },
    { title: "Записей", dataIndex: "count", key: "count", align: "right" as const, render: (v: number) => v.toLocaleString() },
  ];
  const recordData = Object.entries(stats.records).map(([name, count]) => ({ name, count: count as number }));

  const freshnessColumns = [
    { title: "Источник", dataIndex: "source", key: "source" },
    { title: "Последнее обновление", dataIndex: "lastUpdate", key: "lastUpdate", render: (v: string) => v ? new Date(v).toLocaleString("ru-RU") : <Text type="secondary">Нет данных</Text> },
    { title: "Возраст (дн.)", dataIndex: "ageDays", key: "ageDays", render: (v: number | null) => {
      if (v === null) return <Text type="secondary">—</Text>;
      const color = v <= 1 ? "#21B573" : v <= 7 ? "#FFB020" : "#E5484D";
      return <span style={{ color, fontWeight: 600 }}>{v}</span>;
    }},
    { title: "Статус", dataIndex: "status", key: "status", render: (v: string) => v === "fresh" ? <Tag color="green">Свежие</Tag> : v === "stale" ? <Tag color="orange">Устарели</Tag> : <Tag color="red">Нет данных</Tag> },
  ];
  const freshnessData = [
    { source: "Коммиты", lastUpdate: stats.freshness?.lastCommit, ageDays: stats.freshness?.lastCommit ? Math.floor((Date.now() - new Date(stats.freshness.lastCommit).getTime()) / 86400000) : null, status: stats.freshness?.lastCommit ? (Math.floor((Date.now() - new Date(stats.freshness.lastCommit).getTime()) / 86400000) <= 7 ? "fresh" : "stale") : "unknown" },
    { source: "Merge Requests", lastUpdate: stats.freshness?.lastMr, ageDays: stats.freshness?.lastMr ? Math.floor((Date.now() - new Date(stats.freshness.lastMr).getTime()) / 86400000) : null, status: stats.freshness?.lastMr ? (Math.floor((Date.now() - new Date(stats.freshness.lastMr).getTime()) / 86400000) <= 7 ? "fresh" : "stale") : "unknown" },
    { source: "Пайплайны", lastUpdate: stats.freshness?.lastPipeline, ageDays: stats.freshness?.lastPipeline ? Math.floor((Date.now() - new Date(stats.freshness.lastPipeline).getTime()) / 86400000) : null, status: stats.freshness?.lastPipeline ? (Math.floor((Date.now() - new Date(stats.freshness.lastPipeline).getTime()) / 86400000) <= 7 ? "fresh" : "stale") : "unknown" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Title level={4}>Сбор данных</Title>
          <Text type="secondary">Мониторинг состояния коллекторов и свежести данных</Text>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={loadData}>Обновить</Button>
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={handleTrigger} loading={triggering}>Собрать статистику</Button>
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}><Card><Statistic title="Проектов" value={stats.projects} /></Card></Col>
        <Col span={6}><Card><Statistic title="Всего записей" value={Object.values(stats.records).reduce((s: number, v: any) => s + (v as number), 0)} /></Card></Col>
        <Col span={6}><Card><Statistic title="Ошибок за 24ч" value={stats.errors24h} valueStyle={{ color: stats.errors24h > 0 ? "#E5484D" : "#21B573" }} /></Card></Col>
        <Col span={6}><Card><Statistic title="Здоровье" value={health?.health || "unknown"} prefix={healthIcon} /></Card></Col>
      </Row>

      {health?.warnings?.length > 0 && (
        <Card title="Предупреждения" style={{ marginBottom: 24 }}>
          {health.warnings.map((w: any, i: number) => (
            <div key={i} style={{ padding: "4px 0", display: "flex", alignItems: "center", gap: 8 }}>
              {w.severity === "error" ? <CloseCircleOutlined style={{ color: "#E5484D" }} /> : <WarningOutlined style={{ color: "#FFB020" }} />}
              <Text>{w.table}: {w.message}</Text>
            </div>
          ))}
        </Card>
      )}

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={24}>
          <Card title="Свежесть данных">
            <Table dataSource={freshnessData} columns={freshnessColumns} size="small" pagination={false} rowKey="source" />
          </Card>
        </Col>
      </Row>

      <Card title="Записи по таблицам">
        <Table dataSource={recordData} columns={recordColumns} size="small" pagination={false} rowKey="name" />
      </Card>
    </div>
  );
}
