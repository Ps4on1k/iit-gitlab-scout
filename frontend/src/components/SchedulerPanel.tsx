import { useState, useEffect } from "react";
import { Table, Switch, InputNumber, Button, message, Space, Typography, Card } from "antd";

const { Text } = Typography;
import { ReloadOutlined, SaveOutlined } from "@ant-design/icons";
import { fetchSchedulerSettings, updateSchedulerTask, type SchedulerTask } from "../api/scheduler-client";

const TASK_LABELS: Record<string, string> = {
  collect_stack: "Сбор стека технологий",
  collect_activity: "Сбор активности проектов",
  collect_contributors: "Сбор контрибьюторов",
  collect_branches: "Сбор веток",
};

const TASK_DESCRIPTIONS: Record<string, string> = {
  collect_stack: "Автоматический сбор языков программирования по проектам",
  collect_activity: "Автоматический сбор коммитов, MR и пайплайнов",
  collect_contributors: "Автоматический сбор статистики контрибьюторов",
  collect_branches: "Автоматический сбор веток проектов из GitLab",
};

export function SchedulerPanel() {
  const [tasks, setTasks] = useState<SchedulerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<number, { enabled: boolean; interval_minutes: number }>>({});

  const load = async () => {
    setLoading(true);
    const res = await fetchSchedulerSettings();
    if (res.ok) {
      setTasks(res.data!);
      const vals: Record<number, { enabled: boolean; interval_minutes: number }> = {};
      for (const t of res.data!) {
        vals[t.id] = { enabled: t.enabled, interval_minutes: t.interval_minutes };
      }
      setEditValues(vals);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (id: number) => {
    setSaving(id);
    const values = editValues[id];
    const res = await updateSchedulerTask(id, values);
    if (res.ok) {
      message.success("Настройки сохранены");
      load();
    } else {
      message.error(res.error!);
    }
    setSaving(null);
  };

  const columns = [
    {
      title: "Задача",
      key: "task_name",
      render: (_: any, record: SchedulerTask) => (
        <div>
          <Typography.Text strong>{TASK_LABELS[record.task_name] || record.task_name}</Typography.Text>
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {TASK_DESCRIPTIONS[record.task_name] || record.task_name}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: "Включена",
      key: "enabled",
      width: 100,
      render: (_: any, record: SchedulerTask) => (
        <Switch
          checked={editValues[record.id]?.enabled ?? record.enabled}
          onChange={(v) => setEditValues((prev) => ({ ...prev, [record.id]: { ...prev[record.id], enabled: v } }))}
        />
      ),
    },
    {
      title: "Интервал (мин)",
      key: "interval_minutes",
      width: 150,
      render: (_: any, record: SchedulerTask) => (
        <InputNumber
          min={5}
          max={10080}
          value={editValues[record.id]?.interval_minutes ?? record.interval_minutes}
          onChange={(v) => setEditValues((prev) => ({ ...prev, [record.id]: { ...prev[record.id], interval_minutes: v || 60 } }))}
          style={{ width: 100 }}
        />
      ),
    },
    {
      title: "Последний запуск",
      key: "last_run_at",
      render: (_: any, record: SchedulerTask) => record.last_run_at
        ? new Date(record.last_run_at).toLocaleString()
        : <Text type="secondary">Нет</Text>,
    },
    {
      title: "",
      key: "actions",
      width: 80,
      render: (_: any, record: SchedulerTask) => (
        <Button
          type="primary" size="small" icon={<SaveOutlined />}
          loading={saving === record.id}
          onClick={() => handleSave(record.id)}
        >
          Сохранить
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Периодичность обновления</Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Обновить</Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Typography.Text type="secondary">
          Интервал определяет, как часто автоматически запускается сбор данных из GitLab API.
          Минимальный интервал — 5 минут. Задачи выполняются последовательно.
        </Typography.Text>
      </Card>
    </div>
  );
}
