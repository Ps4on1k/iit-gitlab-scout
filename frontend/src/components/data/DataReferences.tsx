import { Tabs } from "antd";
import { TeamOutlined, ApartmentOutlined } from "@ant-design/icons";
import { ContributorDirectoryPanel } from "../directory/ContributorDirectoryPanel";
import { DependenciesCatalogPanel } from "../DependenciesCatalogPanel";

export function DataReferences() {
  return (
    <div>
      <Tabs
        defaultActiveKey="contributors"
        items={[
          {
            key: "contributors",
            label: <span><TeamOutlined /> Справочник контрибьюторов</span>,
            children: <ContributorDirectoryPanel />,
          },
          {
            key: "dependencies",
            label: <span><ApartmentOutlined /> Каталог зависимостей</span>,
            children: <DependenciesCatalogPanel />,
          },
        ]}
      />
    </div>
  );
}
