import { useState, useEffect } from "react";
import { ConfigProvider, Layout, Menu, Button, theme, Typography } from "antd";
import { ApartmentOutlined, ThunderboltOutlined, TeamOutlined, SettingOutlined, LogoutOutlined } from "@ant-design/icons";
import { LoginPage } from "./components/LoginPage";
import { AdminPanel } from "./components/AdminPanel";
import { ContributorDashboard } from "./components/contributors/ContributorDashboard";
import { StackDashboard } from "./components/stack/StackDashboard";
import { ActivityDashboard } from "./components/activity/ActivityDashboard";
import { UserManagement } from "./components/UserManagement";
import { SettingsPanel } from "./components/SettingsPanel";
import { getMe, clearToken } from "./api/client";
import type { User } from "./types";

const { Header, Content } = Layout;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"stack" | "activity" | "contributors" | "settings">("stack");

  useEffect(() => {
    getMe().then((res) => {
      if (res.ok) setUser(res.data!);
      setLoading(false);
    });
    setLoading(false);
  }, []);

  const handleLogout = () => {
    clearToken();
    setUser(null);
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}><Typography.Text>Загрузка...</Typography.Text></div>;
  if (!user) return <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}><LoginPage onLogin={setUser} /></ConfigProvider>;

  const menuItems = [
    { key: "stack", icon: <ApartmentOutlined />, label: "Языки" },
    { key: "activity", icon: <ThunderboltOutlined />, label: "Активность" },
    { key: "contributors", icon: <TeamOutlined />, label: "Контрибьюторы" },
    ...(user.role === "admin" ? [
      { key: "settings", icon: <SettingOutlined />, label: "Настройки" },
    ] : []),
  ];

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <Layout style={{ minHeight: "100vh" }}>
        <Header style={{ display: "flex", alignItems: "center", padding: "0 24px" }}>
          <div style={{ color: "#fff", fontWeight: "bold", fontSize: 18, marginRight: 32 }}>GitLab Scout</div>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[tab]}
            onClick={({ key }) => setTab(key as any)}
            items={menuItems}
            style={{ flex: 1 }}
          />
          <div style={{ color: "rgba(255,255,255,0.65)", marginRight: 16, fontSize: 14 }}>
            {user.username} ({user.role})
          </div>
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} style={{ color: "rgba(255,255,255,0.65)" }}>
            Выйти
          </Button>
        </Header>
        <Content style={{ padding: 24, background: "#f5f5f5" }}>
          {tab === "stack" && <StackDashboard />}
          {tab === "activity" && <ActivityDashboard />}
          {tab === "contributors" && <ContributorDashboard userRole={user.role} />}
          {tab === "settings" && user.role === "admin" && <SettingsPanel />}
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
