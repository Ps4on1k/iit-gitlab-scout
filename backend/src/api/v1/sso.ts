import type { FastifyInstance } from "fastify";
import { getPool } from "../../db/pool.js";
import { signToken } from "../../utils/auth.js";
import { getEnv } from "../../config.js";
import crypto from "crypto";

export async function ssoRoutes(app: FastifyInstance) {
  const env = getEnv();

  app.get("/api/v1/auth/sso/config", async () => {
    return {
      ok: true,
      data: {
        provider: env.SSO_PROVIDER,
        enabled: env.SSO_PROVIDER === "oidc" && !!env.OIDC_ISSUER_URL,
      },
    };
  });

  app.get("/api/v1/auth/sso/authorize", async (request, reply) => {
    if (env.SSO_PROVIDER !== "oidc" || !env.OIDC_ISSUER_URL) {
      return reply.status(400).send({ ok: false, error: "SSO не настроен" });
    }

    const state = crypto.randomBytes(32).toString("hex");
    (request as any).session = { ssoState: state };

    const params = new URLSearchParams({
      response_type: "code",
      client_id: env.OIDC_CLIENT_ID || "",
      redirect_uri: env.OIDC_CALLBACK_URL || "http://localhost:8080/api/v1/auth/sso/callback",
      scope: "openid email profile",
      state,
    });

    return reply.redirect(`${env.OIDC_ISSUER_URL}/authorize?${params.toString()}`);
  });

  app.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>("/api/v1/auth/sso/callback", async (request, reply) => {
    const { code, state, error } = request.query;

    if (error) {
      return reply.redirect(`/?sso_error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return reply.redirect("/?sso_error=missing_code");
    }

    try {
      const tokenResp = await fetch(`${env.OIDC_ISSUER_URL}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: env.OIDC_CLIENT_ID || "",
          client_secret: env.OIDC_CLIENT_SECRET || "",
          redirect_uri: env.OIDC_CALLBACK_URL || "http://localhost:8080/api/v1/auth/sso/callback",
        }),
      });

      if (!tokenResp.ok) {
        return reply.redirect("/?sso_error=token_exchange_failed");
      }

      const tokens = await tokenResp.json() as any;
      const idToken = tokens.id_token;

      if (!idToken) {
        return reply.redirect("/?sso_error=no_id_token");
      }

      const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
      const externalId = payload.sub;
      const email = payload.email || "";
      const displayName = payload.name || email.split("@")[0];

      if (!externalId) {
        return reply.redirect("/?sso_error=no_subject");
      }

      const pool = getPool();
      const result = await pool.query(
        `INSERT INTO app_users (username, password_hash, role, external_provider, external_id, display_name, email, last_sso_login_at)
         VALUES ($1, NULL, $2, 'oidc', $3, $4, $5, now())
         ON CONFLICT (external_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           email = EXCLUDED.email,
           last_sso_login_at = now()
         RETURNING id, username, role, display_name`,
        [email || externalId, env.SSO_DEFAULT_ROLE, externalId, displayName, email]
      );

      const user = result.rows[0];
      const token = signToken({
        userId: user.id,
        username: user.username,
        role: user.role,
        tokenVersion: 1,
      });

      return reply.redirect(`/?sso_token=${token}`);
    } catch (err: any) {
      return reply.redirect(`/?sso_error=${encodeURIComponent(err.message || "unknown")}`);
    }
  });
}
