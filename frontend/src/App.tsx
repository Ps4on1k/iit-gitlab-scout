import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { ConfigProvider, Layout, Button, Typography, Spin, Tooltip } from "antd";
import { MenuOutlined, ApartmentOutlined, TeamOutlined, SettingOutlined, LogoutOutlined, DashboardOutlined, BulbOutlined, BulbFilled, BarChartOutlined, SyncOutlined, CloseOutlined, RightOutlined, UpOutlined, FilePdfOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { LoginPage } from "./components/LoginPage";
import { GlobalFilterBar, type GlobalFilters } from "./components/GlobalFilterBar";
import { getMe, clearToken, resolveContributor } from "./api/client";
import { clearCache } from "./utils/cache";
import { darkThemeConfig, lightThemeConfig } from "./utils/theme";
import { useCollectStatus } from "./hooks/useCollectStatus";
import { ReportPreview } from "./components/reports/ReportPreview";
import type { User } from "./types";

const Dashboard = lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })));
const ContributorDashboard = lazy(() => import("./components/contributors/ContributorDashboard").then(m => ({ default: m.ContributorDashboard })));
const StackDashboard = lazy(() => import("./components/stack/StackDashboard").then(m => ({ default: m.StackDashboard })));
const ActivityDashboard = lazy(() => import("./components/activity/ActivityDashboard").then(m => ({ default: m.ActivityDashboard })));
const BranchDashboard = lazy(() => import("./components/branches/BranchDashboard").then(m => ({ default: m.BranchDashboard })));
const PipelineDashboard = lazy(() => import("./components/pipelines/PipelineDashboard").then(m => ({ default: m.PipelineDashboard })));
const DoraDashboard = lazy(() => import("./components/dora/DoraDashboard").then(m => ({ default: m.DoraDashboard })));
const BenchmarkDashboard = lazy(() => import("./components/benchmark/BenchmarkDashboard").then(m => ({ default: m.BenchmarkDashboard })));
const DeployReliabilityDashboard = lazy(() => import("./components/contributors/DeployReliabilityDashboard").then(m => ({ default: m.DeployReliabilityDashboard })));
const DependencyDashboard = lazy(() => import("./components/dependencies/DependencyDashboard").then(m => ({ default: m.DependencyDashboard })));
const SettingsPanel = lazy(() => import("./components/SettingsPanel").then(m => ({ default: m.SettingsPanel })));

const { Header, Content } = Layout;

