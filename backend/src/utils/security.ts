import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

export async function securityPlugin(app: FastifyInstance) {
  // Security headers via onSend hook (called before response is sent)
  app.addHook("onSend", async (request: FastifyRequest, reply: FastifyReply, payload: string) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-XSS-Protection", "1; mode=block");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return payload;
  });

  // Simple rate limiting (in-memory, per IP)
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT_WINDOW = 60 * 1000;
  const RATE_LIMIT_MAX = 100;

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip || "unknown";
    const now = Date.now();
    const entry = rateLimitMap.get(ip);

    if (entry && now < entry.resetAt) {
      if (entry.count >= RATE_LIMIT_MAX) {
        return reply.status(429).send({ ok: false, error: "Too many requests" });
      }
      entry.count++;
    } else {
      rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    }

    if (rateLimitMap.size > 1000) {
      for (const [key, val] of rateLimitMap) {
        if (now > val.resetAt) rateLimitMap.delete(key);
      }
    }
  });

  // Sanitize error responses
  app.setErrorHandler((error, request, reply) => {
    const isDev = process.env.NODE_ENV !== "production";
    const err = error as any;
    app.log.error(error);
    reply.status(err.statusCode || 500).send({
      ok: false,
      error: isDev ? err.message : "Internal server error",
    });
  });
}
