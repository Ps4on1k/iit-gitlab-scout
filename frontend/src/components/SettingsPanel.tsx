import { Tabs } from "antd";
import { ProjectOutlined, UserOutlined, ClockCircleOutlined, TeamOutlined } from "@ant-design/icons";
import { AdminPanel } from "./AdminPanel";
import { UserManagement } from "./UserManagement";
import { SchedulerPanel } from "./SchedulerPanel";
import { ContributorDirectoryPanel } from "./directory/ContributorDirectoryPanel";

export function SettingsPanel() {
  return (
    <div style={{ padding: "0 24px" }}>
      <Tabs
        defaultActiveKey="projects"
        items={[
          {
            key: "projects",
            label: <span><ProjectOutlined /> Проекты</span>,
            children: <AdminPanel />,
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
        ]}
      />
    </div>
  );
}
