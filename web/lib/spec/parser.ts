import matter from "gray-matter";
import type { CanonicalSkill, Heading, SkillFile } from "./canonical";
import { detectSpec, detectLanguage } from "./detector";

/**
 * 把原始文本 + 文件清单解析为 CanonicalSkill。
 * 单文件上传：files 仅含 SKILL.md 一项。
 * 文件夹/zip 上传：files 含完整目录；rawText 来自 entry file。
 */
export function parseSkill(params: {
  rawText: string;
  files?: SkillFile[];
  entryFile?: string;
}): CanonicalSkill {
  const rawText = params.rawText;
  const entryFile = params.entryFile ?? "SKILL.md";

  let meta: Record<string, unknown> = {};
  let body = rawText;
  try {
    const parsed = matter(rawText);
    meta = (parsed.data ?? {}) as Record<string, unknown>;
    body = parsed.content ?? rawText;
  } catch {
    meta = { __parse_error__: true };
  }

  const headings = extractHeadings(body);
  const files: SkillFile[] = params.files ?? [
    { path: entryFile, size: rawText.length },
  ];

  return {
    spec: detectSpec(meta, files),
    language: detectLanguage(body),
    meta,
    body,
    rawText,
    headings,
    files,
    entryFile,
  };
}

function extractHeadings(body: string): Heading[] {
  const out: Heading[] = [];
  const lines = body.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
  }
  return out;
}
