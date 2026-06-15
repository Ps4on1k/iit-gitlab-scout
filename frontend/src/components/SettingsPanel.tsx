import { useState, useEffect } from "react";
import { Tabs } from "antd";
import { ProjectOutlined, UserOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { AdminPanel } from "./AdminPanel";
import { UserManagement } from "./UserManagement";
import { SchedulerPanel } from "./SchedulerPanel";

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
            key: "scheduler",
            label: <span><ClockCircleOutlined /> Периодичность</span>,
            children: <SchedulerPanel />,
          },
        ]}
      />
    </div>
  );
}
