import { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Input, Select, Space, Typography, Popconfirm, message, Tag, Collapse, Switch } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined } from "@ant-design/icons";
import { fetchUsers, createUser, updateUser, changeUserPassword, deleteUser } from "../api/client";
import type { AppUser } from "../types";

const { Text } = Typography;

export function UserManagement() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createForm] = Form.useForm();
  const [passwordForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const res = await fetchUsers();
    if (res.ok) setUsers(res.data!);
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
      render: (_: any, record: AppUser) => (
        <Select
          value={record.role}
          onChange={(v) => handleRoleChange(record.id, v)}
          size="small"
          style={{ width: 100 }}
          options={[
            { value: "admin", label: "Admin" },
            { value: "user", label: "User" },
          ]}
        />
      ),
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

            {/* Create User Modal */}
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
                  <Select options={[{ value: "admin", label: "Admin" }, { value: "user", label: "User" }]} />
                </Form.Item>
              </Form>
            </Modal>

            {/* Change Password Modal */}
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
