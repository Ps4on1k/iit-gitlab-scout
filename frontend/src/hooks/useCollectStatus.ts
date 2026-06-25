import { useState, useEffect, useCallback, useRef } from "react";
import { fetchCollectStatus, type CollectJob } from "../api/client";

const POLL_MS = 5000;
const STUCK_TIMEOUT_MS = 5 * 60 * 1000;

export { type CollectJob };

export function useCollectStatus() {
  const [activeJobs, setActiveJobs] = useState<CollectJob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetchCollectStatus();
      if (res.ok) setActiveJobs(res.data!);
    } catch {}
  }, []);

  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, POLL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [poll]);

  const isAnyRunning = activeJobs.some((j) => j.status === "running");
  const stuckJobs = activeJobs.filter((j) => j.status === "stuck" || (j.status === "running" && Date.now() - j.started_at > STUCK_TIMEOUT_MS));

  return { activeJobs, isAnyRunning, stuckJobs, poll };
}
