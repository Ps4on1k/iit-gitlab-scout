import { useState, useEffect, useCallback } from "react";
import { ConfigProvider, Layout, Menu, Button, Typography } from "antd";
import { ApartmentOutlined, ThunderboltOutlined, TeamOutlined, SettingOutlined, LogoutOutlined, BranchesOutlined, DashboardOutlined, BulbOutlined, BulbFilled } from "@ant-design/icons";
import dayjs from "dayjs";
import { LoginPage } from "./components/LoginPage";
import { Dashboard } from "./pages/Dashboard";
import { ContributorDashboard } from "./components/contributors/ContributorDashboard";
import { StackDashboard } from "./components/stack/StackDashboard";
import { ActivityDashboard } from "./components/activity/ActivityDashboard";
import { BranchDashboard } from "./components/branches/BranchDashboard";
import { SettingsPanel } from "./components/SettingsPanel";
import { GlobalFilterBar, type GlobalFilters } from "./components/GlobalFilterBar";
import { getMe, clearToken, resolveContributor } from "./api/client";
import { darkThemeConfig, lightThemeConfig } from "./utils/theme";
import type { User } from "./types";

const { Header, Content } = Layout;

function Logo({ isDark }: { isDark: boolean }) {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="4" fill={isDark ? "#667eea" : "#fff"} opacity="0.9"/>
      <circle cx="12" cy="26" r="4" fill={isDark ? "#667eea" : "#fff"} opacity="0.9"/>
      <circle cx="24" cy="19" r="4" fill={isDark ? "#667eea" : "#fff"} opacity="0.9"/>
      <path d="M12 16v6" stroke={isDark ? "#667eea" : "#fff"} strokeWidth="2.5" strokeLinecap="round" opacity="0.8"/>
      <path d="M12 12c0-4 6-6 12-4" stroke={isDark ? "#667eea" : "#fff"} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.8"/>
      <circle cx="26" cy="26" r="6" stroke={isDark ? "#667eea" : "#fff"} strokeWidth="2" fill="none" opacity="0.85"/>
      <line x1="30.5" y1="30.5" x2="34" y2="34" stroke={isDark ? "#667eea" : "#fff"} strokeWidth="2.5" strokeLinecap="round" opacity="0.85"/>
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

function getInitialDarkMode(): boolean {
  try { return localStorage.getItem("darkMode") === "true"; } catch { return false; }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>("contributors");
  const [filters, setFilters] = useState<GlobalFilters>(defaultFilters);
  const [darkMode, setDarkMode] = useState<boolean>(getInitialDarkMode);

  useEffect(() => {
    getMe().then((res) => { if (res.ok) setUser(res.data!); setLoading(false); });
  }, []);

  useEffect(() => {
    try { localStorage.setItem("darkMode", String(darkMode)); } catch {}
  }, [darkMode]);

  const handleLogout = () => { clearToken(); setUser(null); };

  const handleContributorClick = useCallback(async (emailOrName: string) => {
    if (!emailOrName) return;
    const res = await resolveContributor(emailOrName);
    const resolved = res.ok ? res.data!.email : emailOrName;
    setFilters((prev) => ({
      ...prev,
      contributors: prev.contributors.includes(resolved) ? prev.contributors : [...prev.contributors, resolved],
    }));
  }, []);

  const themeConfig = darkMode ? darkThemeConfig : lightThemeConfig;
  const contentBg = darkMode ? "#11111b" : "#f5f5f5";
  const subMenuBg = darkMode ? "#1a1a2e" : "#001529";

  if (loading) return <ConfigProvider theme={themeConfig}><div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: contentBg }}><Typography.Text>Загрузка...</Typography.Text></div></ConfigProvider>;
  if (!user) return <ConfigProvider theme={themeConfig}><LoginPage onLogin={setUser} /></ConfigProvider>;

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
    <ConfigProvider theme={themeConfig}>
      <Layout style={{ minHeight: "100vh", background: contentBg }}>
        <Header style={{ display: "flex", alignItems: "center", padding: "0 24px", background: darkMode ? "#1e1e2e" : "#001529" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 32 }}>
            <Logo isDark={darkMode} />
            <span style={{ color: "#fff", fontWeight: "bold", fontSize: 22, letterSpacing: 0.5 }}>GitLab Scout</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginLeft: 4 }}>v1.4.0</span>
          </div>
          <Menu theme="dark" mode="horizontal" selectedKeys={[tab]}
            onClick={({ key }) => setTab(key as TabKey)}
            items={menuItems} style={{ flex: 1, background: "transparent" }} />
          <Button
            type="text"
            icon={darkMode ? <BulbFilled style={{ color: "#fbbf24" }} /> : <BulbOutlined style={{ color: "rgba(255,255,255,0.65)" }} />}
            onClick={() => setDarkMode(!darkMode)}
            style={{ marginRight: 12 }}
          />
          <div style={{ color: "rgba(255,255,255,0.65)", marginRight: 16, fontSize: 14 }}>
            {user.username} ({user.role})
          </div>
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} style={{ color: "rgba(255,255,255,0.65)" }}>Выйти</Button>
        </Header>
        {tab === "analytics" && (
          <div style={{ background: subMenuBg, padding: "0 24px", display: "flex", gap: 0, borderBottom: darkMode ? "1px solid #313147" : "none" }}>
            {analyticsSubTabs.map((t) => (
              <div key={t.key}
                onClick={() => setAnalyticsTab(t.key as AnalyticsTab)}
                style={{
                  padding: "10px 24px", cursor: "pointer", fontSize: 14, fontWeight: 500,
                  color: analyticsTab === t.key ? "#fff" : (darkMode ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.55)"),
                  borderBottom: analyticsTab === t.key ? "2px solid #667eea" : "2px solid transparent",
                  background: analyticsTab === t.key ? "rgba(102,126,234,0.15)" : "transparent",
                  transition: "all 0.2s",
                }}
              >{t.label}</div>
            ))}
          </div>
        )}
        <Content style={{ padding: "12px 24px 24px", background: contentBg, border: "none" }}>
          {tab === "analytics" && <GlobalFilterBar filters={filters} onChange={setFilters} userRole={user.role} userAllowedTags={user.allowed_tags} />}
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
