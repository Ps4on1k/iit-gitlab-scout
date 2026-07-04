import { useState, useEffect } from "react";
import { Form, Input, Button, Typography, Alert } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { login as apiLogin, setToken } from "../api/client";
import type { User } from "../types";

const { Title, Text } = Typography;

function getIsDark(): boolean {
  try {
    const stored = localStorage.getItem("darkMode");
    if (stored !== null) return stored === "true";
  } catch {}
  return true;
}

interface Props {
  onLogin: (user: User) => void;
}

export function LoginPage({ onLogin }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(getIsDark);

  useEffect(() => {
    const interval = setInterval(() => setIsDark(getIsDark()), 500);
    return () => clearInterval(interval);
  }, []);

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

  const bg = isDark ? "#0f172a" : "#f0f2f5";
  const cardBg = isDark ? "#1e293b" : "#ffffff";
  const borderColor = isDark ? "#334155" : "#e5e7eb";
  const headerColor = isDark ? "#f1f5f9" : "#111315";
  const subColor = isDark ? "rgba(241,245,249,0.6)" : "rgba(17,19,21,0.5)";

  return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh",
      background: bg, position: "relative", overflow: "hidden",
    }}>
      {/* Watermark */}
      <div style={{ position: "absolute", top: -540, left: -720, width: 1440, height: 1440, overflow: "hidden", pointerEvents: "none" }}>
        <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}>
          <path d="M60 8.18164V111.818" stroke={isDark ? "rgba(174,183,200,0.06)" : "rgba(17,19,21,0.03)"} strokeWidth="13.63" />
          <path d="M105 34.0908L15 85.909" stroke={isDark ? "rgba(174,183,200,0.06)" : "rgba(17,19,21,0.03)"} strokeWidth="13.63" />
          <path d="M15 34.0908L105 85.909" stroke={isDark ? "rgba(174,183,200,0.06)" : "rgba(17,19,21,0.03)"} strokeWidth="13.63" />
        </svg>
      </div>

      <div style={{
        width: 420, padding: 40,
        background: cardBg, borderRadius: 16,
        border: `1px solid ${borderColor}`,
        boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 8px 32px rgba(0,0,0,0.08)",
        position: "relative", zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
          <img src="/logo.svg" alt="GitLab Scout" style={{ width: 48, height: 48, marginBottom: 12 }} />
          <Title level={2} style={{ margin: 0, color: headerColor, fontWeight: 700, letterSpacing: 0.5 }}>GitLab Scout</Title>
          <Text style={{ color: subColor, fontSize: 13, marginTop: 4 }}>Аналитика GitLab проектов</Text>
        </div>

        {/* Form */}
        <Form onFinish={handleSubmit} layout="vertical" size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: "Введите логин" }]}>
            <Input prefix={<UserOutlined style={{ color: isDark ? "rgba(241,245,249,0.4)" : undefined }} />}
              placeholder="Username" autoComplete="username"
              style={{ background: isDark ? "#0f172a" : undefined, borderColor: isDark ? "#334155" : undefined, color: isDark ? "#f1f5f9" : undefined }} />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: "Введите пароль" }]}>
            <Input.Password prefix={<LockOutlined style={{ color: isDark ? "rgba(241,245,249,0.4)" : undefined }} />}
              placeholder="Password" autoComplete="current-password"
              style={{ background: isDark ? "#0f172a" : undefined, borderColor: isDark ? "#334155" : undefined, color: isDark ? "#f1f5f9" : undefined }} />
          </Form.Item>
          {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block
              style={{ height: 44, fontWeight: 600, borderRadius: 8 }}>
              Войти
            </Button>
          </Form.Item>
        </Form>
      </div>

      {/* Footer */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "20px 16px", zIndex: 1,
      }}>
        <a href="https://inn-it.pro/" target="_blank" rel="noopener noreferrer">
          <img src="/asterics_color.svg" alt="Инновация ИТ" style={{ height: 48, opacity: 0.6, transition: "opacity 0.15s" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")} />
        </a>
        <span style={{ fontSize: 11, color: isDark ? "rgba(241,245,249,0.3)" : "rgba(17,19,21,0.3)", marginTop: 6 }}>
          &copy; {new Date().getFullYear()} Инновация ИТ
        </span>
      </div>
    </div>
  );
}
