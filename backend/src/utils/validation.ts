import { z } from "zod";

export const projectSchema = z.object({
  path: z.string().min(1).max(500).regex(/^[a-zA-Z0-9_\-/.]+$/, "Path contains invalid characters"),
  label: z.string().min(1).max(200),
  token: z.string().min(10).max(500),
  base_url: z.string().url().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  description: z.string().max(2000).optional(),
});

export const userSchema = z.object({
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/, "Username contains invalid characters"),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "user", "manager"]).optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const BLOCKED_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/,
  /^fd/,
  /^fe80:/,
];

export const baseUrlSchema = z.string().url().refine((url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (parsed.hostname === "localhost" || parsed.hostname === "0.0.0.0") return false;
    if (BLOCKED_IP_RANGES.some((re) => re.test(parsed.hostname))) return false;
    return true;
  } catch {
    return false;
  }
}, "Invalid URL: must be HTTP/HTTPS and not a private/reserved IP");

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.errors.map((e) => e.message).join(", ") };
}
