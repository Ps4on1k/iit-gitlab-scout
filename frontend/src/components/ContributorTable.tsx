import type { ContributorStats } from "../types";
import { Table, Typography, Empty } from "antd";

const { Text } = Typography;

interface Props {
  data: ContributorStats[];
}

export function ContributorTable({ data }: Props) {
  if (data.length === 0) return <Empty description="Нет данных" />;

  const columns = [
    {
      title: "Автор",
      key: "author",
      render: (_: any, r: ContributorStats) => (
        <div>
          <div>{r.author_name}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.author_email}</Text>
        </div>
      ),
    },
    { title: "Коммиты", dataIndex: "total_commits", key: "total_commits", width: 100, sorter: (a: ContributorStats, b: ContributorStats) => a.total_commits - b.total_commits, defaultSortOrder: "descend" as const },
    {
      title: "Первый",
      dataIndex: "first_commit_date",
      key: "first",
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: "Последний",
      dataIndex: "last_commit_date",
      key: "last",
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={data}
      rowKey="author_name"
      size="small"
      pagination={false}
    />
  );
}
