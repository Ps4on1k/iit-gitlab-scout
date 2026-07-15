import { Tabs } from "antd";
import { UserOutlined, ClockCircleOutlined, FileTextOutlined, KeyOutlined, PercentageOutlined } from "@ant-design/icons";
import { UserManagement } from "./UserManagement";
import { SchedulerPanel } from "./SchedulerPanel";
import { AuditLogPanel } from "./AuditLogPanel";
import { PersonalTokensPanel } from "./PersonalTokensPanel";
import { WeightsPanel } from "./WeightsPanel";

export function SettingsPanel() {
  return (
    <div style={{ padding: "0 24px", borderRadius: 2, minHeight: 400 }}>
      <Tabs
        defaultActiveKey="tokens"
        items={[
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
            key: "weights",
            label: <span><PercentageOutlined /> Веса</span>,
            children: <WeightsPanel />,
          },
          {
            key: "scheduler",
            label: <span><ClockCircleOutlined /> Планировщик</span>,
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
