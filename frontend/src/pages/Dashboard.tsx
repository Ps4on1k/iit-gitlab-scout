import { useState } from "react";
import { Typography, Spin, Result, Descriptions } from "antd";
import { FilterBar } from "../components/FilterBar";
import { ProjectCard } from "../components/ProjectCard";
import { fetchBatchStats } from "../api/client";
import type { ProjectStats } from "../types";

const { Title, Text } = Typography;

export function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectStats[]>([]);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);

  const handleSearch = async (month: string, author: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetchBatchStats(month || undefined, author || undefined);
      if (!res.ok) {
        setError(res.error!);
      } else {
        setProjects(res.data!.projects);
        setAnalyzedAt(res.data!.analyzed_at);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "0 24px 24px" }}>
      <Title level={4}>Статистика проектов</Title>
      <Text type="secondary">Анализ всех проектов из базы данных</Text>

      <FilterBar onSearch={handleSearch} loading={loading} />

      {error && <Result status="error" title="Ошибка" subTitle={error} />}

      {loading && <div style={{ textAlign: "center", padding: 40 }}><Spin size="large" /></div>}

      {analyzedAt && !loading && (
        <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="Анализ завершён">{new Date(analyzedAt).toLocaleString()}</Descriptions.Item>
        </Descriptions>
      )}

      {!loading && projects.map((proj) => (
        <ProjectCard key={proj.project} data={proj} />
      ))}
    </div>
  );
}
