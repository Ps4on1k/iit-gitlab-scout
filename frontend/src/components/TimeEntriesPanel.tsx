import { useState, useEffect } from "react";
import { Table, Button, Modal, Form, Input, InputNumber, DatePicker, Space, Typography, Popconfirm, message, Upload, Collapse, Card, Row, Col, Statistic } from "antd";
import { PlusOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { fetchTimeEntries, createTimeEntries, deleteTimeEntry, fetchTimeEntrySummary, fetchTimeEntryTemplate } from "../api/client";
import dayjs from "dayjs";

const { Text } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

export function TimeEntriesPanel() {
  const [entries, setEntries] = useState<any[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    const [entriesRes, summaryRes] = await Promise.all([fetchTimeEntries(), fetchTimeEntrySummary()]);
    if (entriesRes.ok) setEntries(entriesRes.data!);
    if (summaryRes.ok) setSummary(summaryRes.data!);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const values = await form.validateFields();
    const email = values.email;
    const hours = values.hours;
    const [from, to] = values.period || [];
    if (!from || !to) { message.error("Укажите период"); return; }

    const res = await createTimeEntries([{
      email,
      hours,
      period_from: from.format("YYYY-MM-DD"),
      period_to: to.format("YYYY-MM-DD"),
      note: values.note || "",
    }]);
    if (res.ok) {
      message.success(`Добавлено: ${res.data!.imported.length}`);
      if (res.data!.errors.length) res.data!.errors.forEach((e: any) => message.error(`${e.email}: ${e.error}`));
      setModalOpen(false);
      form.resetFields();
      load();
    } else {
      message.error(res.error!);
    }
  };

  const handleCsvImport = async () => {
    if (!csvText.trim()) { message.warning("Вставьте данные"); return; }
    setImporting(true);
    try {
      const lines = csvText.trim().split("\n");
      const header = lines[0].toLowerCase();
      const isHeader = header.includes("email") || header.includes("hours");
      const dataLines = isHeader ? lines.slice(1) : lines;

      const entries = dataLines.map((line) => {
        const parts = line.split(",").map((p: string) => p.trim());
        return { email: parts[0], hours: parseFloat(parts[1]), period_from: parts[2], period_to: parts[3], note: parts[4] || "" };
      }).filter((e) => e.email && e.hours && e.period_from && e.period_to);

      if (entries.length === 0) { message.error("Не найдены валидные записи"); return; }

      const res = await createTimeEntries(entries);
      if (res.ok) {
        message.success(`Импортировано: ${res.data!.imported.length} из ${res.data!.total}`);
        if (res.data!.errors.length) res.data!.errors.forEach((e: any) => message.error(`${e.email}: ${e.error}`));
        setCsvModalOpen(false);
        setCsvText("");
        load();
      } else {
        message.error(res.error!);
      }
    } finally { setImporting(false); }
  };

  const handleDownloadTemplate = async () => {
    const res = await fetchTimeEntryTemplate();
    if (res.ok) {
      const blob = new Blob(["\uFEFF" + res.data!.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "time-entries-template.csv"; a.click();
      URL.revokeObjectURL(url);
      message.success("Шаблон скачан");
    }
  };

  const columns = [
    { title: "Email", dataIndex: "contributor_email", key: "email", render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: "Часы", dataIndex: "hours", key: "hours", width: 80, render: (v: number) => <Text strong>{v}</Text> },
    { title: "С", dataIndex: "period_from", key: "period_from", width: 110, render: (v: string) => new Date(v).toLocaleDateString() },
    { title: "По", dataIndex: "period_to", key: "period_to", width: 110, render: (v: string) => new Date(v).toLocaleDateString() },
    { title: "Примечание", dataIndex: "note", key: "note", render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v || "—"}</Text> },
    { title: "", key: "actions", width: 50, render: (_: any, record: any) => (
      <Popconfirm title="Удалить?" onConfirm={async () => {
        const res = await deleteTimeEntry(record.id);
        if (res.ok) { message.success("Удалено"); load(); } else { message.error(res.error!); }
      }} okText="Да" cancelText="Нет">
        <Button type="link" size="small" danger icon={<DeleteOutlined />} />
      </Popconfirm>
    )},
  ];

  const totalHours = summary.reduce((s, r) => s + r.total_hours, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Учёт времени</Typography.Title>
          <Text type="secondary" style={{ fontSize: 12 }}>Загрузка списания времени по контрибьюторам за периоды</Text>
        </div>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>Шаблон CSV</Button>
          <Button icon={<UploadOutlined />} onClick={() => setCsvModalOpen(true)}>Загрузить CSV</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>Добавить</Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="Всего записей" value={entries.length} prefix={<ClockCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="Всего часов" value={totalHours} suffix="ч" /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="Контрибьюторов" value={summary.length} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="Периодов" value={new Set(entries.map((e) => `${e.period_from}-${e.period_to}`)).size} /></Card></Col>
      </Row>

      <Collapse defaultActiveKey={["entries"]} items={[{
        key: "entries",
        label: <span style={{ fontSize: 14 }}>Записи ({entries.length})</span>,
        children: <Table columns={columns} dataSource={entries} rowKey="id" loading={loading} pagination={{ pageSize: 20, showTotal: (t) => `Всего: ${t}` }} size="small" />,
      }]} />

      {summary.length > 0 && (
        <Collapse style={{ marginTop: 16 }} items={[{
          key: "summary",
          label: <span style={{ fontSize: 14 }}>Итого по контрибьюторам</span>,
          children: <Table
            dataSource={summary}
            rowKey="contributor_email"
            size="small"
            pagination={false}
            columns={[
              { title: "Email", dataIndex: "contributor_email", key: "email", render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
              { title: "Всего часов", dataIndex: "total_hours", key: "hours", render: (v: number) => <Text strong>{v}</Text> },
              { title: "Записей", dataIndex: "entries_count", key: "count" },
              { title: "Первый период", dataIndex: "first_period", key: "first", render: (v: string) => v ? new Date(v).toLocaleDateString() : "—" },
              { title: "Последний", dataIndex: "last_period", key: "last", render: (v: string) => v ? new Date(v).toLocaleDateString() : "—" },
            ]}
          />,
        }]} />
      )}

      <Modal title="Добавить запись" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleCreate} okText="Добавить" cancelText="Отмена" destroyOnClose>
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="email" label="Email контрибьютора" rules={[{ required: true }]}>
            <Input placeholder="ivan@company.com" />
          </Form.Item>
          <Form.Item name="hours" label="Часы" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.5} style={{ width: "100%" }} placeholder="160" />
          </Form.Item>
          <Form.Item name="period" label="Период" rules={[{ required: true }]}>
            <RangePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="note" label="Примечание">
            <Input placeholder="Основной проект" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="Загрузка CSV" open={csvModalOpen} onCancel={() => setCsvModalOpen(false)} onOk={handleCsvImport} confirmLoading={importing} okText="Импортировать" cancelText="Отмена" width={600}>
        <div style={{ marginBottom: 8 }}>
          <Space>
            <Button size="small" icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>Скачать шаблон</Button>
            <Text type="secondary" style={{ fontSize: 12 }}>Формат: email, hours, period_from, period_to, note</Text>
          </Space>
        </div>
        <TextArea rows={12} value={csvText} onChange={(e) => setCsvText(e.target.value)}
          placeholder={"ivan@company.com,160,2026-06-01,2026-06-30,Основной проект\npetrov@company.com,176,2026-06-01,2026-06-30,"}
          style={{ fontFamily: "monospace", fontSize: 12 }} />
      </Modal>
    </div>
  );
}
