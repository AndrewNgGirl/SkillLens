/**
 * IP 限流（内存版）。
 * - 默认每 IP 每 24h 限制 N 次（N 读 env.DAILY_SCORE_LIMIT，默认 20）。
 * - 冷启后重置；生产建议换 Upstash 或 Supabase 实现 `RateLimiter`。
 */

export interface RateLimiter {
  check(key: string): Promise<{ ok: boolean; remaining: number; resetMs: number }>;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

class InMemoryLimiter implements RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async check(key: string): Promise<{ ok: boolean; remaining: number; resetMs: number }> {
    const limit = Number(process.env.DAILY_SCORE_LIMIT ?? 20);
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.resetAt < now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return { ok: true, remaining: limit - 1, resetMs: WINDOW_MS };
    }
    if (b.count >= limit) {
      return { ok: false, remaining: 0, resetMs: b.resetAt - now };
    }
    b.count += 1;
    return { ok: true, remaining: limit - b.count, resetMs: b.resetAt - now };
  }
}

export const limiter: RateLimiter = new InMemoryLimiter();

/** 本地开发白名单：回环地址不走限流；生产部署时通过 LLM_BYPASS_LOCAL=0 关闭。 */
export function isLocalBypass(key: string): boolean {
  if (process.env.LLM_BYPASS_LOCAL === "0") return false;
  return (
    key === "127.0.0.1" ||
    key === "::1" ||
    key === "localhost" ||
    key === "anon" ||
    key.startsWith("192.168.") ||
    key.startsWith("10.") ||
    key.startsWith("::ffff:127.") ||
    key.startsWith("::ffff:192.168.") ||
    key.startsWith("::ffff:10.")
  );
}

export function getClientKey(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "anon"
  );
}
