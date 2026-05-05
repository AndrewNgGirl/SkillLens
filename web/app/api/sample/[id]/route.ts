import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

// Server-side endpoint that returns a curated example skill
// (entry SKILL.md + sibling files) so the frontend can drop it into
// the same pipeline as a real upload.
//
// Whitelist of allowed example IDs → relative path under repo root.
const SAMPLES: Record<string, string> = {
  "pr-reviewer": "skills/skill-scorer/examples/pr-reviewer",
};

interface SampleFile {
  path: string;
  size: number;
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
      out.push({ path: path.relative(base, full).replace(/\\/g, "/"), size: stat.size });
    }
  }
  return out;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rel = SAMPLES[id];
  if (!rel) {
    return NextResponse.json({ error: "unknown_sample" }, { status: 404 });
  }
  // process.cwd() is the web/ directory in `next start`; the examples
  // live two levels up under skills/. Resolve via parent walk.
  const repoRoot = path.resolve(process.cwd(), "..");
  const sampleDir = path.join(repoRoot, rel);
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
