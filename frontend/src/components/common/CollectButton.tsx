import { useState, useRef } from "react";
import { Button, Tooltip } from "antd";
import { DatabaseOutlined } from "@ant-design/icons";
import { useCollectStatus } from "../../hooks/useCollectStatus";

interface Props {
  onClick: () => Promise<void>;
  collecting: boolean;
  collectProgress?: { current: number; total: number } | null;
  color?: string;
  label?: string;
}

const DEBOUNCE_MS = 3000;

export function CollectButton({ onClick, collecting, collectProgress, color = "#667eea", label = "Собрать" }: Props) {
  const { activeJobs, isAnyRunning, stuckJobs, poll } = useCollectStatus();
  const lastClickRef = useRef(0);

  const runningJobs = activeJobs.filter((j) => j.status === "running");
  const totalRunning = runningJobs.length;
  const backendCollecting = totalRunning > 0;
  const isDisabled = collecting || backendCollecting;

  const handleClick = async () => {
    const now = Date.now();
    if (now - lastClickRef.current < DEBOUNCE_MS) return;
    if (isDisabled) return;
    lastClickRef.current = now;
    await onClick();
    poll();
  };

  let buttonText = label;
  if (collecting && collectProgress) {
    buttonText = `Сбор ${collectProgress.current}/${collectProgress.total}`;
  } else if (backendCollecting && !collecting) {
    buttonText = `Сбор ${totalRunning} проект(ов)`;
  }

  const tooltipContent = stuckJobs.length > 0
    ? `Есть зависшие сборки (${stuckJobs.length})`
    : backendCollecting && !collecting
    ? `Идёт сбор на сервере: ${runningJobs.map((j) => j.collector).join(", ")}`
    : undefined;

  const button = (
    <Button
      type="primary"
      icon={<DatabaseOutlined />}
      loading={collecting}
      disabled={isDisabled}
      onClick={handleClick}
      style={{ background: color, borderColor: color, opacity: isDisabled && !collecting ? 0.6 : 1 }}
    >
      {buttonText}
    </Button>
  );

  if (tooltipContent) {
    return <Tooltip title={tooltipContent}>{button}</Tooltip>;
  }
  return button;
}
