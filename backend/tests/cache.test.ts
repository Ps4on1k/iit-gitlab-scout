import { describe, it, expect, vi, beforeEach } from "vitest";
import { TTLDict } from "../src/utils/cache.js";

describe("TTLDict", () => {
  it("stores and retrieves values", () => {
    const cache = new TTLDict<string>(60);
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("returns undefined for missing keys", () => {
    const cache = new TTLDict<string>(60);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("expires entries after TTL", async () => {
    const cache = new TTLDict<string>(0);
    cache.set("key1", "value1");
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.get("key1")).toBeUndefined();
  });

  it("has() checks existence", () => {
    const cache = new TTLDict<number>(60);
    cache.set("a", 1);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("delete() removes entry", () => {
    const cache = new TTLDict<string>(60);
    cache.set("key", "val");
    cache.delete("key");
    expect(cache.get("key")).toBeUndefined();
  });

  it("clear() empties the cache", () => {
    const cache = new TTLDict<string>(60);
    cache.set("a", "1");
    cache.set("b", "2");
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("size reflects stored entries", () => {
    const cache = new TTLDict<string>(60);
    expect(cache.size).toBe(0);
    cache.set("a", "1");
    expect(cache.size).toBe(1);
    cache.set("b", "2");
    expect(cache.size).toBe(2);
  });
});
