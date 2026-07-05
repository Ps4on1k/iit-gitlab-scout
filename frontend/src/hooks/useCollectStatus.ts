import { useState, useEffect, useCallback, useRef } from "react";
import { fetchSchedulerStatus, type CollectJob } from "../api/scheduler-client";

const POLL_MS = 15000;

export function useCollectStatus(onComplete?: () => void) {
  const [status, setStatus] = useState<{
    activeJobs: CollectJob[];
    isRunning: boolean;
    currentTask: string;
    taskCurrent: number;
    taskTotal: number;
    completedTasks: number;
    totalTasks: number;
    taskDurations: Record<string, number>;
  }>({ activeJobs: [], isRunning: false, currentTask: "", taskCurrent: 0, taskTotal: 0, completedTasks: 0, totalTasks: 0, taskDurations: {} });
  const [ready, setReady] = useState(false);
  const wasRunningRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const poll = useCallback(async () => {
    try {
      const res = await fetchSchedulerStatus();
      if (res.ok) {
        const s = res.data!;
        setStatus({
          activeJobs: s.activeJobs || [],
          isRunning: s.isRunning,
          currentTask: s.currentTask || "",
          taskCurrent: s.taskCurrent,
          taskTotal: s.taskTotal,
          completedTasks: s.completedTasks || 0,
          totalTasks: s.totalTasks || 0,
          taskDurations: s.taskDurations || {},
        });
        setReady(true);

        if (wasRunningRef.current && !s.isRunning && onCompleteRef.current) {
          onCompleteRef.current();
        }
        wasRunningRef.current = s.isRunning;
      }
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  return { ...status, poll, ready };
}
