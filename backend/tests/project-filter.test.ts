import { describe, it, expect } from "vitest";
import { applyProjectFilter } from "../src/utils/project-filter.js";

describe("applyProjectFilter", () => {
  it("returns idx unchanged when projectIds is null (admin)", () => {
    const conditions: string[] = [];
    const params: any[] = [];
    const idx = applyProjectFilter(conditions, params, 1, null);
    expect(idx).toBe(1);
    expect(conditions).toHaveLength(0);
    expect(params).toHaveLength(0);
  });

  it("adds impossible condition when projectIds is empty", () => {
    const conditions: string[] = [];
    const params: any[] = [];
    const idx = applyProjectFilter(conditions, params, 1, []);
    expect(idx).toBe(2);
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toContain("project_id");
    expect(params[0]).toBe(-1);
  });

  it("adds ANY condition with project IDs", () => {
    const conditions: string[] = [];
    const params: any[] = [];
    const idx = applyProjectFilter(conditions, params, 3, [1, 2, 3]);
    expect(idx).toBe(4);
    expect(conditions).toHaveLength(1);
    expect(conditions[0]).toContain("ANY($3)");
    expect(params[0]).toEqual([1, 2, 3]);
  });
});
