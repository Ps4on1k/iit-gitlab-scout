import { useState, useEffect } from "react";
import { Card, Table, Spin, Empty, Typography, Tag, Row, Col, Statistic, Button, message } from "antd";
import { ReloadOutlined, CheckCircleOutlined, WarningOutlined, CloseCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { fetchCollectionStats, fetchCollectionHealth } from "../../api/client";

const { Text, Title } = Typography;

export function DataCollectionMonitor() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([fetchCollectionStats(), fetchCollectionHealth()]).then(([statsRes, healthRes]) => {
      if (statsRes.ok) setStats(statsRes.data);
      if (healthRes.ok) setHealth(healthRes.data);
      setLoading(false);
    });
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

  const taskColumns = [
    { title: "Задача", dataIndex: "task_name", key: "task_name", render: (v: string) => <Tag>{v}</Tag> },
    { title: "Статус", dataIndex: "enabled", key: "enabled", render: (v: boolean) => v ? <Tag color="green">Включена</Tag> : <Tag>Отключена</Tag> },
    { title: "Последний запуск", dataIndex: "last_run_at", key: "last_run_at", render: (v: string) => v ? new Date(v).toLocaleString() : <Text type="secondary">Нет</Text> },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <Title level={4}>Сбор данных</Title>
          <Text type="secondary">Мониторинг состояния коллекторов и свежести данных</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadData}>Обновить</Button>
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

      <Row gutter={16}>
        <Col span={12}>
          <Card title="Записи по таблицам">
            <Table dataSource={recordData} columns={recordColumns} size="small" pagination={false} rowKey="name" />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Задачи сбора">
            <Table dataSource={stats.tasks || []} columns={taskColumns} size="small" pagination={false} rowKey="task_name" />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
