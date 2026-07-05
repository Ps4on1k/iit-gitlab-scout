import { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Input, Select, Space, Typography, message, Popconfirm, Tag } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";

const BASE_URL = "/api";
function getToken(): string | null { return localStorage.getItem("token"); }

async function fetchJson<T>(url: string, options?: RequestInit): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = getToken();
  const headers: Record<string, string> = { ...(options?.body ? { "Content-Type": "application/json" } : {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${url}`, { ...options, headers, cache: "no-store" });
  if (!res.ok) { const body = await res.json().catch(() => ({})); return { ok: false, error: (body as any).error || `HTTP ${res.status}` }; }
  return res.json() as Promise<{ ok: boolean; data?: T }>;
}

interface CatalogEntry {
  id: number;
  ecosystem: string;
  language: string;
  framework: string | null;
  file_names: string[];
  dependency_field: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const ECOSYSTEM_COLORS: Record<string, string> = {
  npm: "#cb3837", pip: "#3776ab", go: "#00add8", cargo: "#dea584",
  maven: "#d94f00", gradle: "#02303a", nuget: "#512bd4", composer: "#885630",
  pub: "#0175c2", "swift-pm": "#f05138",
};

const { Text } = Typography;

export function DependenciesCatalogPanel() {
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const res = await fetchJson<CatalogEntry[]>("/v1/dependency-catalog");
    if (res.ok) setEntries(res.data!);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ file_names: "package.json" });
    setModalOpen(true);
  };

  const openEdit = (entry: CatalogEntry) => {
    setEditingId(entry.id);
    form.setFieldsValue({
      ecosystem: entry.ecosystem,
      language: entry.language,
      framework: entry.framework || "",
      file_names: entry.file_names.join(", "),
      dependency_field: entry.dependency_field || "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const fileNames = values.file_names.split(",").map((s: string) => s.trim()).filter(Boolean);
    setSubmitting(true);
    try {
      if (editingId) {
        const res = await fetchJson(`/v1/dependency-catalog/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({ ...values, file_names: fileNames, framework: values.framework || null, dependency_field: values.dependency_field || null }),
        });
        if (!res.ok) { message.error(res.error!); return; }
        message.success("Запись обновлена");
      } else {
        const res = await fetchJson("/v1/dependency-catalog", {
          method: "POST",
          body: JSON.stringify({ ...values, file_names: fileNames, framework: values.framework || null, dependency_field: values.dependency_field || null }),
        });
        if (!res.ok) { message.error(res.error!); return; }
        message.success("Запись создана");
      }
      setModalOpen(false);
      load();
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    const res = await fetchJson(`/v1/dependency-catalog/${id}`, { method: "DELETE" });
    if (!res.ok) { message.error(res.error!); return; }
    message.success("Запись удалена");
    load();
  };

  const columns = [
    {
      title: "Экосистема",
      dataIndex: "ecosystem",
      key: "ecosystem",
      render: (v: string) => <Tag color={ECOSYSTEM_COLORS[v] || "default"}>{v}</Tag>,
    },
    { title: "Язык", dataIndex: "language", key: "language" },
    { title: "Фреймворк", dataIndex: "framework", key: "framework", render: (v: string | null) => v || <Text type="secondary">—</Text> },
    { title: "Файлы зависимостей", dataIndex: "file_names", key: "file_names", render: (v: string[]) => v.join(", ") },
    { title: "Поле", dataIndex: "dependency_field", key: "dependency_field", render: (v: string | null) => v || <Text type="secondary">—</Text> },
    {
      title: "Действия", key: "actions", width: 100,
      render: (_: any, record: CatalogEntry) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="Удалить?" onConfirm={() => handleDelete(record.id)} okText="Да" cancelText="Нет">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Каталог зависимостей</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить</Button>
      </div>
      <Typography.Paragraph type="secondary">
        Справочник известных экосистем, языков, фреймворков и файлов зависимостей. Используется при автоматическом сборе для определения типа проекта.
      </Typography.Paragraph>
      <Table columns={columns} dataSource={entries} rowKey="id" loading={loading} size="small" pagination={{ pageSize: 20 }} />
      <Modal title={editingId ? "Редактировать запись" : "Добавить запись"} open={modalOpen}
        onCancel={() => setModalOpen(false)} onOk={handleSubmit} confirmLoading={submitting}
        okText={editingId ? "Сохранить" : "Добавить"} cancelText="Отмена" destroyOnClose>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="ecosystem" label="Экосистема" rules={[{ required: true }]}>
            <Select options={Object.keys(ECOSYSTEM_COLORS).map((k) => ({ value: k, label: k }))} />
          </Form.Item>
          <Form.Item name="language" label="Язык" rules={[{ required: true }]}>
            <Input placeholder="TypeScript" />
          </Form.Item>
          <Form.Item name="framework" label="Фреймворк">
            <Input placeholder="React (необязательно)" />
          </Form.Item>
          <Form.Item name="file_names" label="Файлы зависимостей" rules={[{ required: true }]}
            help="Через запятую: package.json, requirements.txt">
            <Input placeholder="package.json" />
          </Form.Item>
          <Form.Item name="dependency_field" label="Поле зависимостей">
            <Input placeholder="dependencies (необязательно)" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
