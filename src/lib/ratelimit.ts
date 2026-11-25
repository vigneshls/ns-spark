// Simple failed-login limiter. In-memory, so it is per server instance: it slows
// brute-force attempts but is not a global guarantee on serverless hosts.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const fails = new Map<string, number[]>();

const recent = (key: string) => {
  const now = Date.now();
  const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  fails.set(key, list);
  return list;
};
export const isLocked = (key: string) => recent(key).length >= MAX_FAILS;
export const recordFail = (key: string) => { recent(key).push(Date.now()); };
export const clearFails = (key: string) => { fails.delete(key); };
