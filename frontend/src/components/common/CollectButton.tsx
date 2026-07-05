import { useState, useRef } from "react";
import { Button, Tooltip, Modal, Typography } from "antd";
import { DatabaseOutlined, WarningOutlined } from "@ant-design/icons";
import { useCollectStatus } from "../../hooks/useCollectStatus";
import { startBatchCollect, validateProjectTokens } from "../../api/client";

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

export function CollectButton({ collector, projectIds, dateFrom, dateTo, onComplete, color = "#3A8DFF", label = "Собрать" }: Props) {
  const { activeJobs, isRunning, poll, ready } = useCollectStatus(onComplete);
  const [localStarting, setLocalStarting] = useState(false);
  const [validating, setValidating] = useState(false);
  const lastClickRef = useRef(0);

  const currentJob = activeJobs.find((j) => j.collector === collector && j.status === "running");
  const backendCollecting = !!currentJob;
  const isDisabled = !ready || localStarting || validating || isRunning || backendCollecting;
  const stuckJobs = activeJobs.filter((j) => j.status === "stuck" || (j.status === "running" && Date.now() - j.started_at > 15 * 60 * 1000));

  const doStartCollect = async (validIds: number[]) => {
    setLocalStarting(true);
    try {
      await startBatchCollect(collector, validIds, dateFrom, dateTo);
      poll();
    } catch {
    } finally {
      setLocalStarting(false);
    }
  };

  const handleClick = async () => {
    const now = Date.now();
    if (now - lastClickRef.current < DEBOUNCE_MS) return;
    if (isDisabled) return;
    if (projectIds.length === 0) return;
    lastClickRef.current = now;

    setValidating(true);
    try {
      const res = await validateProjectTokens(projectIds);
      if (!res.ok) {
        await doStartCollect(projectIds);
        return;
      }

      const { valid, invalid, total } = res.data!;

      if (invalid.length === 0) {
        await doStartCollect(projectIds);
        return;
      }

      if (valid === 0) {
        Modal.error({
          title: "Все токены невалидны",
          width: 500,
          content: (
            <div>
              <p style={{ marginBottom: 8 }}>Ни один токен не прошёл проверку. Сборка отменена.</p>
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                {invalid.map((e) => (
                  <div key={e.project_id} style={{ padding: "4px 0", fontSize: 12, borderBottom: "1px solid #eee" }}>
                    <strong>{e.label}</strong>: <span style={{ color: "#E5484D" }}>{e.error}</span>
                  </div>
                ))}
              </div>
            </div>
          ),
        });
        return;
      }

      Modal.confirm({
        title: `Найдены невалидные токены (${invalid.length} из ${total})`,
        width: 500,
        icon: <WarningOutlined style={{ color: "#FFB020" }} />,
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>Будут собраны только проекты с валидными токенами ({valid} из {total}).</p>
            <div style={{ maxHeight: 200, overflow: "auto" }}>
              {invalid.map((e) => (
                <div key={e.project_id} style={{ padding: "4px 0", fontSize: 12, borderBottom: "1px solid #eee" }}>
                  <strong>{e.label}</strong>: <span style={{ color: "#E5484D" }}>{e.error}</span>
                </div>
              ))}
            </div>
          </div>
        ),
        okText: `Собрать ${valid} проектов`,
        cancelText: "Отмена",
        onOk: async () => {
          const validIds = projectIds.filter((id) => !invalid.some((e) => e.project_id === id));
          await doStartCollect(validIds);
        },
      });
    } catch {
      await doStartCollect(projectIds);
    } finally {
      setValidating(false);
    }
  };

  let buttonText = label;
  if (validating) {
    buttonText = "Проверка токенов...";
  } else if (backendCollecting && currentJob) {
    buttonText = `Сбор ${currentJob.current}/${currentJob.total}`;
  }

  const tooltipContent = stuckJobs.length > 0
    ? `Есть зависшие сборки (${stuckJobs.length})`
    : backendCollecting && currentJob
    ? `Сбор на сервере: ${currentJob.collector} — ${currentJob.current}/${currentJob.total}`
    : isRunning && !backendCollecting
    ? "Другой сбор уже идёт"
    : undefined;

  const button = (
    <Button
      type="primary"
      icon={<DatabaseOutlined />}
      loading={localStarting || validating}
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
