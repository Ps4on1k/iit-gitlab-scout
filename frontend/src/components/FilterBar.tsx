import { Form, DatePicker, Input, Button, Space } from "antd";
import { SearchOutlined } from "@ant-design/icons";

interface Props {
  onSearch: (month: string, author: string) => void;
  loading: boolean;
}

export function FilterBar({ onSearch, loading }: Props) {
  const [form] = Form.useForm();

  const handleFinish = (values: any) => {
    const month = values.month ? values.month.format("YYYY-MM") : "";
    onSearch(month, values.author || "");
  };

  return (
    <Form form={form} layout="inline" onFinish={handleFinish} style={{ marginBottom: 16 }}>
      <Form.Item name="month" label="Месяц">
        <DatePicker picker="month" style={{ width: 140 }} />
      </Form.Item>
      <Form.Item name="author" label="Автор">
        <Input placeholder="Имя автора" style={{ width: 180 }} />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>
          Анализировать
        </Button>
      </Form.Item>
    </Form>
  );
}
