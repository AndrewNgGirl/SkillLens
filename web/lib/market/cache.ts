/**
 * 市场调研结果的内存缓存。
 * 同一组关键词 + lang 的 query 半小时内复用同一份 GitHub 结果，
 * 避免反复打 GitHub Search 浪费 rate limit。
 */
import { createHash } from "node:crypto";
import type { MarketSurvey } from "./types";

const TTL_MS = Number(process.env.MARKET_CACHE_TTL_MS ?? 30 * 60 * 1000);
const MAX_ENTRIES = 256;

interface Entry {
  value: MarketSurvey;
  expiresAt: number;
}

const MEM = new Map<string, Entry>();

export function hashMarketKey(query: string): string {
  return createHash("sha256").update(query).digest("hex").slice(0, 24);
}

export function marketCacheGet(key: string): MarketSurvey | null {
  const e = MEM.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    MEM.delete(key);
    return null;
  }
  // LRU bump
  MEM.delete(key);
  MEM.set(key, e);
  return e.value;
}

export function marketCacheSet(key: string, value: MarketSurvey): void {
  if (MEM.size >= MAX_ENTRIES) {
    const oldest = MEM.keys().next().value;
    if (oldest) MEM.delete(oldest);
  }
  MEM.set(key, { value, expiresAt: Date.now() + TTL_MS });
}
