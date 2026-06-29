import { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Input, Select, Space, Typography, Popconfirm, message, Tag, Collapse, Switch, Tooltip } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { fetchUsers, createUser, updateUser, changeUserPassword, deleteUser, fetchProjects } from "../api/client";
import type { AppUser, ProjectConfig, Role } from "../types";

const { Text } = Typography;

const ROLE_PERMISSIONS: Record<Role, { label: string; color: string; permissions: string[] }> = {
  admin: {
    label: "Admin",
    color: "#E5484D",
    permissions: [
      "Полный доступ ко всем данным",
      "Управление проектами и пользователями",
      "Сбор данных (кнопки «Собрать»)",
      "Настройки и справочник контрибьюторов",
      "Видит все теги проектов",
    ],
  },
  manager: {
    label: "Manager",
    color: "#FFB020",
    permissions: [
      "Просмотр статистики (все вкладки)",
      "Фильтрация и поиск",
      "Детальная таблица контрибьюторов",
      "Нет доступа к сбору данных",
      "Нет доступа к настройкам",
      "Ограничение по тегам (если настроены)",
    ],
  },
  user: {
    label: "User",
    color: "#3A8DFF",
    permissions: [
      "Просмотр статистики (все вкладки)",
      "Фильтрация и поиск",
      "Нет доступа к сбору данных",
      "Нет доступа к настройкам",
      "Нет доступа к детальной таблице",
      "Ограничение по тегам (если настроены)",
    ],
  },
};

