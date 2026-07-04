import { useState, useEffect, useCallback } from "react";
import { Table, Switch, InputNumber, Button, message, Space, Typography, Card, Popconfirm, Collapse, Tag, Select, Progress } from "antd";
import { ReloadOutlined, SaveOutlined, DeleteOutlined, DatabaseOutlined } from "@ant-design/icons";
import { fetchSchedulerSettings, updateSchedulerTask, resetStatistics, fetchSchedulerErrors, clearSchedulerErrors, runAllSchedulerTasks, type SchedulerTask } from "../api/scheduler-client";
import { useCollectStatus } from "../hooks/useCollectStatus";

const { Text } = Typography;

const TASK_LABELS: Record<string, string> = {
  collect_stack: "Сбор стека технологий",
  collect_activity: "Сбор активности проектов",
  collect_contributors: "Сбор контрибьюторов",
  collect_branches: "Сбор веток",
  collect_merge_requests: "Сбор MR",
  collect_pipelines: "Сбор пайплайнов",
};

const TASK_DESCRIPTIONS: Record<string, string> = {
  collect_stack: "Автоматический сбор языков программирования по проектам",
  collect_activity: "Автоматический сбор коммитов, MR и пайплайнов",
  collect_contributors: "Автоматический сбор статистики контрибьюторов",
  collect_branches: "Автоматический сбор веток проектов из GitLab",
  collect_merge_requests: "Автоматический сбор Merge Request из GitLab",
  collect_pipelines: "Автоматический сбор CI/CD пайплайнов из GitLab",
};

export function SchedulerPanel() {
  const [tasks, setTasks] = useState<SchedulerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<number, { enabled: boolean; interval_minutes: number }>>({});
  const [errors, setErrors] = useState<any[]>([]);
  const [errorsTotal, setErrorsTotal] = useState(0);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [errorsPage, setErrorsPage] = useState(1);
  const [errorsTaskFilter, setErrorsTaskFilter] = useState<string | undefined>();

  const { isRunning, currentTask, taskCurrent, taskTotal, poll } = useCollectStatus();

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadErrors = async () => {
    setErrorsLoading(true);
    const res = await fetchSchedulerErrors(50, (errorsPage - 1) * 50, errorsTaskFilter);
    if (res.ok) { setErrors(res.data!.entries); setErrorsTotal(res.data!.total); }
    setErrorsLoading(false);
  };

  useEffect(() => { loadErrors(); }, [errorsPage, errorsTaskFilter]);

  const handleResetStats = async () => {
    const res = await resetStatistics();
    if (res.ok) {
      message.success(`Статистика обнулена. Очищены таблицы: ${res.data!.cleared.join(", ")}`);
      load();
    } else {
      message.error(res.error!);
    }
  };

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

  const handleRunAll = async () => {
    if (isRunning) {
      message.warning("Сбор уже запущен. Дождитесь завершения.");
      return;
    }
    const res = await runAllSchedulerTasks();
    if (res.ok) {
      message.success("Запущен сбор всех данных");
      poll();
    } else {
      message.error(res.error!);
    }
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
        <Typography.Title level={4} style={{ margin: 0 }}>Сбор статистики</Typography.Title>
        <Space>
          <Button
            icon={<DatabaseOutlined />}
            onClick={handleRunAll}
            loading={isRunning}
            disabled={isRunning}
          >Собрать все</Button>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Обновить</Button>
        </Space>
      </div>

      {isRunning && (
        <Card size="small" style={{ marginBottom: 16, background: "var(--ant-color-fill-secondary)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Progress
              percent={taskTotal > 0 ? Math.round((taskCurrent / taskTotal) * 100) : 0}
              status="active"
              style={{ flex: 1 }}
              format={() => taskTotal > 0 ? `${taskCurrent}/${taskTotal}` : ""}
            />
            <Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
              {currentTask ? `Сбор: ${TASK_LABELS[currentTask] || currentTask}` : "Подготовка..."}
            </Text>
          </div>
        </Card>
      )}

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

      <Card style={{ marginTop: 16 }} title="Сброс статистики">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            Полностью обнулит всю собранную статистику (коммиты, контрибьюторы, активность, ветки, MR, стек).
            Настройки проектов, пользователей и справочник контрибьюторов не затрагиваются.
            После сброса потребуется повторный сбор данных.
          </Typography.Text>
          <Popconfirm
            title="Обнулить всю статистику?"
            description="Это действие необратимо. Все собранные данные будут удалены."
            onConfirm={handleResetStats}
            okText="Да, обнулить"
            cancelText="Отмена"
            okButtonProps={{ danger: true, disabled: isRunning }}
          >
            <Button danger icon={<DeleteOutlined />} disabled={isRunning}>Обнулить статистику</Button>
          </Popconfirm>
        </Space>
      </Card>

      <Collapse style={{ marginTop: 16 }} items={[{
        key: "errors",
        label: <span style={{ fontSize: 14 }}>Лог ошибок ({errorsTotal})</span>,
        children: (
          <div>
            <div style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
              <Select placeholder="Фильтр по задаче" allowClear style={{ width: 250 }}
                value={errorsTaskFilter} onChange={(v) => { setErrorsTaskFilter(v); setErrorsPage(1); }}
                options={Object.entries(TASK_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
              <Button icon={<ReloadOutlined />} onClick={loadErrors} loading={errorsLoading}>Обновить</Button>
              <Popconfirm title="Очистить лог ошибок?" description={errorsTaskFilter ? `Удалить ошибки задачи «${TASK_LABELS[errorsTaskFilter] || errorsTaskFilter}»?` : "Удалить ВСЕ ошибки?"} onConfirm={async () => {
                const res = await clearSchedulerErrors(errorsTaskFilter);
                if (res.ok) { message.success(`Удалено: ${res.data!.deleted}`); loadErrors(); } else { message.error(res.error!); }
              }} okText="Да, очистить" cancelText="Нет" okButtonProps={{ danger: true }}>
                <Button danger icon={<DeleteOutlined />}>Очистить</Button>
              </Popconfirm>
            </div>
            <Table
              columns={[
                { title: "Время", dataIndex: "created_at", key: "created_at", width: 170,
                  render: (v: string) => new Date(v).toLocaleString() },
                { title: "Задача", dataIndex: "task_name", key: "task_name", width: 180,
                  render: (v: string) => <Tag>{TASK_LABELS[v] || v}</Tag> },
                { title: "Проект", key: "project",
                  render: (_: any, r: any) => r.project_label || <Text type="secondary">N/A</Text> },
                { title: "Код", dataIndex: "error_code", key: "error_code", width: 100 },
                { title: "Источник", dataIndex: "source", key: "source", width: 100,
                  render: (v: string) => <Tag color={v === "manual" ? "blue" : "green"}>{v === "manual" ? "Ручной" : "Шедулер"}</Tag> },
                { title: "Ошибка", dataIndex: "error_message", key: "error_message",
                  render: (v: string) => <Text type="danger" style={{ fontSize: 12, wordBreak: "break-all" }}>{v}</Text> },
              ]}
              dataSource={errors}
              rowKey="id"
              loading={errorsLoading}
              size="small"
              pagination={{
                current: errorsPage,
                pageSize: 50,
                total: errorsTotal,
                onChange: setErrorsPage,
                showTotal: (t: number) => `Всего: ${t} ошибок`,
              }}
            />
          </div>
        ),
      }]} />
    </div>
  );
}
