import { describe, it, expect, beforeEach } from "vitest";
import { getCached, setCache, clearCache, cacheKey } from "../src/utils/cache.js";

beforeEach(() => {
  clearCache();
});

describe("cache utility", () => {
  it("stores and retrieves values", () => {
    setCache("key1", "value1", 60_000);
    expect(getCached<string>("key1")).toBe("value1");
  });

  it("returns undefined for missing keys", () => {
    expect(getCached<string>("missing")).toBeUndefined();
  });

  it("expires entries after TTL", async () => {
    setCache("key1", "value1", 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(getCached<string>("key1")).toBeUndefined();
  });

  it("clearCache() removes all entries", () => {
    setCache("a", 1, 60_000);
    setCache("b", 2, 60_000);
    clearCache();
    expect(getCached("a")).toBeUndefined();
    expect(getCached("b")).toBeUndefined();
  });

  it("clearCache(pattern) removes matching entries", () => {
    setCache("contributors:1", "a", 60_000);
    setCache("contributors:2", "b", 60_000);
    setCache("dashboard:1", "c", 60_000);
    clearCache("contributors");
    expect(getCached("contributors:1")).toBeUndefined();
    expect(getCached("contributors:2")).toBeUndefined();
    expect(getCached("dashboard:1")).toBe("c");
  });

  it("cacheKey joins parts with colons", () => {
    expect(cacheKey("dashboard", 1, "30")).toBe("dashboard:1:30");
  });

  it("cacheKey filters out undefined", () => {
    expect(cacheKey("a", undefined, "b")).toBe("a:b");
  });

  it("cacheKey filters out empty strings", () => {
    expect(cacheKey("a", "", "b")).toBe("a:b");
  });
});
