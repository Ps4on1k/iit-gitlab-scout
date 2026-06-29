import { useState, useEffect, useCallback, useRef } from "react";
import { ConfigProvider, Layout, Menu, Button, Typography } from "antd";
import { ApartmentOutlined, ThunderboltOutlined, TeamOutlined, SettingOutlined, LogoutOutlined, BranchesOutlined, DashboardOutlined, BulbOutlined, BulbFilled, BarChartOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { LoginPage } from "./components/LoginPage";
import { Dashboard } from "./pages/Dashboard";
import { ContributorDashboard } from "./components/contributors/ContributorDashboard";
import { StackDashboard } from "./components/stack/StackDashboard";
import { ActivityDashboard } from "./components/activity/ActivityDashboard";
import { BranchDashboard } from "./components/branches/BranchDashboard";
import { PipelineDashboard } from "./components/pipelines/PipelineDashboard";
import { DoraDashboard } from "./components/dora/DoraDashboard";
import { BenchmarkDashboard } from "./components/benchmark/BenchmarkDashboard";
import { SettingsPanel } from "./components/SettingsPanel";
import { GlobalFilterBar, type GlobalFilters } from "./components/GlobalFilterBar";
import { getMe, clearToken, resolveContributor } from "./api/client";
import { clearCache } from "./utils/cache";
import { darkThemeConfig, lightThemeConfig } from "./utils/theme";
import type { User } from "./types";

const { Header, Content } = Layout;

function Watermark({ dark }: { dark: boolean }) {
  const color = dark ? "rgba(174,183,200,0.08)" : "rgba(17,19,21,0.04)";
  return (
    <div style={{
      position: "fixed", top: -304, left: -360,
      width: 720, height: 720,
      overflow: "hidden", pointerEvents: "none", zIndex: 0,
    }}>
      <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}>
        <path d="M60 8.18164V111.818" stroke={color} strokeWidth="13.63" />
        <path d="M105 34.0908L15 85.909" stroke={color} strokeWidth="13.63" />
        <path d="M15 34.0908L105 85.909" stroke={color} strokeWidth="13.63" />
      </svg>
    </div>
  );
}

function Logo({ isDark }: { isDark: boolean }) {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="4" fill={isDark ? "#3A8DFF" : "#fff"} opacity="0.9"/>
      <circle cx="12" cy="26" r="4" fill={isDark ? "#3A8DFF" : "#fff"} opacity="0.9"/>
      <circle cx="24" cy="19" r="4" fill={isDark ? "#3A8DFF" : "#fff"} opacity="0.9"/>
      <path d="M12 16v6" stroke={isDark ? "#3A8DFF" : "#fff"} strokeWidth="2.5" strokeLinecap="round" opacity="0.8"/>
      <path d="M12 12c0-4 6-6 12-4" stroke={isDark ? "#3A8DFF" : "#fff"} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.8"/>
      <circle cx="26" cy="26" r="6" stroke={isDark ? "#3A8DFF" : "#fff"} strokeWidth="2" fill="none" opacity="0.85"/>
      <line x1="30.5" y1="30.5" x2="34" y2="34" stroke={isDark ? "#3A8DFF" : "#fff"} strokeWidth="2.5" strokeLinecap="round" opacity="0.85"/>
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

type TabKey = "dashboard" | "analytics" | "stack" | "benchmark" | "settings";
type AnalyticsTab = "contributors" | "activity" | "branches" | "pipelines" | "dora";

function getInitialDarkMode(): boolean {
  try {
    const stored = localStorage.getItem("darkMode");
    if (stored !== null) return stored === "true";
  } catch {}
  return true;
}

function readUrlState(): { tab: TabKey; analyticsTab: AnalyticsTab; filters: Partial<GlobalFilters>; tabParams: Record<string, string> } {
  const params = new URLSearchParams(window.location.search);
  const tab = (params.get("tab") as TabKey) || "dashboard";
  const aTab = (params.get("view") as AnalyticsTab) || "contributors";
  const filters: Partial<GlobalFilters> = {};
  const projectIds = params.get("projects");
  if (projectIds) filters.projectIds = projectIds.split(",").map(Number).filter(Boolean);
  const tags = params.get("tags");
  if (tags) filters.tags = tags.split(",").filter(Boolean);
  const contributors = params.get("contributors");
  if (contributors) filters.contributors = contributors.split(",").filter(Boolean);
  const dateFrom = params.get("dateFrom");
  if (dateFrom) filters.dateFrom = dateFrom;
  const dateTo = params.get("dateTo");
  if (dateTo) filters.dateTo = dateTo;
  const tabParams: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    if (["tab", "view", "projects", "tags", "contributors", "dateFrom", "dateTo"].includes(k)) continue;
    tabParams[k] = v;
  }
  return { tab, analyticsTab: aTab, filters, tabParams };
}

