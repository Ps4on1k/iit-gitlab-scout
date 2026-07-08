import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { fetchSchedulerStatus, type CollectJob } from "../api/scheduler-client";

const POLL_MS = 15000;

interface CollectStatusState {
  activeJobs: CollectJob[];
  isRunning: boolean;
  currentTask: string;
  taskCurrent: number;
  taskTotal: number;
  completedTasks: number;
  totalTasks: number;
  taskDurations: Record<string, number>;
  ready: boolean;
}

interface CollectStatusContextValue extends CollectStatusState {
  poll: () => Promise<void>;
}

const CollectStatusContext = createContext<CollectStatusContextValue | null>(null);

export function useCollectStatus(onComplete?: () => void) {
  const ctx = useContext(CollectStatusContext);
  if (!ctx) throw new Error("useCollectStatus must be used within CollectStatusProvider");
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!onComplete) return;
    const interval = setInterval(() => {
      if (!ctx.isRunning && onCompleteRef.current) {
        onCompleteRef.current();
      }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [ctx.isRunning, onComplete]);

  return ctx;
}

export function CollectStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CollectStatusState>({
    activeJobs: [], isRunning: false, currentTask: "", taskCurrent: 0, taskTotal: 0,
    completedTasks: 0, totalTasks: 0, taskDurations: {}, ready: false,
  });
  const wasRunningRef = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetchSchedulerStatus();
      if (res.ok) {
        const s = res.data!;
        const isRunning = s.isRunning;
        setStatus({
          activeJobs: s.activeJobs || [],
          isRunning,
          currentTask: s.currentTask || "",
          taskCurrent: s.taskCurrent,
          taskTotal: s.taskTotal,
          completedTasks: s.completedTasks || 0,
          totalTasks: s.totalTasks || 0,
          taskDurations: s.taskDurations || {},
          ready: true,
        });
        wasRunningRef.current = isRunning;
      }
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  return (
    <CollectStatusContext.Provider value={{ ...status, poll }}>
      {children}
    </CollectStatusContext.Provider>
  );
}
