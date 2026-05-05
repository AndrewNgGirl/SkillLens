import type { SpecType, SkillFile } from "./canonical";

/**
 * 依据目录特征判定 skill 所属规范。
 * 只展示两类：有 skill.yaml / skill.yml 视为 openclaw；其他 SKILL.md 统一归为 claude。
 */
export function detectSpec(_meta: Record<string, unknown>, files: SkillFile[]): SpecType {
  const paths = files.map((f) => f.path.toLowerCase());

  if (paths.some((p) => p.endsWith("skill.yaml") || p.endsWith("skill.yml"))) {
    return "openclaw";
  }

  return "claude";
}

export function detectLanguage(text: string): "zh" | "en" {
  let cjk = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x4e00 && code <= 0x9fff) cjk++;
  }
  return cjk / Math.max(text.length, 1) > 0.05 ? "zh" : "en";
}
