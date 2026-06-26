import { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Input, Space, Typography, Popconfirm, message, Tag, Collapse, Upload } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined } from "@ant-design/icons";
import { fetchContributorDirectory, createContributorDirectoryEntry, updateContributorDirectoryEntry, deleteContributorDirectoryEntry, importContributorDirectory, exportContributorDirectory } from "../../api/client";

const { Text } = Typography;
const { TextArea } = Input;

export function ContributorDirectoryPanel() {
  const [entries, setEntries] = useState<{ id: number; display_name: string; emails: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [yamlModalOpen, setYamlModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportYaml, setExportYaml] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [yamlText, setYamlText] = useState("");
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const res = await fetchContributorDirectory();
    if (res.ok) setEntries(res.data!);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (entry: { id: number; display_name: string; emails: string[] }) => {
    setEditingId(entry.id);
    form.setFieldsValue({ display_name: entry.display_name, emails: entry.emails.join("\n") });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const emails = values.emails.split("\n").map((e: string) => e.trim()).filter(Boolean);
    setSubmitting(true);

    try {
      if (editingId) {
        const res = await updateContributorDirectoryEntry(editingId, { display_name: values.display_name, emails });
        if (!res.ok) { message.error(res.error!); return; }
        message.success("Запись обновлена");
      } else {
        const res = await createContributorDirectoryEntry({ display_name: values.display_name, emails });
        if (!res.ok) { message.error(res.error!); return; }
        message.success("Запись создана");
      }
      setModalOpen(false);
      load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    const res = await deleteContributorDirectoryEntry(id);
    if (!res.ok) { message.error(res.error!); return; }
    message.success("Запись удалена");
    load();
  };

  const handleYamlImport = async () => {
    if (!yamlText.trim()) { message.warning("Вставьте YAML"); return; }
    setSubmitting(true);
    try {
      const res = await importContributorDirectory(yamlText);
      if (res.ok) {
        message.success(`Импортировано: ${res.data!.imported.length} из ${res.data!.total}`);
        if (res.data!.errors.length > 0) {
          res.data!.errors.forEach((e) => message.error(`${e.display_name}: ${e.error}`));
        }
        setYamlModalOpen(false);
        setYamlText("");
        load();
      } else {
        message.error(res.error!);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { title: "Имя", dataIndex: "display_name", key: "name", render: (v: string) => <Text strong>{v}</Text> },
    { title: "Email", dataIndex: "emails", key: "emails",
      render: (emails: string[]) => (
        <Space direction="vertical" size={0}>
          {emails.map((e: string) => <Text key={e} type="secondary" style={{ fontSize: 12 }}>{e}</Text>)}
        </Space>
      )},
    { title: "Действия", key: "actions", width: 120, align: "right" as const,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm title="Удалить?" onConfirm={() => handleDelete(record.id)} okText="Да" cancelText="Нет">
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleExport = async () => {
    const res = await exportContributorDirectory();
    if (res.ok) {
      setExportYaml(res.data!.yaml);
      setExportModalOpen(true);
    } else {
      message.error(res.error!);
    }
  };

  const handleExportFlat = () => {
    const flat = entries.map((e) => ({ name: e.display_name, email: e.emails[0] || "" }));
    const yaml = "contributors:\n" + flat.map((f) => `  - name: "${f.name}"\n    email: "${f.email}"`).join("\n");
    const blob = new Blob(["\uFEFF" + yaml], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "contributors-flat.yaml"; a.click();
    URL.revokeObjectURL(url);
    message.success("Плоский список экспортирован");
  };

  const handleDownloadYaml = () => {
    const blob = new Blob([exportYaml], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contributors.yaml";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Справочник контрибьюторов</Typography.Title>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>Экспорт YAML</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExportFlat}>Плоский список</Button>
          <Button icon={<UploadOutlined />} onClick={() => setYamlModalOpen(true)}>Импорт YAML</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Добавить</Button>
        </Space>
      </div>

      <Collapse
        defaultActiveKey={["directory"]}
        items={[{
          key: "directory",
          label: <span style={{ fontSize: 14 }}>Записи ({entries.length})</span>,
          children: (
            <Table columns={columns} dataSource={entries} rowKey="id" loading={loading} pagination={false} />
          ),
        }]}
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingId ? "Редактировать запись" : "Добавить запись"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okText={editingId ? "Сохранить" : "Добавить"}
        cancelText="Отмена"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false} autoComplete="off">
          <Form.Item name="display_name" label="Имя (группировка)" rules={[{ required: true }]}>
            <Input placeholder="Иван Иванов" />
          </Form.Item>
          <Form.Item name="emails" label="Email'ы (по одному на строку)" rules={[{ required: true }]}>
            <TextArea rows={4} placeholder={"ivan@company.com\nivanov@gmail.com"} style={{ fontFamily: "monospace" }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* YAML Import Modal */}
      <Modal
        title="Импорт справочника из YAML"
        open={yamlModalOpen}
        onCancel={() => setYamlModalOpen(false)}
        onOk={handleYamlImport}
        confirmLoading={submitting}
        okText="Импортировать"
        cancelText="Отмена"
        width={600}
      >
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">
            Формат: contributors: [{"\n"}  {"{"}name: Имя, emails: [email1, email2]{"}"}{"\n"}]
          </Text>
        </div>
        <TextArea
          rows={12}
          value={yamlText}
          onChange={(e) => setYamlText(e.target.value)}
          placeholder={"contributors:\n  - name: Иван Иванов\n    emails:\n      - ivan@company.com\n      - ivanov@gmail.com"}
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </Modal>

      {/* Export YAML Modal */}
      <Modal
        title="Экспорт справочника в YAML"
        open={exportModalOpen}
        onCancel={() => setExportModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setExportModalOpen(false)}>Закрыть</Button>,
          <Button key="download" type="primary" icon={<DownloadOutlined />} onClick={handleDownloadYaml}>Скачать файл</Button>,
        ]}
        width={600}
      >
        <TextArea
          rows={14}
          value={exportYaml}
          readOnly
          style={{ fontFamily: "monospace", fontSize: 12 }}
        />
      </Modal>
    </div>
  );
}
