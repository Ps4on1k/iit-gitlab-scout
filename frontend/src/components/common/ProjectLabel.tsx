import { Popover } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";

interface ProjectLabelProps {
  label: string;
  tag?: string;
  description?: string;
  style?: React.CSSProperties;
}

export function ProjectLabel({ label, tag, description, style }: ProjectLabelProps) {
  return (
    <span style={style}>
      {label}
      {tag && <span style={{ color: "#999", fontSize: 12, marginLeft: 6 }}>[{tag}]</span>}
      <Popover content={<div style={{ maxWidth: 300, whiteSpace: "pre-wrap" }}>{description || "Нет описания"}</div>} trigger="click">
        <InfoCircleOutlined style={{ color: "#999", marginLeft: 6, cursor: "pointer", fontSize: 13 }} />
      </Popover>
    </span>
  );
}
