import { useState, useEffect, useCallback, useRef } from "react";
import { fetchCollectStatus, type CollectJob } from "../api/client";

const POLL_MS = 15000;
const STUCK_TIMEOUT_MS = 15 * 60 * 1000;

export { type CollectJob };

export function useCollectStatus(onComplete?: () => void) {
  const [activeJobs, setActiveJobs] = useState<CollectJob[]>([]);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const hadRunningRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const pollOnce = async () => {
      try {
        const res = await fetchCollectStatus();
        if (res.ok) {
          const jobs = res.data!;
          setActiveJobs(jobs);
          setSchedulerRunning((res as any).schedulerRunning || false);
          setReady(true);
          const running = jobs.some((j) => j.status === "running") || (res as any).schedulerRunning;
          if (hadRunningRef.current && !running && onCompleteRef.current) {
            onCompleteRef.current();
          }
          hadRunningRef.current = running;
        }
      } catch {}
    };

    pollOnce();
    const interval = setInterval(pollOnce, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetchCollectStatus();
      if (res.ok) {
        const jobs = res.data!;
        setActiveJobs(jobs);
        setSchedulerRunning((res as any).schedulerRunning || false);
        setReady(true);
        const running = jobs.some((j) => j.status === "running") || (res as any).schedulerRunning;
        hadRunningRef.current = running;
      }
    } catch {}
  }, []);

  const isAnyRunning = activeJobs.some((j) => j.status === "running") || schedulerRunning;
  const stuckJobs = activeJobs.filter((j) => j.status === "stuck" || (j.status === "running" && Date.now() - j.started_at > STUCK_TIMEOUT_MS));

  return { activeJobs, isAnyRunning, stuckJobs, poll, ready, schedulerRunning };
}
