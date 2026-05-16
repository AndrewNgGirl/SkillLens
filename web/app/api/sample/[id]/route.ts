import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// Server-side endpoint that returns a curated example skill
// (entry SKILL.md + sibling files) so the frontend can drop it into
// the same pipeline as a real upload.
//
// Whitelist of allowed example IDs → directory name under skills/skill-scorer/examples.
const SAMPLES: Record<string, string> = {
  "pr-reviewer": "pr-reviewer",
  // Pipeline showcase fixtures: pr-pipeline (3 sub-skills, inline density) and
  // mega-pipeline (53 sub-skills, wide-banner overflow density). Used by the
  // landing page to demo both sub-skill layouts.
  "pr-pipeline": "pr-pipeline",
  "mega-pipeline": "mega-pipeline",
  "startup-fundraising-advisor": "startup-fundraising-advisor",
  "quant-trading-researcher": "quant-trading-researcher",
  "stock-trading-analyst": "stock-trading-analyst",
  "securities-research-analyst": "securities-research-analyst",
  "banking-workflow-assistant": "banking-workflow-assistant",
  "financial-education-coach": "financial-education-coach",
  "financial-data-analysis-agent": "financial-data-analysis-agent",
  "finance-scenario-advisor": "finance-scenario-advisor",
};

const SAMPLE_ROOT = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  "..",
  "skills",
  "skill-scorer",
  "examples",
);

interface SampleFile {
  path: string;
  size: number;
  preview?: string;
}

interface SamplePayload {
  rawText: string;
  files: SampleFile[];
  entryFile: string;
  rootName: string;
}

async function walk(dir: string, base: string): Promise<SampleFile[]> {
  const out: SampleFile[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full, base)));
    } else if (e.isFile()) {
      const stat = await fs.stat(full);
      const rel = path.relative(base, full).replace(/\\/g, "/");
      const isText = /\.(md|markdown|yaml|yml|txt|json|py|ts|tsx|js|jsx|sh|toml|cfg|ini)$/i.test(rel);
      const preview = isText && stat.size < 200 * 1024
        ? previewOf(await fs.readFile(full, "utf-8"))
        : undefined;
      out.push({ path: rel, size: stat.size, preview });
    }
  }
  return out;
}

function previewOf(text: string): string {
  return text.length <= 4000 ? text : `${text.slice(0, 4000)}\n...(truncated)`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sampleName = SAMPLES[id];
  if (!sampleName) {
    return NextResponse.json({ error: "unknown_sample" }, { status: 404 });
  }
  const sampleDir = path.join(SAMPLE_ROOT, sampleName);
  try {
    const entry = path.join(sampleDir, "SKILL.md");
    const rawText = await fs.readFile(entry, "utf-8");
    const files = await walk(sampleDir, sampleDir);
    const payload: SamplePayload = {
      rawText,
      files,
      entryFile: "SKILL.md",
      rootName: id,
    };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "sample_load_failed", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
