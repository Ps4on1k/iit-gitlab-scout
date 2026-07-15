import { Tabs } from "antd";
import { TeamOutlined, ApartmentOutlined, ProjectOutlined, PercentageOutlined } from "@ant-design/icons";
import { AdminPanel } from "../AdminPanel";
import { ContributorDirectoryPanel } from "../directory/ContributorDirectoryPanel";
import { DependenciesCatalogPanel } from "../DependenciesCatalogPanel";
import { WeightsPanel } from "../WeightsPanel";

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
          {
            key: "weights",
            label: <span><PercentageOutlined /> Веса</span>,
            children: <WeightsPanel />,
          },
        ]}
      />
    </div>
  );
}