export function UserManagement() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const allTags = [...new Set(projects.flatMap((p) => p.tags || []))].sort();

  const load = async () => {
    setLoading(true);
    const [usersRes, projsRes] = await Promise.all([fetchUsers(), fetchProjects()]);
    if (usersRes.ok) setUsers(usersRes.data!);
    if (projsRes.ok) setProjects(projsRes.data!);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const values = await createForm.validateFields();
    setSubmitting(true);
    try {
      const res = await createUser(values);
      if (!res.ok) { message.error(res.error!); return; }
      message.success("Пользователь создан");
      setCreateModalOpen(false);
      createForm.resetFields();
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (id: number, role: string) => {
    const res = await updateUser(id, { role });
    if (!res.ok) { message.error(res.error!); return; }
    message.success("Роль обновлена");
    load();
  };

  const handleToggleActive = async (id: number, isActive: boolean) => {
    const res = await updateUser(id, { is_active: isActive });
    if (!res.ok) { message.error(res.error!); return; }
    message.success(isActive ? "Учётка активирована" : "Учётка заблокирована");
    load();
  };

  const openEditModal = (user: AppUser) => {
    setSelectedUserId(user.id);
    editForm.setFieldsValue({ role: user.role, allowed_tags: user.allowed_tags || [] });
    setEditModalOpen(true);
  };

  const handleEditUser = async () => {
    if (!selectedUserId) return;
    const values = await editForm.validateFields();
    setSubmitting(true);
    try {
      const res = await updateUser(selectedUserId, { role: values.role, allowed_tags: values.allowed_tags || [] });
      if (!res.ok) { message.error(res.error!); return; }
      message.success("Пользователь обновлён");
      setEditModalOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const openPasswordModal = (id: number) => {
    setSelectedUserId(id);
    passwordForm.resetFields();
    setPasswordModalOpen(true);
  };

  const handleChangePassword = async () => {
    const values = await passwordForm.validateFields();
    if (!selectedUserId) return;
    setSubmitting(true);
    try {
      const res = await changeUserPassword(selectedUserId, values.password);
      if (!res.ok) { message.error(res.error!); return; }
      message.success("Пароль обновлён");
      setPasswordModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await deleteUser(id);
    if (!res.ok) { message.error(res.error!); return; }
    message.success("Пользователь удалён");
    load();
  };

  const columns = [
    {
      title: "Пользователь",
      key: "username",
      render: (_: any, record: AppUser) => (
        <div>
          <Text strong>{record.username}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>ID: {record.id}</Text>
        </div>
      ),
    },
    {
      title: "Роль",
      key: "role",
      width: 200,
      render: (_: any, record: AppUser) => {
        const rp = ROLE_PERMISSIONS[record.role] || ROLE_PERMISSIONS.user;
        return (
          <Space size={4}>
            <Select
              value={record.role}
              onChange={(v) => handleRoleChange(record.id, v)}
              size="small"
              style={{ width: 100 }}
              options={[
                { value: "admin", label: "Admin" },
                { value: "manager", label: "Manager" },
                { value: "user", label: "User" },
              ]}
            />
            <Tooltip
              title={
                <div style={{ maxWidth: 280 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: rp.color }}>{rp.label}</div>
                  {rp.permissions.map((p, i) => <div key={i} style={{ fontSize: 12, marginBottom: 2 }}>• {p}</div>)}
                </div>
              }
              placement="right"
            >
              <InfoCircleOutlined style={{ color: rp.color, cursor: "pointer" }} />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: "Теги",
      key: "tags",
      render: (_: any, record: AppUser) => {
        if (record.role === "admin") return <Text type="secondary" style={{ fontSize: 12 }}>Все теги</Text>;
        const tags = record.allowed_tags || [];
        if (tags.length === 0) return <Text type="secondary" style={{ fontSize: 12 }}>Все теги</Text>;
        return (
          <Space size={2} wrap>
            {tags.map((t: string) => <Tag key={t} style={{ fontSize: 11 }}>{t}</Tag>)}
          </Space>
        );
      },
    },
    {
      title: "Статус",
      key: "is_active",
      render: (_: any, record: AppUser) => (
        <Switch
          checked={record.is_active}
          onChange={(v) => handleToggleActive(record.id, v)}
          checkedChildren="Активен"
          unCheckedChildren="Заблокирован"
        />
      ),
    },
    {
      title: "Действия",
      key: "actions",
      render: (_: any, record: AppUser) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
            Настроить
          </Button>
          <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => openPasswordModal(record.id)}>
            Пароль
          </Button>
          <Popconfirm title="Удалить пользователя?" onConfirm={() => handleDelete(record.id)} okText="Да" cancelText="Нет">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Collapse
      defaultActiveKey={["users"]}
      items={[{
        key: "users",
        label: <span style={{ fontSize: 14 }}>Пользователи ({users.length})</span>,
        extra: (
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={(e) => { e.stopPropagation(); setCreateModalOpen(true); }}>
            Добавить
          </Button>
        ),
        children: (
          <>
            <Table
              columns={columns}
              dataSource={users}
              rowKey="id"
              loading={loading}
              pagination={false}
              size="small"
            />

            <Modal
              title="Создать пользователя"
              open={createModalOpen}
              onCancel={() => setCreateModalOpen(false)}
              onOk={handleCreate}
              confirmLoading={submitting}
              okText="Создать"
              cancelText="Отмена"
              destroyOnClose
            >
              <Form form={createForm} layout="vertical" preserve={false}>
                <Form.Item name="username" label="Имя пользователя" rules={[{ required: true }]}>
                  <Input placeholder="username" />
                </Form.Item>
                <Form.Item name="password" label="Пароль" rules={[{ required: true }, { min: 4, message: "Минимум 4 символа" }]}>
                  <Input.Password placeholder="password" />
                </Form.Item>
                <Form.Item name="role" label="Роль" initialValue="user">
                  <Select
                    options={Object.entries(ROLE_PERMISSIONS).map(([value, rp]) => ({
                      value,
                      label: <Space>{rp.label}<InfoCircleOutlined style={{ color: rp.color, fontSize: 11 }} /></Space>,
                    }))}
                  />
                </Form.Item>
              </Form>
            </Modal>

            <Modal
              title="Настроить пользователя"
              open={editModalOpen}
              onCancel={() => setEditModalOpen(false)}
              onOk={handleEditUser}
              confirmLoading={submitting}
              okText="Сохранить"
              cancelText="Отмена"
              destroyOnClose
              width={520}
            >
              <Form form={editForm} layout="vertical" preserve={false}>
                <Form.Item name="role" label="Роль">
                  <Select
                    options={Object.entries(ROLE_PERMISSIONS).map(([value, rp]) => ({
                      value,
                      label: <Space>{rp.label}<InfoCircleOutlined style={{ color: rp.color, fontSize: 11 }} /></Space>,
                    }))}
                  />
                </Form.Item>
                <Form.Item
                  name="allowed_tags"
                  label="Разрешённые теги"
                  extra={<Text type="secondary" style={{ fontSize: 12 }}>Если теги не указаны — пользователь видит все проекты. Укажите теги для ограничения видимости.</Text>}
                >
                  <Select
                    mode="multiple"
                    placeholder="Все теги (без ограничений)"
                    allowClear
                    options={allTags.map((t) => ({ value: t, label: t }))}
                    maxTagCount="responsive"
                  />
                </Form.Item>
              </Form>
            </Modal>

            <Modal
              title="Сменить пароль"
              open={passwordModalOpen}
              onCancel={() => setPasswordModalOpen(false)}
              onOk={handleChangePassword}
              confirmLoading={submitting}
              okText="Сохранить"
              cancelText="Отмена"
              destroyOnClose
            >
              <Form form={passwordForm} layout="vertical" preserve={false}>
                <Form.Item name="password" label="Новый пароль" rules={[{ required: true }, { min: 4, message: "Минимум 4 символа" }]}>
                  <Input.Password placeholder="Новый пароль" />
                </Form.Item>
              </Form>
            </Modal>
          </>
        ),
      }]}
    />
  );
}
