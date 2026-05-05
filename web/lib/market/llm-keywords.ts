/**
 * LLM fallback：当本地规则无法抽出关键词，或 GitHub Search 返回 0 命中时，
 * 用一次轻量模型调用把中文/小众 skill 翻译成 3 个英文 GitHub search phrases。
 *
 * 注意：这是 market search 的兜底，不参与正式评分；失败时返回 []，不阻塞主流程。
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VER = "2023-06-01";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";
const DEFAULT_DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const TIMEOUT_MS = Number(process.env.MARKET_LLM_TIMEOUT_MS || 20_000);

export interface LlmKeywordInput {
  name?: string;
  description?: string;
  tags?: string[];
  body?: string;
  reason?: "no_keywords" | "zero_results";
  previousKeywords?: string[];
}

export interface LlmKeywordResult {
  keywords: string[];
  reason?: string;
  provider?: "anthropic" | "deepseek" | "none";
}

export async function translateMarketKeywords(input: LlmKeywordInput): Promise<LlmKeywordResult> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.DEEPSEEK_API_KEY) {
    return { keywords: [], provider: "none" };
  }

  const system = `You translate an Agent Skill into GitHub repository search phrases.

Return strict JSON only:
{"keywords":["phrase 1","phrase 2","phrase 3"],"reason":"short reason"}

Rules:
- Output exactly 3 English phrases, 1-3 words each.
- Prefer phrases likely to appear in GitHub repo names/descriptions.
- Do NOT output generic words like "ai", "tool", "agent", "assistant", "github".
- If previous keywords got zero results, choose broader but still relevant alternatives.
- Examples:
  中文"代码评审/PR审查" -> ["code review","pull request","reviewdog"]
  中文"MBTI性格测试" -> ["mbti personality","personality test","big five"]
  中文"邪修毒鸡汤/搞笑情绪价值" -> ["motivational quotes","sarcasm","meme generator"]
  中文"周报生成" -> ["weekly report","work summary","retrospective"]
  中文"发票生成器" -> ["invoice generator","pdf invoices","billing"]`;

  const user = JSON.stringify({
    fallback_reason: input.reason,
    previous_keywords: input.previousKeywords ?? [],
    name: input.name ?? "",
    description: input.description ?? "",
    tags: input.tags ?? [],
    body_preview: (input.body ?? "").slice(0, 3000),
  }, null, 2);

  try {
    const raw = process.env.ANTHROPIC_API_KEY
      ? await callAnthropic(system, user)
      : await callDeepseek(system, user);
    const parsed = parseJson(raw);
    const keywords = sanitizeKeywords(parsed?.keywords);
    return {
      keywords,
      reason: typeof parsed?.reason === "string" ? parsed.reason.slice(0, 160) : undefined,
      provider: process.env.ANTHROPIC_API_KEY ? "anthropic" : "deepseek",
    };
  } catch (e) {
    console.warn("[market/llm-keywords] fallback failed:", (e as Error).message);
    return { keywords: [] };
  }
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const resp = await fetchWithTimeout(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": ANTHROPIC_VER,
    },
    body: JSON.stringify({
      model: DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 256,
      temperature: 0.1,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!resp.ok) throw new Error(`anthropic ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const json = await resp.json();
  return (json?.content ?? [])
    .filter((p: { type: string }) => p.type === "text")
    .map((p: { text: string }) => p.text)
    .join("");
}

async function callDeepseek(system: string, user: string): Promise<string> {
  const resp = await fetchWithTimeout(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.DEEPSEEK_API_KEY!}`,
    },
    body: JSON.stringify({
      model: DEFAULT_DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 256,
      thinking: { type: "disabled" },
    }),
  });
  if (!resp.ok) throw new Error(`deepseek ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const json = await resp.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(raw: string): { keywords?: unknown; reason?: unknown } | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* noop */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function sanitizeKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const phrase = String(item ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = phrase.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 3) continue;
    if (["ai", "tool", "agent", "assistant", "github", "skill"].includes(phrase)) continue;
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(phrase);
    if (out.length >= 3) break;
  }
  return out;
}
