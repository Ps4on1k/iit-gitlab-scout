import { useState, useEffect } from "react";
import { Table, Tag, Typography, Select, Button, Space } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { fetchAuditLog } from "../api/client";

const { Text } = Typography;

const ACTION_COLORS: Record<string, string> = {
  login_success: "#3f8600",
  login_failed: "#cf1322",
  project_create: "#1677ff",
  project_update: "#d4b106",
  project_delete: "#cf1322",
  user_create: "#1677ff",
  user_update: "#d4b106",
  user_delete: "#cf1322",
};

export function AuditLogPanel() {
  const [entries, setEntries] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const pageSize = 50;

  const load = async () => {
    setLoading(true);
    const res = await fetchAuditLog(pageSize, (page - 1) * pageSize, actionFilter);
    if (res.ok) {
      setEntries(res.data!.entries);
      setTotal(res.data!.total);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [page, actionFilter]);

  const columns = [
    {
      title: "Время",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: "Пользователь",
      dataIndex: "username",
      key: "username",
      render: (v: string) => <Text strong>{v || "system"}</Text>,
    },
    {
      title: "Действие",
      dataIndex: "action",
      key: "action",
      render: (v: string) => <Tag color={ACTION_COLORS[v] || "default"}>{v}</Tag>,
    },
    {
      title: "Детали",
      dataIndex: "details",
      key: "details",
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
  ];

  const actionOptions = Object.keys(ACTION_COLORS).map((a) => ({ value: a, label: a }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, alignItems: "center" }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Аудит-лог</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>История действий администраторов и авторизации</Typography.Text>
        </div>
        <Space>
          <Select placeholder="Фильтр по действию" allowClear style={{ width: 200 }}
            value={actionFilter} onChange={(v) => { setActionFilter(v); setPage(1); }}
            options={actionOptions} />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Обновить</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={entries}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: (t: number) => `Всего: ${t} записей`,
        }}
        size="small"
      />
    </div>
  );
}
