import { useState, useEffect, useCallback } from "react";
import { ConfigProvider, Layout, Menu, Button, theme, Typography, Tabs } from "antd";
import { ApartmentOutlined, ThunderboltOutlined, TeamOutlined, SettingOutlined, LogoutOutlined, BranchesOutlined, DashboardOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { LoginPage } from "./components/LoginPage";
import { Dashboard } from "./pages/Dashboard";
import { ContributorDashboard } from "./components/contributors/ContributorDashboard";
import { StackDashboard } from "./components/stack/StackDashboard";
import { ActivityDashboard } from "./components/activity/ActivityDashboard";
import { BranchDashboard } from "./components/branches/BranchDashboard";
import { SettingsPanel } from "./components/SettingsPanel";
import { GlobalFilterBar, type GlobalFilters } from "./components/GlobalFilterBar";
import { getMe, clearToken } from "./api/client";
import type { User } from "./types";

const { Header, Content } = Layout;

function Logo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="4" fill="#fff" opacity="0.9"/>
      <circle cx="12" cy="26" r="4" fill="#fff" opacity="0.9"/>
      <circle cx="24" cy="19" r="4" fill="#fff" opacity="0.9"/>
      <path d="M12 16v6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8"/>
      <path d="M12 12c0-4 6-6 12-4" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.8"/>
      <circle cx="26" cy="26" r="6" stroke="#fff" strokeWidth="2" fill="none" opacity="0.85"/>
      <line x1="30.5" y1="30.5" x2="34" y2="34" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity="0.85"/>
    </svg>
  );
}

const defaultFilters: GlobalFilters = {
  projectIds: [],
  tags: [],
  dateFrom: dayjs().subtract(90, "day").format("YYYY-MM-DD"),
  dateTo: dayjs().format("YYYY-MM-DD"),
  contributors: [],
};

type TabKey = "dashboard" | "analytics" | "stack" | "settings";
type AnalyticsTab = "contributors" | "activity" | "branches";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("contributors");
  const [filters, setFilters] = useState<GlobalFilters>(defaultFilters);

  useEffect(() => {
    getMe().then((res) => { if (res.ok) setUser(res.data!); setLoading(false); });
  }, []);

  const handleLogout = () => { clearToken(); setUser(null); };

  const handleContributorClick = useCallback((name: string) => {
    setFilters((prev) => ({
      ...prev,
      contributors: prev.contributors.includes(name) ? prev.contributors : [...prev.contributors, name],
    }));
  }, []);

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}><Typography.Text>Загрузка...</Typography.Text></div>;
  if (!user) return <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}><LoginPage onLogin={setUser} /></ConfigProvider>;

  const menuItems = [
    { key: "dashboard", icon: <DashboardOutlined />, label: "Обзор" },
    { key: "analytics", icon: <TeamOutlined />, label: "Аналитика" },
    { key: "stack", icon: <ApartmentOutlined />, label: "Языки" },
    ...(user.role === "admin" ? [{ key: "settings", icon: <SettingOutlined />, label: "Настройки" }] : []),
  ];

  const analyticsSubTabs = [
    { key: "contributors", label: "Контрибьюторы" },
    { key: "activity", label: "Активность" },
    { key: "branches", label: "Ветки" },
  ];

  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <Layout style={{ minHeight: "100vh" }}>
        <Header style={{ display: "flex", alignItems: "center", padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 32 }}>
            <Logo />
            <span style={{ color: "#fff", fontWeight: "bold", fontSize: 22, letterSpacing: 0.5 }}>GitLab Scout</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginLeft: 4 }}>v1.3.1</span>
          </div>
          <Menu theme="dark" mode="horizontal" selectedKeys={[tab]}
            onClick={({ key }) => setTab(key as TabKey)}
            items={menuItems} style={{ flex: 1 }} />
          <div style={{ color: "rgba(255,255,255,0.65)", marginRight: 16, fontSize: 14 }}>
            {user.username} ({user.role})
          </div>
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} style={{ color: "rgba(255,255,255,0.65)" }}>Выйти</Button>
        </Header>
        {tab === "analytics" && (
          <div style={{ background: "#1a1a2e", padding: "0 24px", display: "flex", gap: 0 }}>
            {analyticsSubTabs.map((t) => (
              <div key={t.key}
                onClick={() => setAnalyticsTab(t.key as AnalyticsTab)}
                style={{
                  padding: "10px 24px", cursor: "pointer", fontSize: 14, fontWeight: 500,
                  color: analyticsTab === t.key ? "#fff" : "rgba(255,255,255,0.55)",
                  borderBottom: analyticsTab === t.key ? "2px solid #667eea" : "2px solid transparent",
                  background: analyticsTab === t.key ? "rgba(102,126,234,0.15)" : "transparent",
                  transition: "all 0.2s",
                }}
              >{t.label}</div>
            ))}
          </div>
        )}
        <Content style={{ padding: "12px 24px 24px", background: "#f5f5f5" }}>
          {tab === "analytics" && <GlobalFilterBar filters={filters} onChange={setFilters} />}
          {tab === "dashboard" && <Dashboard onContributorClick={handleContributorClick} />}
          {tab === "analytics" && analyticsTab === "contributors" && <ContributorDashboard userRole={user.role} filters={filters} onContributorClick={handleContributorClick} />}
          {tab === "analytics" && analyticsTab === "activity" && <ActivityDashboard userRole={user.role} filters={filters} onContributorClick={handleContributorClick} />}
          {tab === "analytics" && analyticsTab === "branches" && <BranchDashboard userRole={user.role} filters={filters} onContributorClick={handleContributorClick} />}
          {tab === "stack" && <StackDashboard userRole={user.role} />}
          {tab === "settings" && user.role === "admin" && <SettingsPanel />}
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
