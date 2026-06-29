import { Tabs } from "antd";
import { ProjectOutlined, UserOutlined, ClockCircleOutlined, TeamOutlined, FileTextOutlined, KeyOutlined } from "@ant-design/icons";
import { AdminPanel } from "./AdminPanel";
import { UserManagement } from "./UserManagement";
import { SchedulerPanel } from "./SchedulerPanel";
import { ContributorDirectoryPanel } from "./directory/ContributorDirectoryPanel";
import { AuditLogPanel } from "./AuditLogPanel";
import { PersonalTokensPanel } from "./PersonalTokensPanel";

export function SettingsPanel() {
  return (
    <div style={{ padding: "0 24px", background: "var(--ant-color-bg-container)", borderRadius: 2, minHeight: 400 }}>
      <Tabs
        defaultActiveKey="projects"
        items={[
          {
            key: "projects",
            label: <span><ProjectOutlined /> Проекты</span>,
            children: <AdminPanel />,
          },
          {
            key: "tokens",
            label: <span><KeyOutlined /> Токены</span>,
            children: <PersonalTokensPanel />,
          },
          {
            key: "users",
            label: <span><UserOutlined /> Пользователи</span>,
            children: <UserManagement />,
          },
          {
            key: "directory",
            label: <span><TeamOutlined /> Контрибьюторы</span>,
            children: <ContributorDirectoryPanel />,
          },
          {
            key: "scheduler",
            label: <span><ClockCircleOutlined /> Периодичность</span>,
            children: <SchedulerPanel />,
          },
          {
            key: "audit",
            label: <span><FileTextOutlined /> Аудит-лог</span>,
            children: <AuditLogPanel />,
          },
        ]}
      />
    </div>
  );
}
