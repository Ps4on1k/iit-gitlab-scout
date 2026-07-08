import { Popover, Tag } from "antd";
import { InfoCircleOutlined, LinkOutlined } from "@ant-design/icons";
import { getTagColor } from "../../utils/tagColors";

interface ProjectLabelProps {
  label: string;
  tag?: string;
  description?: string;
  url?: string;
  style?: React.CSSProperties;
}

export function ProjectLabel({ label, tag, description, url, style }: ProjectLabelProps) {
  const tags = tag ? tag.split(", ").filter(Boolean) : [];

  return (
    <div style={style}>
      <div style={{ fontWeight: 600, lineHeight: 1.2 }}>
        {label}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6, color: "var(--ant-color-textTertiary)", fontSize: 13 }}>
            <LinkOutlined />
          </a>
        )}
        <Popover content={<div style={{ maxWidth: 300, whiteSpace: "pre-wrap" }}>{description || "Нет описания"}</div>} trigger="click">
          <InfoCircleOutlined style={{ color: "var(--ant-color-textTertiary)", marginLeft: 6, cursor: "pointer", fontSize: 13 }} />
        </Popover>
      </div>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 2 }}>
          {tags.map((t) => {
            const c = getTagColor(t);
            return (
              <Tag key={t} style={{ margin: 0, background: c.bg, color: c.text, border: "none", fontSize: 10, lineHeight: "16px", padding: "0 6px" }}>
                {t}
              </Tag>
            );
          })}
        </div>
      )}
    </div>
  );
}
