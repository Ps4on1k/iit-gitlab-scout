const COLLECT_DELAY_MS = 2000;

export function delay(ms: number = COLLECT_DELAY_MS): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
