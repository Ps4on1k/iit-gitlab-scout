import { useState, useEffect } from "react";
import { Modal, Button, Spin, Typography, Descriptions, Tag, Table, Empty, Space, Input, message } from "antd";
import { FilePdfOutlined, FileMarkdownOutlined, DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { fetchExecutiveReport, type ExecutiveReportData } from "../../api/client";
import { downloadPdf, downloadMarkdown } from "./ExecutiveReportGenerator";
import type { GlobalFilters } from "../GlobalFilterBar";
import dayjs from "dayjs";

const { Text, Title } = Typography;

interface Props {
  open: boolean;
  onClose: () => void;
  filters: GlobalFilters;
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  if (seconds < 60) return `${seconds}с`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}мин`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}ч ${m}мин`;
}

function formatMttr(minutes: number): string {
  if (minutes === 0) return "—";
  if (minutes < 60) return `${Math.round(minutes)}мин`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}ч ${m}мин`;
}

function rateColor(rate: number): string {
  if (rate >= 90) return "#21B573";
  if (rate >= 70) return "#3A8DFF";
  if (rate >= 50) return "#FFB020";
  return "#E5484D";
}

export function ReportPreview({ open, onClose, filters }: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ExecutiveReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportTitle, setReportTitle] = useState("Отчёт по проекту");

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.projectIds.length > 0) params.set("project_ids", filters.projectIds.join(","));
      if (filters.tags.length > 0) params.set("tags", filters.tags.join(","));
      if (filters.dateFrom) params.set("date_from", filters.dateFrom);
      if (filters.dateTo) params.set("date_to", filters.dateTo);
      if (filters.contributors.length > 0) params.set("contributors", filters.contributors.join(","));
      params.set("title", reportTitle);

      const res = await fetchExecutiveReport(params.toString());
      if (res.ok) {
        setData(res.data!);
      } else {
        setError(res.error || "Не удалось загрузить данные отчёта");
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const handleDownloadPdf = () => {
    if (!data) return;
    downloadPdf(data);
    message.success("PDF отчёт скачан");
  };

  const handleDownloadMd = () => {
    if (!data) return;
    downloadMarkdown(data);
    message.success("Markdown отчёт скачан");
  };

  const contributorColumns = [
    { title: "Имя", dataIndex: "name", key: "name", width: 200 },
    { title: "Коммиты", dataIndex: "commits", key: "commits", width: 80, align: "right" as const },
    { title: "Изменения", dataIndex: "changes", key: "changes", width: 100, align: "right" as const, render: (v: number) => v.toLocaleString() },
    { title: "Последняя активность", dataIndex: "lastCommit", key: "lastCommit", width: 120, render: (v: string) => dayjs(v).format("DD.MM.YYYY") },
  ];

  const projectColumns = [
    { title: "Проект", dataIndex: "label", key: "label", width: 200 },
    { title: "Теги", dataIndex: "tags", key: "tags", width: 150, render: (v: string[]) => v?.map((t: string) => <Tag key={t}>{t}</Tag>) || "—" },
    { title: "Коммиты", dataIndex: "commits", key: "commits", width: 80, align: "right" as const },
    { title: "Участники", dataIndex: "contributors", key: "contributors", width: 100, align: "right" as const },
    { title: "Последний коммит", dataIndex: "lastCommit", key: "lastCommit", width: 120, render: (v: string) => dayjs(v).format("DD.MM.YYYY") },
  ];

  return (
    <Modal
      title={
        <Space>
          <FilePdfOutlined />
          <span>Исполнительный отчёт</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      width={900}
      footer={
        <Space>
          <Button onClick={onClose}>Закрыть</Button>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>Обновить</Button>
          <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownloadPdf} disabled={!data}>
            Скачать PDF
          </Button>
          <Button icon={<FileMarkdownOutlined />} onClick={handleDownloadMd} disabled={!data}>
            Скачать MD
          </Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 4 }}>Заголовок отчёта</Text>
        <Input
          value={reportTitle}
          onChange={(e) => setReportTitle(e.target.value)}
          onPressEnter={() => loadData()}
          placeholder="Введите заголовок отчёта"
          style={{ marginBottom: 8 }}
        />
        <Button type="primary" size="small" onClick={loadData} loading={loading} disabled={!reportTitle.trim()}>
          Сформировать отчёт
        </Button>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16, color: "#8c8c8c" }}>Формирование данных отчёта...</div>
        </div>
      )}

      {error && (
        <Empty description={error} />
      )}

      {data && !loading && (
        <div>
          <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Период">
              {dayjs(data.meta.dateFrom).format("DD.MM.YYYY")} — {dayjs(data.meta.dateTo).format("DD.MM.YYYY")} ({data.meta.periodDays} дн.)
            </Descriptions.Item>
            <Descriptions.Item label="Сформирован">
              {dayjs(data.meta.generatedAt).format("DD.MM.YYYY HH:mm")}
            </Descriptions.Item>
          </Descriptions>

          {data.meta.filters.tags.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Активные фильтры: </Text>
              {data.meta.filters.tags.map((t: string) => <Tag key={t} color="blue">{t}</Tag>)}
              {data.meta.filters.contributors.length > 0 && (
                <Text type="secondary" style={{ fontSize: 12 }}> | {data.meta.filters.contributors.length} участников</Text>
              )}
            </div>
          )}

          <Title level={5}>1. Общая сводка</Title>
          <Descriptions bordered size="small" column={4} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Проекты">{data.summary.projects}</Descriptions.Item>
            <Descriptions.Item label="Активные">{data.summary.activeProjects}</Descriptions.Item>
            <Descriptions.Item label="Участники">{data.summary.contributors}</Descriptions.Item>
            <Descriptions.Item label="Коммиты">{data.summary.totalCommits.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="Активных дней">{data.summary.activeDays}</Descriptions.Item>
            <Descriptions.Item label="Среднее/день">{data.summary.avgCommitsPerDay}</Descriptions.Item>
          </Descriptions>

          <Title level={5}>2. Здоровье проекта</Title>
          <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Здоровье веток">
              <span style={{ color: rateColor(data.health.branchHealth), fontWeight: 600 }}>{data.health.branchHealth}%</span>
            </Descriptions.Item>
            <Descriptions.Item label="Успешность пайплайнов">
              <span style={{ color: rateColor(data.health.pipelineSuccessRate), fontWeight: 600 }}>{data.health.pipelineSuccessRate}%</span>
            </Descriptions.Item>
            <Descriptions.Item label="Сливание MR">
              <span style={{ color: rateColor(data.health.mergeRate), fontWeight: 600 }}>{data.health.mergeRate}%</span>
            </Descriptions.Item>
            <Descriptions.Item label="Частота деплоев">{data.health.deployFrequency}/день</Descriptions.Item>
            <Descriptions.Item label="Доля ошибок">
              <span style={{ color: data.health.failureRate <= 5 ? "#21B573" : data.health.failureRate <= 15 ? "#FFB020" : "#E5484D", fontWeight: 600 }}>
                {data.health.failureRate}%
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Время доставки">{formatDuration(data.health.avgLeadTimeSec)}</Descriptions.Item>
            <Descriptions.Item label="Время восстановления">{formatMttr(data.health.avgMttrMin)}</Descriptions.Item>
            <Descriptions.Item label="Устаревшие ветки">
              <span style={{ color: data.health.staleBranches > 10 ? "#E5484D" : undefined }}>{data.health.staleBranches}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Среднее пайплайна">{formatDuration(data.health.avgPipelineDuration)}</Descriptions.Item>
          </Descriptions>

          {data.contributors.length > 0 && (
            <>
              <Title level={5}>3. Производительность команды</Title>
              <Table
                dataSource={data.contributors}
                columns={contributorColumns}
                size="small"
                pagination={false}
                rowKey="email"
                style={{ marginBottom: 16 }}
              />
            </>
          )}

          {data.inactiveContributors.length > 0 && (
            <>
              <Title level={5} style={{ color: "#E5484D" }}>Неактивные участники</Title>
              <Table
                dataSource={data.inactiveContributors.slice(0, 10)}
                columns={[
                  { title: "Имя", dataIndex: "name", key: "name" },
                  { title: "Последний коммит", dataIndex: "lastCommit", key: "lastCommit", render: (v: string) => dayjs(v).format("DD.MM.YYYY") },
                ]}
                size="small"
                pagination={false}
                rowKey="email"
                style={{ marginBottom: 16 }}
              />
            </>
          )}

          {data.activity.peakWeek && (
            <>
              <Title level={5}>4. Обзор активности</Title>
              <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="Пиковая неделя">
                  {dayjs(data.activity.peakWeek.week).format("DD.MM.YYYY")} ({data.activity.peakWeek.commits} коммитов)
                </Descriptions.Item>
                <Descriptions.Item label="Активных дней">{data.summary.activeDays} / {data.meta.periodDays}</Descriptions.Item>
              </Descriptions>
            </>
          )}

          {data.activeProjects.length > 0 && (
            <>
              <Title level={5}>5. Разбивка по проектам</Title>
              <Table
                dataSource={data.activeProjects}
                columns={projectColumns}
                size="small"
                pagination={false}
                rowKey="id"
              />
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
