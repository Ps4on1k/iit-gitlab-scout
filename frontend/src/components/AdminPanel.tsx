import { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Input, Select, Space, Typography, Popconfirm, message, Tag, Collapse } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from "@ant-design/icons";
import { fetchProjects, createProject, updateProject, deleteProject, importProjectsYaml } from "../api/client";
import { getTagColor } from "../utils/tagColors";
import type { ProjectConfig } from "../types";

const { Text } = Typography;
const { TextArea } = Input;

export function AdminPanel() {
  const [projects, setProjects] = useState<ProjectConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [yamlModalOpen, setYamlModalOpen] = useState(false);
  const [yamlText, setYamlText] = useState("");
  const [yamlImporting, setYamlImporting] = useState(false);
  const [form] = Form.useForm();

  const allTagOptions = Array.from(new Set(projects.flatMap((p) => p.tags || []))).sort().map((t) => ({ value: t, label: t }));

  const load = async () => {
    setLoading(true);
    const res = await fetchProjects();
    if (res.ok) setProjects(res.data!);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (proj: ProjectConfig) => {
    setEditingId(proj.id);
    form.setFieldsValue({ path: proj.path, label: proj.label, tags: proj.tags || [], base_url: proj.base_url, description: proj.description });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (editingId) {
        const payload: any = { path: values.path, label: values.label, tags: values.tags || [], base_url: values.base_url, description: values.description || "" };
        if (values.token) payload.token = values.token;
        const res = await updateProject(editingId, payload);
        if (!res.ok) { message.error(res.error!); return; }
        message.success("Проект обновлён");
      } else {
        const res = await createProject({ ...values, tags: values.tags || [] });
        if (!res.ok) { message.error(res.error!); return; }
        message.success("Проект добавлен");
      }
      setModalOpen(false);
      load();
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    const res = await deleteProject(id);
    if (!res.ok) { message.error(res.error!); return; }
    message.success("Проект удалён");
    load();
  };

  const handleYamlImport = async () => {
    if (!yamlText.trim()) { message.warning("Вставьте YAML"); return; }
    setYamlImporting(true);
    try {
      const res = await importProjectsYaml(yamlText);
      if (res.ok) {
        message.success(`Импортировано: ${res.data!.imported.length} из ${res.data!.total}`);
        if (res.data!.errors.length > 0) res.data!.errors.forEach((e) => message.error(`${e.path}: ${e.error}`));
        setYamlModalOpen(false); setYamlText(""); load();
      } else { message.error(res.error!); }
    } finally { setYamlImporting(false); }
  };

  const columns = [
    {
      title: "Проект",
      key: "project",
      render: (_: any, record: ProjectConfig) => (
        <div>
          <Text code>{record.path}</Text>
          <div style={{ marginTop: 4 }}>
            {record.tags && record.tags.map((t: string) => {
              const c = getTagColor(t);
              return <Tag key={t} style={{ background: c.bg, color: c.text, border: "none", fontSize: 11 }}>{t}</Tag>;
            })}
          </div>
        </div>
      ),
    },
    { title: "Label", dataIndex: "label", key: "label" },
    { title: "Base URL", dataIndex: "base_url", key: "base_url", render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    {
      title: "Действия", key: "actions", width: 120, align: "right" as const,
      render: (_: any, record: ProjectConfig) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="Удалить проект?" onConfirm={() => handleDelete(record.id)} okText="Да" cancelText="Нет">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Управление проектами</Typography.Title>
        <Space>
          <Button icon={<UploadOutlined />} onClick={() => setYamlModalOpen(true)}>Импорт YAML</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить проект</Button>
        </Space>
      </div>

      <Collapse defaultActiveKey={["projects"]} items={[{
        key: "projects",
        label: <span style={{ fontSize: 14 }}>Проекты ({projects.length})</span>,
        children: <Table columns={columns} dataSource={projects} rowKey="id" loading={loading} pagination={false} />,
      }]} />

      <Modal title={editingId ? "Редактировать проект" : "Добавить проект"} open={modalOpen}
        onCancel={() => setModalOpen(false)} onOk={handleSubmit} confirmLoading={submitting}
        okText={editingId ? "Сохранить" : "Добавить"} cancelText="Отмена" destroyOnClose>
        <Form form={form} layout="vertical" preserve={false} autoComplete="off">
          <Form.Item name="path" label="Path проекта" rules={[{ required: true }]}>
            <Input placeholder="gitlab-org/gitlab-runner" autoComplete="off" />
          </Form.Item>
          <Form.Item name="label" label="Название" rules={[{ required: true }]}>
            <Input placeholder="GitLab Runner" autoComplete="off" />
          </Form.Item>
          <Form.Item name="tags" label="Теги" help="Выберите один или несколько тегов для проекта">
            <Select mode="multiple" placeholder="Выберите теги" options={allTagOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item name="token" label="GitLab Token" rules={editingId ? [] : [{ required: true }]}>
            <Input.Password placeholder={editingId ? "Оставьте пустым, чтобы не менять" : "glpat-..."} autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="base_url" label="Base URL">
            <Input placeholder="https://gitlab.com/api/v4" autoComplete="off" />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} placeholder="Описание проекта..." autoComplete="off" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Импорт проектов из YAML" open={yamlModalOpen}
        onCancel={() => setYamlModalOpen(false)} onOk={handleYamlImport}
        confirmLoading={yamlImporting} okText="Импортировать" cancelText="Отмена" width={600}>
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">
            Формат: projects: [{"\n"}  {"{"}path: owner/repo, label: Name, tags: [backend, frontend], token: glpat-...{"}"}{"\n"}]
          </Text>
        </div>
        <TextArea rows={12} value={yamlText} onChange={(e) => setYamlText(e.target.value)}
          placeholder={"projects:\n  - path: owner/repo\n    label: My Project\n    tags: [backend]\n    token: glpat-...\n    base_url: https://gitlab.com/api/v4"}
          style={{ fontFamily: "monospace", fontSize: 12 }} />
      </Modal>
    </div>
  );
}
