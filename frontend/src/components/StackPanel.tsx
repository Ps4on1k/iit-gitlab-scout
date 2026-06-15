import type { StackInfo } from "../types";
import { Typography, Tag, Empty } from "antd";

const { Text, Title } = Typography;

interface Props {
  data: StackInfo;
}

export function StackPanel({ data }: Props) {
  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <Text strong>Язык: </Text>
        {data.language ? <Tag color="blue">{data.language}</Tag> : <Text type="secondary">не определён</Text>}
        <Text strong style={{ marginLeft: 16 }}>Зависимостей: </Text>
        <Tag>{data.total_dependencies}</Tag>
      </div>
      {data.dependency_files.length === 0 ? (
        <Empty description="Зависимости не найдены" />
      ) : (
        data.dependency_files.map((file) => (
          <div key={file.file_path} style={{ marginBottom: 12 }}>
            <Text code>{file.file_path}</Text> <Tag>{file.file_type}</Tag>
            <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
              {file.dependencies.map((dep) => (
                <Tag key={dep.name} style={{ margin: 0 }}>
                  {dep.name} <Text type="secondary">{dep.version}</Text>
                </Tag>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
