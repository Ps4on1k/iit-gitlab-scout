import { Tabs } from "antd";
import { ProjectOutlined, TeamOutlined, ApartmentOutlined } from "@ant-design/icons";
import { AdminPanel } from "../AdminPanel";
import { ContributorDirectoryPanel } from "../directory/ContributorDirectoryPanel";
import { DependenciesCatalogPanel } from "../DependenciesCatalogPanel";

export function DataReferences() {
  return (
    <div>
      <Tabs
        defaultActiveKey="projects"
        items={[
          {
            key: "projects",
            label: <span><ProjectOutlined /> Проекты</span>,
            children: <AdminPanel />,
          },
          {
            key: "contributors",
            label: <span><TeamOutlined /> Контрибьюторы</span>,
            children: <ContributorDirectoryPanel />,
          },
          {
            key: "dependencies",
            label: <span><ApartmentOutlined /> Зависимости</span>,
            children: <DependenciesCatalogPanel />,
          },
        ]}
      />
    </div>
  );
}