function writeUrlState(tab: TabKey, analyticsTab: AnalyticsTab, filters: GlobalFilters, tabParams: Record<string, string>) {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (tab === "analytics") {
    params.set("view", analyticsTab);
    if (filters.projectIds.length > 0) params.set("projects", filters.projectIds.join(","));
    if (filters.tags.length > 0) params.set("tags", filters.tags.join(","));
    if (filters.contributors.length > 0) params.set("contributors", filters.contributors.join(","));
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
  }
  for (const [k, v] of Object.entries(tabParams)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState(null, "", newUrl);
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const urlState = useRef(readUrlState());
  const [tab, setTab] = useState<TabKey>(urlState.current.tab);
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>(urlState.current.analyticsTab);
  const [filters, setFilters] = useState<GlobalFilters>(() => ({
    ...defaultFilters,
    ...urlState.current.filters,
  }));
  const [tabParams, setTabParams] = useState<Record<string, string>>(urlState.current.tabParams);
  const [darkMode, setDarkMode] = useState<boolean>(getInitialDarkMode);
  const isInitialLoad = useRef(true);

  const setTabParam = useCallback((key: string, value: string | undefined) => {
    setTabParams((prev) => {
      const next = { ...prev };
      if (value === undefined || value === "") delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);

  useEffect(() => {
    getMe().then((res) => { if (res.ok) setUser(res.data!); setLoading(false); });
  }, []);

  useEffect(() => {
    try { localStorage.setItem("darkMode", String(darkMode)); } catch {}
  }, [darkMode]);

  useEffect(() => {
    clearCache();
  }, [filters]);

  useEffect(() => {
    if (isInitialLoad.current) { isInitialLoad.current = false; return; }
    writeUrlState(tab, analyticsTab, filters, tabParams);
  }, [tab, analyticsTab, filters, tabParams]);

  const handleLogout = () => { clearToken(); setUser(null); };

  const handleContributorClick = useCallback(async (emailOrName: string) => {
    if (!emailOrName) return;
    const res = await resolveContributor(emailOrName);
    const resolved = res.ok ? res.data!.email : emailOrName;
    setFilters((prev) => ({
      ...prev,
      contributors: prev.contributors.includes(resolved) ? prev.contributors : [...prev.contributors, resolved],
    }));
    setTab("analytics");
    setAnalyticsTab("contributors");
  }, []);

  const themeConfig = darkMode ? darkThemeConfig : lightThemeConfig;
  const contentBg = darkMode ? "#111827" : "#F5F7FA";
  const subMenuBg = darkMode ? "#111827" : "#111315";
  const filterKey = JSON.stringify(filters);

  if (loading) return <ConfigProvider theme={themeConfig}><div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: contentBg }}><Typography.Text>Загрузка...</Typography.Text></div></ConfigProvider>;
  if (!user) return <ConfigProvider theme={themeConfig}><LoginPage onLogin={setUser} /></ConfigProvider>;

  const menuItems = [
    { key: "dashboard", icon: <DashboardOutlined />, label: "Обзор" },
    { key: "analytics", icon: <TeamOutlined />, label: "Аналитика" },
    { key: "stack", icon: <ApartmentOutlined />, label: "Языки" },
    ...(user.role === "admin" || user.role === "manager" ? [{ key: "benchmark", icon: <BarChartOutlined />, label: "Бенчмарк" }] : []),
    ...(user.role === "admin" ? [{ key: "settings", icon: <SettingOutlined />, label: "Настройки" }] : []),
  ];

  const analyticsSubTabs = [
    { key: "contributors", label: "Контрибьюторы" },
    { key: "activity", label: "Активность" },
    { key: "branches", label: "Ветки" },
    { key: "pipelines", label: "CI/CD" },
    { key: "dora", label: <span>DORA</span> },
  ];

  return (
    <ConfigProvider theme={themeConfig}>
      <Layout style={{ minHeight: "100vh", background: contentBg }}>
        <Watermark dark={darkMode} />
        <Header style={{ display: "flex", alignItems: "center", padding: "0 24px", background: darkMode ? "#141B2D" : "#111315", position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 32 }}>
            <Logo isDark={darkMode} />
            <span style={{ color: "#fff", fontWeight: "bold", fontSize: 22, letterSpacing: 0.5 }}>GitLab Scout</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginLeft: 4 }}>v2.3.0</span>
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
          <div style={{ background: subMenuBg, padding: "0 24px", display: "flex", gap: 0, borderBottom: darkMode ? "1px solid #2A3A4A" : "none", position: "relative", zIndex: 10 }}>
            {analyticsSubTabs.map((t) => (
              <div key={t.key}
                onClick={() => setAnalyticsTab(t.key as AnalyticsTab)}
                style={{
                  padding: "10px 24px", cursor: "pointer", fontSize: 14, fontWeight: 500,
                  color: analyticsTab === t.key ? "#fff" : (darkMode ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.6)"),
                  borderBottom: analyticsTab === t.key ? "2px solid #3A8DFF" : "2px solid transparent",
                  background: analyticsTab === t.key ? "rgba(58,141,255,0.12)" : "transparent",
                  transition: "all 0.15s ease",
                }}
              >{t.label}</div>
            ))}
          </div>
        )}
        <Content style={{ padding: "12px 24px 24px", background: "transparent", border: "none", position: "relative", zIndex: 1 }}>
          {tab === "analytics" && <GlobalFilterBar filters={filters} onChange={setFilters} userRole={user.role} userAllowedTags={user.allowed_tags} extraParams={tabParams} />}
          {tab === "dashboard" && <Dashboard onContributorClick={handleContributorClick} />}
          {tab === "analytics" && analyticsTab === "contributors" && <ContributorDashboard key={`contrib-${filterKey}-${analyticsTab}`} userRole={user.role} filters={filters} onContributorClick={handleContributorClick} />}
          {tab === "analytics" && analyticsTab === "activity" && <ActivityDashboard key={`activity-${filterKey}-${analyticsTab}`} userRole={user.role} filters={filters} onContributorClick={handleContributorClick} />}
          {tab === "analytics" && analyticsTab === "branches" && <BranchDashboard key={`branches-${filterKey}-${analyticsTab}`} userRole={user.role} filters={filters} onContributorClick={handleContributorClick} />}
          {tab === "analytics" && analyticsTab === "pipelines" && <PipelineDashboard key={`pipelines-${filterKey}-${analyticsTab}`} userRole={user.role} filters={filters} />}
          {tab === "analytics" && analyticsTab === "dora" && <DoraDashboard key={`dora-${filterKey}`} filters={filters} onParamChange={setTabParam} tabParams={tabParams} />}
          {tab === "stack" && <StackDashboard userRole={user.role} />}
          {tab === "benchmark" && <BenchmarkDashboard filters={filters} />}
          {tab === "settings" && user.role === "admin" && <SettingsPanel />}
        </Content>
        <footer style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "24px 16px", borderTop: `1px solid ${darkMode ? "#2A3A4A" : "#EEF1F4"}`,
          background: darkMode ? "#111827" : "#F5F7FA",
          position: "relative", zIndex: 1,
        }}>
          <a href="https://inn-it.pro/" target="_blank" rel="noopener noreferrer">
            <img src="/asterics_color.svg" alt="Инновация ИТ" style={{ height: 56, opacity: 0.7, transition: "opacity 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")} />
          </a>
          <span style={{ fontSize: 11, color: darkMode ? "#8A94A6" : "#AEB7C4", marginTop: 8, letterSpacing: 0.3 }}>
            &copy; {new Date().getFullYear()} Инновация ИТ
          </span>
        </footer>
      </Layout>
    </ConfigProvider>
  );
}
