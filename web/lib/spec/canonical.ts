/**
 * CanonicalSkill —— 两类规范归一化后的中间模型。
 * 所有打分逻辑只读这个结构，不直接消费规范细节。
 */
export type SpecType = "claude" | "openclaw";
export type Language = "zh" | "en";

export interface SkillFile {
  path: string;          // 相对路径，例如 "references/best-practices.md"
  size: number;          // 字节数
  preview?: string;      // 文本文件前若干行预览（可选）
}

export interface Heading {
  level: number;         // 1-6
  text: string;
  line: number;          // 1-indexed, in body (frontmatter 之后)
}

export interface CanonicalSkill {
  spec: SpecType;
  language: Language;
  meta: Record<string, unknown>;
  body: string;                  // frontmatter 之后的 Markdown
  rawText: string;               // 完整原文
  headings: Heading[];
  files: SkillFile[];            // 整个 skill 目录下所有文件（单文件上传时仅含 SKILL.md）
  entryFile: string;             // 例如 "SKILL.md"
}
