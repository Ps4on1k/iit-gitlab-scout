import { useState } from "react";
import { Form, Input, Button, Typography, Alert, Card } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { login as apiLogin, setToken } from "../api/client";
import type { User } from "../types";

const { Title } = Typography;

interface Props {
  onLogin: (user: User) => void;
}

export function LoginPage({ onLogin }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    setError(null);

    const res = await apiLogin(values.username, values.password);
    setLoading(false);

    if (!res.ok) {
      setError(res.error!);
    } else {
      setToken(res.data!.token);
      onLogin(res.data!.user);
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f0f2f5" }}>
      <Card style={{ width: 400 }}>
        <Title level={2} style={{ textAlign: "center" }}>GitLab Scout</Title>
        <Form onFinish={handleSubmit} layout="vertical" size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: "Введите логин" }]}>
            <Input prefix={<UserOutlined />} placeholder="Username" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "Введите пароль" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" autoComplete="current-password" />
          </Form.Item>
          {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Войти
            </Button>
          </Form.Item>
        </Form>
        <div style={{ fontSize: 12, color: "#999", textAlign: "center" }}>
          admin/admin — полный доступ<br />
          user/user — только просмотр
        </div>
      </Card>
    </div>
  );
}
