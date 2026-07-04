import type { FastifyInstance } from "fastify";
import { requireAdmin } from "../../utils/auth.js";
import { getPool } from "../../db/pool.js";
import { getCached, setCache } from "../../utils/cache.js";

const DEFAULT_WEIGHTS: Record<string, Record<string, number>> = {
  contributor_score: { consistency: 25, activity: 20, impact: 20, sizeQuality: 15, deploy: 20 },
  deploy_reliability: { successRate: 50, coverage: 30, volume: 20 },
};

export async function metricWeightsRoutes(app: FastifyInstance) {
  app.get("/api/v1/metric-weights", { preHandler: [requireAdmin] }, async () => {
    const cached = getCached<Record<string, Record<string, number>>>("metric-weights");
    if (cached) return { ok: true, data: cached };

    const pool = getPool();
    const result = await pool.query("SELECT metric_name, weights FROM metric_weights");
    const weights: Record<string, Record<string, number>> = { ...DEFAULT_WEIGHTS };
    for (const row of result.rows) {
      weights[row.metric_name] = row.weights;
    }
    setCache("metric-weights", weights, 300_000);
    return { ok: true, data: weights };
  });

  app.put<{
    Params: { metric: string };
    Body: Record<string, number>;
  }>("/api/v1/metric-weights/:metric", { preHandler: [requireAdmin] }, async (request, reply) => {
    const { metric } = request.params;
    const weights = request.body;

    if (!weights || typeof weights !== "object") {
      return reply.status(400).send({ ok: false, error: "weights object required" });
    }

    const total = Object.values(weights).reduce((s, v) => s + v, 0);
    if (Math.abs(total - 100) > 1) {
      return reply.status(400).send({ ok: false, error: `Weights must sum to 100 (current: ${total})` });
    }

    for (const [k, v] of Object.entries(weights)) {
      if (typeof v !== "number" || v < 0 || v > 100) {
        return reply.status(400).send({ ok: false, error: `Invalid weight for ${k}: ${v}` });
      }
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO metric_weights (metric_name, weights, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (metric_name) DO UPDATE SET weights = $2, updated_at = now()`,
      [metric, JSON.stringify(weights)]
    );

    const { clearCache } = await import("../../utils/cache.js");
    clearCache("metric-weights");

    return { ok: true, data: weights };
  });
}
