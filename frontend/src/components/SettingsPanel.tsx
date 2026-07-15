import { Tabs } from "antd";
import { UserOutlined, FileTextOutlined, KeyOutlined } from "@ant-design/icons";
import { UserManagement } from "./UserManagement";
import { AuditLogPanel } from "./AuditLogPanel";
import { PersonalTokensPanel } from "./PersonalTokensPanel";

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
            key: "audit",
            label: <span><FileTextOutlined /> Аудит-лог</span>,
            children: <AuditLogPanel />,
          },
        ]}
      />
    </div>
  );
}
