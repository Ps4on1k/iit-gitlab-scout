import { Tooltip } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import { useCollectStatus } from "../../hooks/useCollectStatus";

export function SyncIndicator() {
  const { isRunning } = useCollectStatus();
  if (!isRunning) return null;
  return (
    <Tooltip title="Идёт сбор данных">
      <SyncOutlined spin style={{ color: "#42D9C8", fontSize: 14 }} />
    </Tooltip>
  );
}
