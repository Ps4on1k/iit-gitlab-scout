import { Card, Typography, Collapse, Statistic, Row, Col, Alert } from "antd";
import type { ProjectStats } from "../types";
import { ContributorTable } from "./ContributorTable";
import { StackPanel } from "./StackPanel";

const { Text } = Typography;

interface Props {
  data: ProjectStats;
}

export function ProjectCard({ data }: Props) {
  return (
    <Card
      title={<span>{data.label} <Text type="secondary" code style={{ fontSize: 12 }}>{data.project}</Text></span>}
      style={{ marginBottom: 16 }}
    >
      {data.error ? (
        <Alert message={data.error} type="error" showIcon />
      ) : (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Statistic title="Контрибьюторы" value={data.contributors.length} />
            </Col>
            <Col span={8}>
              <Statistic title="Зависимости" value={data.stack.total_dependencies} />
            </Col>
            <Col span={8}>
              <Statistic title="Язык" value={data.stack.language || "—"} />
            </Col>
          </Row>
          <Collapse items={[
            { key: "contributors", label: `Контрибьюторы (${data.contributors.length})`, children: <ContributorTable data={data.contributors} /> },
            { key: "stack", label: "Технологический стек", children: <StackPanel data={data.stack} /> },
          ]} />
        </>
      )}
    </Card>
  );
}
