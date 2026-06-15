import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  GITLAB_BASE_URL: z.string().url().default("https://gitlab.com/api/v4"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  REQUEST_TIMEOUT: z.coerce.number().int().positive().default(30000),
  RATE_LIMIT_RPS: z.coerce.number().positive().default(10),
  CACHE_TTL: z.coerce.number().int().positive().default(300),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  _env = envSchema.parse(process.env);
  return _env;
}
