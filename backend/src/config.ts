import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  GITLAB_BASE_URL: z.string().url().default("https://gitlab.com/api/v4"),
  GITLAB_PERSONAL_TOKEN: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  REQUEST_TIMEOUT: z.coerce.number().int().positive().default(30000),
  RATE_LIMIT_RPS: z.coerce.number().positive().default(10),
  CACHE_TTL: z.coerce.number().int().positive().default(300),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
  CORS_ORIGINS: z.string().optional(),
  DATA_READ_MODE: z.enum(["postgresql", "clickhouse", "hybrid"]).default("postgresql"),
  CLICKHOUSE_URL: z.string().default("http://clickhouse:8123"),
  CLICKHOUSE_DB: z.string().default("gitlab_scout"),
  CLICKHOUSE_USER: z.string().default("admin"),
  CLICKHOUSE_PASSWORD: z.string().default("changeme"),
  SSO_PROVIDER: z.enum(["local", "oidc"]).default("local"),
  OIDC_ISSUER_URL: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_CALLBACK_URL: z.string().optional(),
  SSO_DEFAULT_ROLE: z.enum(["admin", "user", "manager"]).default("user"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  _env = envSchema.parse(process.env);
  return _env;
}
