/**
 * Detect child SKILL.md files inside a CanonicalSkill bundle and extract a
 * lightweight summary (path + frontmatter name / description + body size).
 *
 * Mirrors the CLI's `parse_skill` behaviour so the web UI's "skill 类型 / 子
 * SKILL.md" cards stay 1:1 with the HTML report rendered by render_report.py.
 *
 * Frontmatter parsing here is intentionally minimal — it only reads the YAML
 * `name` and `description` lines from the file preview (max 4 KB stored on the
 * client). Multi-line block scalars (`|` / `>`) collapse to the first
 * indented line, which is "good enough" for UI display.
 */
import type { CanonicalSkill } from "./canonical";
import type { SubSkillSummary } from "@/lib/rubric/types";
import type { SkillType } from "@/lib/llm/types";

export interface SubSkillResolution {
  skillType: SkillType;
  /** true when skillType comes from auto-detection (count of child SKILL.md), false when user picked it explicitly. */
  autoDetected: boolean;
  subSkills: SubSkillSummary[];
}

/**
 * @param skill   parsed CanonicalSkill (post zip / single-file load)
 * @param override "auto" | "atomic" | "pipeline" | "composite". `undefined` or
 *   "auto" defers to detection by sub-SKILL.md count.
 */
export function resolveSubSkills(
  skill: CanonicalSkill,
  override?: SkillType | "auto",
): SubSkillResolution {
  const subSkills: SubSkillSummary[] = skill.files
    .filter((f) => f.path !== skill.entryFile && /(^|\/)SKILL\.md$/i.test(f.path))
    .map((f) => {
      const fm = extractNameAndDescription(f.preview);
      return {
        path: f.path,
        name: fm.name,
        description: fm.description,
        bodyChars: f.size,
      } satisfies SubSkillSummary;
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  const detected: SkillType = subSkills.length > 0 ? "pipeline" : "atomic";
  const skillType: SkillType =
    override && override !== "auto" ? override : detected;
  const autoDetected = !override || override === "auto";

  return { skillType, autoDetected, subSkills };
}

function extractNameAndDescription(preview: string | undefined): {
  name?: string;
  description?: string;
} {
  if (!preview) return {};
  const block = readFrontmatterBlock(preview);
  if (!block) return {};
  return {
    name: readTopLevelString(block, "name"),
    description: readTopLevelString(block, "description"),
  };
}

function readFrontmatterBlock(text: string): string | null {
  // Frontmatter must start at the very beginning of the file.
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  return text.slice(3, end).replace(/^\r?\n/, "");
}

function readTopLevelString(block: string, key: string): string | undefined {
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = new RegExp(`^${key}\\s*:\\s*(.*)$`, "i").exec(line);
    if (!m) continue;
    const raw = m[1].trim();
    // Block scalar (| or >) — fold the first non-empty indented line.
    if (raw === "|" || raw === ">" || raw === "|-" || raw === ">-") {
      const folded: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        if (/^\s+\S/.test(next)) {
          folded.push(next.trim());
        } else if (next.trim() === "") {
          continue;
        } else {
          break;
        }
      }
      return folded.join(" ").trim() || undefined;
    }
    return stripQuotes(raw);
  }
  return undefined;
}

function stripQuotes(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}
