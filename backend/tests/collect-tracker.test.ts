import { describe, it, expect, beforeEach } from "vitest";
import {
  startBatchCollect,
  updateBatchCollect,
  addBatchError,
  finishBatchCollect,
  getActiveJobs,
  isCollectorActive,
  resetTracker,
} from "../src/utils/collect-tracker.js";

describe("collect-tracker", () => {
  beforeEach(() => {
    resetTracker();
  });

  it("startBatchCollect creates a running job", () => {
    const id = startBatchCollect("contributors", [1, 2, 3]);
    expect(id).toMatch(/^batch-/);

    const jobs = getActiveJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].collector).toBe("contributors");
    expect(jobs[0].total).toBe(3);
    expect(jobs[0].current).toBe(0);
    expect(jobs[0].status).toBe("running");
  });

  it("updateBatchCollect updates current progress", () => {
    const id = startBatchCollect("stack", [1, 2]);
    updateBatchCollect(id, 1);

    const jobs = getActiveJobs();
    expect(jobs[0].current).toBe(1);
  });

  it("addBatchError records errors", () => {
    const id = startBatchCollect("branches", [1, 2]);
    addBatchError(id, 1, "token expired");

    const jobs = getActiveJobs();
    expect(jobs[0].errors).toEqual([{ project_id: 1, error: "token expired" }]);
  });

  it("finishBatchCollect marks job as done and removes from active", () => {
    const id = startBatchCollect("pipelines", [1]);
    finishBatchCollect(id);

    const jobs = getActiveJobs();
    expect(jobs).toHaveLength(0);
  });

  it("isCollectorActive checks running jobs", () => {
    expect(isCollectorActive("contributors")).toBe(false);

    const id = startBatchCollect("contributors", [1]);
    expect(isCollectorActive("contributors")).toBe(true);

    finishBatchCollect(id);
    expect(isCollectorActive("contributors")).toBe(false);
  });

  it("getActiveJobs removes completed jobs on read", () => {
    const id1 = startBatchCollect("a", [1]);
    const id2 = startBatchCollect("b", [2]);
    finishBatchCollect(id1);

    const jobs = getActiveJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(id2);
  });
});
