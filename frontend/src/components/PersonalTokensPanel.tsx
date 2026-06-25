import { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Input, Space, Typography, Popconfirm, message, Tag } from "antd";
import { PlusOutlined, DeleteOutlined, ScanOutlined } from "@ant-design/icons";
import { fetchPersonalTokens, createPersonalToken, deletePersonalToken, scanProjects } from "../api/client";

const { Text } = Typography;

export function PersonalTokensPanel() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState<number | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const res = await fetchPersonalTokens();
    if (res.ok) setTokens(res.data!);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      const res = await createPersonalToken(values);
      if (!res.ok) { message.error(res.error!); return; }
      message.success("Токен создан");
      setModalOpen(false);
      form.resetFields();
      load();
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    const res = await deletePersonalToken(id);
    if (!res.ok) { message.error(res.error!); return; }
    message.success("Токен удалён");
    load();
  };

  const handleScan = async (id: number) => {
    setScanning(id);
    try {
      const res = await scanProjects(id);
      if (res.ok) {
        message.success(`Найдено: ${res.data!.total} проектов, добавлено: ${res.data!.added}, пропущено: ${res.data!.skipped}`);
        load();
      } else { message.error(res.error!); }
    } finally { setScanning(null); }
  };

  const columns = [
    {
      title: "Метка", dataIndex: "label", key: "label",
      render: (v: string) => v || <Text type="secondary">Без метки</Text>,
    },
    {
      title: "Base URL", dataIndex: "base_url", key: "base_url",
      render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
    },
    {
      title: "Создан", dataIndex: "created_at", key: "created_at",
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: "Действия", key: "actions", width: 180,
      render: (_: any, record: any) => (
        <Space>
          <Button type="primary" size="small" icon={<ScanOutlined />} loading={scanning === record.id} onClick={() => handleScan(record.id)}>
            Сканировать
          </Button>
          <Popconfirm title="Удалить токен?" onConfirm={() => handleDelete(record.id)} okText="Да" cancelText="Нет">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Персональные токены</Typography.Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Управление персональными токенами GitLab для автоматического сбора проектов</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Добавить токен</Button>
      </div>

      <Table columns={columns} dataSource={tokens} rowKey="id" loading={loading} pagination={false} size="small" />

      <div style={{ marginTop: 16, padding: "12px 16px", background: "var(--ant-color-fill-secondary)", borderRadius: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          • Нажмите «Сканировать» для получения списка проектов из GitLab. Новые проекты будут добавлены, существующие — пропущены.
          <br />• Токены хранятся в зашифрованном виде (AES-256-GCM).
          <br />• Проекты создаются без токена и используют персональный токен для сбора данных.
        </Text>
      </div>

      <Modal title="Добавить персональный токен" open={modalOpen}
        onCancel={() => setModalOpen(false)} onOk={handleCreate}
        confirmLoading={submitting} okText="Добавить" cancelText="Отмена" destroyOnClose>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="base_url" label="Base URL" rules={[{ required: true }]}>
            <Input placeholder="https://gitlab.com/api/v4" autoComplete="off" />
          </Form.Item>
          <Form.Item name="token" label="Токен" rules={[{ required: true }]}>
            <Input.Password placeholder="glpat-..." autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="label" label="Метка">
            <Input placeholder="Основной GitLab" autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
