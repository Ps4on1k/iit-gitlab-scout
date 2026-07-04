export function safeErrorMessage(err: unknown): string {
  if (process.env.NODE_ENV !== "production") {
    return err instanceof Error ? err.message : "Unknown error";
  }
  return "Internal server error";
}
