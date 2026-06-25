import { useState, useRef } from "react";
import { Button, Tooltip } from "antd";
import { DatabaseOutlined } from "@ant-design/icons";
import { useCollectStatus } from "../../hooks/useCollectStatus";
import { startBatchCollect } from "../../api/client";

interface Props {
  collector: string;
  projectIds: number[];
  dateFrom?: string;
  dateTo?: string;
  onComplete?: () => void;
  color?: string;
  label?: string;
}

const DEBOUNCE_MS = 3000;

export function CollectButton({ collector, projectIds, dateFrom, dateTo, onComplete, color = "#667eea", label = "Собрать" }: Props) {
  const { activeJobs, isAnyRunning, stuckJobs, poll } = useCollectStatus(onComplete);
  const [localStarting, setLocalStarting] = useState(false);
  const lastClickRef = useRef(0);

  const runningJobs = activeJobs.filter((j) => j.status === "running");
  const totalRunning = runningJobs.length;
  const backendCollecting = totalRunning > 0;
  const isDisabled = localStarting || backendCollecting;
  const currentJob = backendCollecting ? runningJobs[0] : null;

  const handleClick = async () => {
    const now = Date.now();
    if (now - lastClickRef.current < DEBOUNCE_MS) return;
    if (isDisabled) return;
    if (projectIds.length === 0) return;
    lastClickRef.current = now;

    setLocalStarting(true);
    try {
      await startBatchCollect(collector, projectIds, dateFrom, dateTo);
      poll();
    } catch {
    } finally {
      setLocalStarting(false);
    }
  };

  let buttonText = label;
  if (backendCollecting) {
    buttonText = `Сбор ${currentJob?.current || 0}/${currentJob?.total || projectIds.length}`;
  }

  const tooltipContent = stuckJobs.length > 0
    ? `Есть зависшие сборки (${stuckJobs.length})`
    : backendCollecting
    ? `Сбор на сервере: ${currentJob?.collector || collector} — ${currentJob?.current || 0}/${currentJob?.total || projectIds.length}`
    : undefined;

  const button = (
    <Button
      type="primary"
      icon={<DatabaseOutlined />}
      loading={localStarting}
      disabled={isDisabled}
      onClick={handleClick}
      style={{ background: color, borderColor: color, opacity: isDisabled && !localStarting ? 0.6 : 1 }}
    >
      {buttonText}
    </Button>
  );

  if (tooltipContent) {
    return <Tooltip title={tooltipContent}>{button}</Tooltip>;
  }
  return button;
}

export { useCollectStatus };
