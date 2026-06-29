import { Card, Col, Row } from "antd";
import type { ContributorMetrics } from "../../types";

interface Props {
  data: ContributorMetrics | null;
  loading: boolean;
}

export function MetricsCards({ data, loading }: Props) {
  if (!data) return null;

  const cards = [
    { label: "Контрибуторов", value: data.unique_contributors },
    { label: "Всего коммитов", value: data.total_commits.toLocaleString() },
    { label: "Всего изменений", value: data.total_changes.toLocaleString() },
    { label: "Добавлено строк", value: `+${data.total_additions.toLocaleString()}` },
    { label: "Удалено строк", value: `-${data.total_deletions.toLocaleString()}` },
    { label: "Дней анализа", value: data.calendar_days },
  ];

  return (
    <Row gutter={[20, 20]} style={{ marginBottom: 30 }}>
      {cards.map((card) => (
        <Col key={card.label} xs={12} sm={8} md={4}>
          <div
            style={{
              background: "var(--ant-color-fill-secondary)",
              padding: 20,
              borderRadius: 15,
              textAlign: "center",
              boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
              transition: "transform 0.3s, box-shadow 0.3s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-5px)";
              e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)";
            }}
          >
            <div style={{ fontSize: 28, fontWeight: "bold", color: "#3A8DFF" }}>{card.value}</div>
            <div style={{ color: "var(--ant-color-text-secondary)", marginTop: 8, fontSize: 13 }}>{card.label}</div>
          </div>
        </Col>
      ))}
    </Row>
  );
}
