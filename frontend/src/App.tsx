import { useState, useEffect } from "react";
import { ConfigProvider, Layout, Menu, Button, theme, Typography } from "antd";
import { ApartmentOutlined, ThunderboltOutlined, TeamOutlined, SettingOutlined, LogoutOutlined, BranchesOutlined, DashboardOutlined } from "@ant-design/icons";
import { LoginPage } from "./components/LoginPage";
import { Dashboard } from "./pages/Dashboard";
import { AdminPanel } from "./components/AdminPanel";
import { ContributorDashboard } from "./components/contributors/ContributorDashboard";
import { StackDashboard } from "./components/stack/StackDashboard";
import { ActivityDashboard } from "./components/activity/ActivityDashboard";
import { BranchDashboard } from "./components/branches/BranchDashboard";
import { UserManagement } from "./components/UserManagement";
import { SettingsPanel } from "./components/SettingsPanel";
import { getMe, clearToken } from "./api/client";
import type { User } from "./types";

const { Header, Content } = Layout;

function Logo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Git branch icon */}
      <circle cx="12" cy="12" r="4" fill="#fff" opacity="0.9"/>
      <circle cx="12" cy="26" r="4" fill="#fff" opacity="0.9"/>
      <circle cx="24" cy="19" r="4" fill="#fff" opacity="0.9"/>
      <path d="M12 16v6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8"/>
      <path d="M12 12c0-4 6-6 12-4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.8"/>
      {/* Magnifying glass */}
      <circle cx="26" cy="26" r="6" stroke="#fff" strokeWidth="2" fill="none" opacity="0.85"/>
      <line x1="30.5" y1="30.5" x2="34" y2="34" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.85"/>
    </svg>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"dashboard" | "stack" | "activity" | "contributors" | "branches" | "settings">("dashboard");
  const [selectedContributor, setSelectedContributor] = useState<string | undefined>();

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
    { key: "dashboard", icon: <DashboardOutlined />, label: "Обзор" },
    { key: "contributors", icon: <TeamOutlined />, label: "Контрибьюторы" },
    { key: "activity", icon: <ThunderboltOutlined />, label: "Активность" },
    { key: "branches", icon: <BranchesOutlined />, label: "Ветки" },
    { key: "stack", icon: <ApartmentOutlined />, label: "Языки" },
    ...(user.role === "admin" ? [
      { key: "settings", icon: <SettingOutlined />, label: "Настройки" },
    ] : []),
  ];

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <Layout style={{ minHeight: "100vh" }}>
        <Header style={{ display: "flex", alignItems: "center", padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 32 }}>
            <Logo />
            <span style={{ color: "#fff", fontWeight: "bold", fontSize: 22, letterSpacing: 0.5 }}>GitLab Scout</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginLeft: 4 }}>v1.2.0</span>
          </div>
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
          {tab === "dashboard" && <Dashboard onContributorClick={(name) => { setSelectedContributor(name); setTab("contributors"); }} />}
          {tab === "stack" && <StackDashboard userRole={user.role} />}
          {tab === "activity" && <ActivityDashboard userRole={user.role} onContributorClick={(name) => { setSelectedContributor(name); }} selectedContributor={selectedContributor} />}
          {tab === "branches" && <BranchDashboard userRole={user.role} onContributorClick={(name) => setSelectedContributor(name)} selectedContributor={selectedContributor} />}
          {tab === "contributors" && <ContributorDashboard userRole={user.role} onContributorClick={(name) => setSelectedContributor(name)} selectedContributor={selectedContributor} />}
          {tab === "settings" && user.role === "admin" && <SettingsPanel />}
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
