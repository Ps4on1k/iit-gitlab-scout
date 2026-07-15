import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";
import { syncAllToClickHouse } from "../../services/clickhouse-sync.js";

export async function clickhouseSyncRoutes(app: FastifyInstance) {
  app.post("/api/v1/clickhouse/sync", { preHandler: [requireAdmin] }, async (request, reply) => {
    try {
      const results = await syncAllToClickHouse();
      return { ok: true, data: results };
    } catch (err) {
      return reply.status(500).send({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/api/v1/clickhouse/status", { preHandler: [requireAdmin] }, async (request, reply) => {
    try {
      const { getClickHouse } = await import("../../db/clickhouse.js");
      const ch = getClickHouse();
      const result = await ch.query({ query: "SELECT 1 as ok" });
      const text = await result.text();
      const connected = text.includes('"ok":1');
      return { ok: true, data: { connected } };
    } catch (err) {
      return { ok: true, data: { connected: false, error: err instanceof Error ? err.message : String(err) } };
    }
  });
}