function Watermark({ dark }: { dark: boolean }) {
  const color = dark ? "rgba(174,183,200,0.08)" : "rgba(17,19,21,0.04)";
  return (
    <div style={{ position: "fixed", top: -540, left: -720, width: 1440, height: 1440, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}>
        <path d="M60 8.18164V111.818" stroke={color} strokeWidth="13.63" />
        <path d="M105 34.0908L15 85.909" stroke={color} strokeWidth="13.63" />
        <path d="M15 34.0908L105 85.909" stroke={color} strokeWidth="13.63" />
      </svg>
    </div>
  );
}

function Logo() {
  return <img src="/logo.svg" alt="GitLab Scout" style={{ width: 28, height: 28 }} />;
}

const defaultFilters: GlobalFilters = {
  projectIds: [], tags: [],
  dateFrom: dayjs().subtract(90, "day").format("YYYY-MM-DD"),
  dateTo: dayjs().format("YYYY-MM-DD"),
  contributors: [],
};

type TabKey = "dashboard" | "analytics" | "stack" | "dependencies" | "benchmark" | "settings";
type AnalyticsTab = "contributors" | "deploy-reliability" | "activity" | "branches" | "pipelines" | "dora";

function getInitialDarkMode(): boolean {
  try { const s = localStorage.getItem("darkMode"); if (s !== null) return s === "true"; } catch {} return true;
}

function readUrlState() {
  const p = new URLSearchParams(window.location.search);
  const tab = (p.get("tab") as TabKey) || "dashboard";
  const aTab = (p.get("view") as AnalyticsTab) || "contributors";
  const filters: Partial<GlobalFilters> = {};
  const pid = p.get("projects"); if (pid) filters.projectIds = pid.split(",").map(Number).filter(Boolean);
  const tags = p.get("tags"); if (tags) filters.tags = tags.split(",").filter(Boolean);
  const contribs = p.get("contributors"); if (contribs) filters.contributors = contribs.split(",").filter(Boolean);
  const df = p.get("dateFrom"); if (df) filters.dateFrom = df;
  const dt = p.get("dateTo"); if (dt) filters.dateTo = dt;
  const tp: Record<string, string> = {};
  for (const [k, v] of p.entries()) { if (!["tab", "view", "projects", "tags", "contributors", "dateFrom", "dateTo"].includes(k)) tp[k] = v; }
  return { tab, analyticsTab: aTab, filters, tabParams: tp };
}

function writeUrlState(tab: TabKey, analyticsTab: AnalyticsTab, filters: GlobalFilters, tabParams: Record<string, string>) {
  const p = new URLSearchParams(); p.set("tab", tab);
  if (tab === "analytics") {
    p.set("view", analyticsTab);
    if (filters.projectIds.length > 0) p.set("projects", filters.projectIds.join(","));
    if (filters.tags.length > 0) p.set("tags", filters.tags.join(","));
    if (filters.contributors.length > 0) p.set("contributors", filters.contributors.join(","));
    if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) p.set("dateTo", filters.dateTo);
  }
  for (const [k, v] of Object.entries(tabParams)) { if (v) p.set(k, v); }
  const qs = p.toString();
  window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

const TAB_LABELS: Record<TabKey, string> = { dashboard: "Обзор", analytics: "Аналитика", stack: "Языки", dependencies: "Зависимости", benchmark: "Бенчмарк", settings: "Настройки" };
const ANALYTICS_LABELS: Record<AnalyticsTab, string> = { contributors: "Контрибьюторы", "deploy-reliability": "Надёжность", activity: "Активность", branches: "Ветки", pipelines: "CI/CD", dora: "DORA" };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const urlState = useRef(readUrlState());
  const [tab, setTab] = useState<TabKey>(urlState.current.tab);
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>(urlState.current.analyticsTab);
  const [filters, setFilters] = useState<GlobalFilters>(() => ({ ...defaultFilters, ...urlState.current.filters }));
  const [tabParams, setTabParams] = useState<Record<string, string>>(urlState.current.tabParams);
  const [darkMode, setDarkMode] = useState<boolean>(getInitialDarkMode);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const isInitialLoad = useRef(true);
  const { isRunning: collectionRunning } = useCollectStatus();

  const setTabParam = useCallback((key: string, value: string | undefined) => {
    setTabParams((prev) => { const next = { ...prev }; if (value === undefined || value === "") delete next[key]; else next[key] = value; return next; });
  }, []);

  useEffect(() => { getMe().then((res) => { if (res.ok) setUser(res.data!); setLoading(false); }); }, []);
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 300);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  useEffect(() => { try { localStorage.setItem("darkMode", String(darkMode)); } catch {} }, [darkMode]);
  useEffect(() => { clearCache(); }, [filters, analyticsTab]);
  useEffect(() => { if (isInitialLoad.current) { isInitialLoad.current = false; return; } writeUrlState(tab, analyticsTab, filters, tabParams); }, [tab, analyticsTab, filters, tabParams]);

  const handleLogout = () => { clearToken(); setUser(null); };
  const handleContributorClick = useCallback(async (emailOrName: string) => {
    if (!emailOrName) return;
    const res = await resolveContributor(emailOrName);
    const resolved = res.ok ? res.data!.email : emailOrName;
    setFilters((prev) => ({ ...prev, contributors: prev.contributors.includes(resolved) ? prev.contributors : [...prev.contributors, resolved] }));
    setTab("analytics"); setAnalyticsTab("contributors");
  }, []);
  const navigateTo = (newTab: TabKey, newAnalyticsTab?: AnalyticsTab) => { setTab(newTab); if (newAnalyticsTab) setAnalyticsTab(newAnalyticsTab); };

  const themeConfig = darkMode ? darkThemeConfig : lightThemeConfig;
  const contentBg = darkMode ? "#111827" : "#F5F7FA";
  const filterKey = JSON.stringify(filters);

  if (loading) return <ConfigProvider theme={themeConfig}><div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: contentBg }}><Typography.Text>Загрузка...</Typography.Text></div></ConfigProvider>;
  if (!user) return <ConfigProvider theme={themeConfig}><LoginPage onLogin={setUser} /></ConfigProvider>;

  const breadcrumbItems = tab === "analytics"
    ? [{ label: "Аналитика", onClick: () => navigateTo("analytics") }, { label: ANALYTICS_LABELS[analyticsTab] }]
    : [{ label: TAB_LABELS[tab] }];

  return (
    <ConfigProvider theme={themeConfig}>
      <Layout style={{ minHeight: "100vh", background: contentBg }}>
        <Watermark dark={darkMode} />

        {/* Header - full width, sticky */}
        <Header style={{ display: "flex", alignItems: "center", padding: "0 16px", background: darkMode ? "#141B2D" : "#1e293b", height: 48, zIndex: 100, position: "sticky", top: 0 }}>
          <Button type="text" icon={<MenuOutlined style={{ color: darkMode ? "#e2e8f0" : "#e2e8f0", fontSize: 18 }} />} onClick={() => setSidebarOpen(!sidebarOpen)} style={{ marginRight: 12 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 16 }}><Logo /><span style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>GitLab Scout</span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginLeft: 4 }}>v3.1.0</span>
            {collectionRunning && <Tooltip title="Идёт сбор данных"><SyncOutlined spin style={{ color: "#42D9C8", fontSize: 14 }} /></Tooltip>}
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#94a3b8" }}>
            {breadcrumbItems.map((item, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <RightOutlined style={{ fontSize: 10, color: "#475569" }} />}
                <span style={{ cursor: item.onClick ? "pointer" : "default", color: item.onClick ? "#3A8DFF" : "#94a3b8", fontWeight: i === breadcrumbItems.length - 1 ? 600 : 400 }} onClick={item.onClick}>{item.label}</span>
              </span>
            ))}
          </div>
          <Button type="text" icon={darkMode ? <BulbFilled style={{ color: "#fbbf24" }} /> : <BulbOutlined style={{ color: "rgba(255,255,255,0.65)" }} />} onClick={() => setDarkMode(!darkMode)} style={{ marginRight: 8 }} />
          {(user.role === "admin" || user.role === "manager") && (
            <Tooltip title="Executive Report">
              <Button type="text" icon={<FilePdfOutlined style={{ color: "rgba(255,255,255,0.65)" }} />} onClick={() => setReportOpen(true)} style={{ marginRight: 8 }} />
            </Tooltip>
          )}
          <div style={{ color: "rgba(255,255,255,0.65)", marginRight: 12, fontSize: 13, lineHeight: "1.2" }}>{user.username} ({user.role})</div>
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>Выйти</Button>
        </Header>

        {/* Body: sidebar + content side by side */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Sidebar */}
          <div style={{ width: sidebarOpen ? 260 : 0, minWidth: sidebarOpen ? 260 : 0, height: "100%", background: darkMode ? "#0f172a" : "#fff", transition: "all 0.25s ease", overflow: "hidden", flexShrink: 0, borderRight: `1px solid ${darkMode ? "#1e293b" : "#e5e7eb"}` }}>
            <div style={{ width: 260, height: "100%", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: `1px solid ${darkMode ? "#1e293b" : "#e5e7eb"}` }}>
                  <span style={{ color: darkMode ? "#fff" : "#1e293b", fontWeight: "bold", fontSize: 18 }}>Навигация</span>
                  <Button type="text" icon={<CloseOutlined style={{ color: darkMode ? "#94a3b8" : "#6b7280" }} />} onClick={() => setSidebarOpen(false)} />
                </div>
              <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
                {[{ key: "dashboard", icon: <DashboardOutlined />, label: "Обзор" }].map((item) => (
                  <div key={item.key} onClick={() => navigateTo(item.key as TabKey)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", cursor: "pointer", color: tab === item.key ? "#3A8DFF" : (darkMode ? "#94a3b8" : "#4b5563"), background: tab === item.key ? (darkMode ? "rgba(58,141,255,0.1)" : "rgba(58,141,255,0.08)") : "transparent", transition: "all 0.15s", fontSize: 14, fontWeight: tab === item.key ? 600 : 400 }}>{item.icon} {item.label}</div>
                ))}
                <div style={{ padding: "12px 20px 4px", fontSize: 11, color: darkMode ? "#64748b" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Аналитика</div>
                {[{ key: "contributors", label: "Контрибьюторы" }, { key: "deploy-reliability", label: "Надёжность" }, { key: "activity", label: "Активность" }, { key: "branches", label: "Ветки" }, { key: "pipelines", label: "CI/CD" }, { key: "dora", label: "DORA" }].map((item) => (
                  <div key={item.key} onClick={() => navigateTo("analytics", item.key as AnalyticsTab)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px 10px 36px", cursor: "pointer", color: tab === "analytics" && analyticsTab === item.key ? "#3A8DFF" : (darkMode ? "#94a3b8" : "#4b5563"), background: tab === "analytics" && analyticsTab === item.key ? (darkMode ? "rgba(58,141,255,0.1)" : "rgba(58,141,255,0.08)") : "transparent", transition: "all 0.15s", fontSize: 13, fontWeight: tab === "analytics" && analyticsTab === item.key ? 600 : 400 }}>{item.label}</div>
                ))}
                <div style={{ padding: "12px 20px 4px", fontSize: 11, color: darkMode ? "#64748b" : "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Разделы</div>
                {[
                  { key: "stack", icon: <ApartmentOutlined />, label: "Языки" },
                  { key: "dependencies", icon: <ApartmentOutlined />, label: "Зависимости" },
                  ...(user.role === "admin" || user.role === "manager" ? [{ key: "benchmark", icon: <BarChartOutlined />, label: "Бенчмарк" }] : []),
                  ...(user.role === "admin" ? [{ key: "settings", icon: <SettingOutlined />, label: "Настройки" }] : []),
                ].map((item) => (
                  <div key={item.key} onClick={() => navigateTo(item.key as TabKey)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", cursor: "pointer", color: tab === item.key ? "#3A8DFF" : (darkMode ? "#94a3b8" : "#4b5563"), background: tab === item.key ? (darkMode ? "rgba(58,141,255,0.1)" : "rgba(58,141,255,0.08)") : "transparent", transition: "all 0.15s", fontSize: 14, fontWeight: tab === item.key ? 600 : 400 }}>{item.icon} {item.label}</div>
                ))}
              </nav>
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${darkMode ? "#1e293b" : "#e5e7eb"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 16, background: "#3A8DFF", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 600 }}>{user.username[0].toUpperCase()}</div>
                  <div><div style={{ color: darkMode ? "#e2e8f0" : "#1f2937", fontSize: 13, fontWeight: 500 }}>{user.username}</div><div style={{ color: darkMode ? "#64748b" : "#9ca3af", fontSize: 11 }}>{user.role}</div></div>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
            <Content style={{ padding: "12px 24px 24px", flex: 1 }}>
              {tab === "analytics" && <GlobalFilterBar filters={filters} onChange={setFilters} userRole={user.role} userAllowedTags={user.allowed_tags} extraParams={tabParams} />}
              <Suspense fallback={<div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>}>
                {tab === "dashboard" && <Dashboard onContributorClick={handleContributorClick} />}
                {tab === "analytics" && analyticsTab === "contributors" && <ContributorDashboard key={`contrib-${filterKey}-${analyticsTab}`} userRole={user.role} filters={filters} onContributorClick={handleContributorClick} />}
                {tab === "analytics" && analyticsTab === "deploy-reliability" && (user.role === "admin" || user.role === "manager") && <DeployReliabilityDashboard key={`deploy-${filterKey}`} filters={filters} onContributorClick={handleContributorClick} />}
                {tab === "analytics" && analyticsTab === "activity" && <ActivityDashboard key={`activity-${filterKey}-${analyticsTab}`} userRole={user.role} filters={filters} onContributorClick={handleContributorClick} />}
                {tab === "analytics" && analyticsTab === "branches" && <BranchDashboard key={`branches-${filterKey}-${analyticsTab}`} userRole={user.role} filters={filters} onContributorClick={handleContributorClick} />}
                {tab === "analytics" && analyticsTab === "pipelines" && <PipelineDashboard key={`pipelines-${filterKey}-${analyticsTab}`} userRole={user.role} filters={filters} />}
                {tab === "analytics" && analyticsTab === "dora" && <DoraDashboard key={`dora-${filterKey}`} filters={filters} onParamChange={setTabParam} tabParams={tabParams} />}
                {tab === "stack" && <StackDashboard userRole={user.role} />}
                {tab === "dependencies" && <DependencyDashboard />}
                {tab === "benchmark" && (user.role === "admin" || user.role === "manager") && <BenchmarkDashboard filters={filters} />}
                {tab === "settings" && user.role === "admin" && <SettingsPanel />}
              </Suspense>
            </Content>

            <footer style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 16px", borderTop: `1px solid ${darkMode ? "#2A3A4A" : "#e5e7eb"}`, background: darkMode ? "#0f172a" : "#f8fafc" }}>
              <a href="https://inn-it.pro/" target="_blank" rel="noopener noreferrer"><img src="/asterics_color.svg" alt="Инновация ИТ" style={{ height: 48, opacity: 0.6, transition: "opacity 0.15s" }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")} /></a>
              <span style={{ fontSize: 11, color: "#8A94A6", marginTop: 6 }}>&copy; {new Date().getFullYear()} Инновация ИТ</span>
            </footer>
          </div>
        </div>
      </Layout>

      {/* Scroll to top button */}
      {showScrollTop && (
        <Button
          type="primary"
          shape="circle"
          icon={<UpOutlined />}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{ position: "fixed", bottom: 15, right: 15, width: 40, height: 40, zIndex: 1000, boxShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
        />
      )}

      <ReportPreview open={reportOpen} onClose={() => setReportOpen(false)} filters={filters} />
    </ConfigProvider>
  );
}
