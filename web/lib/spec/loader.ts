/**
 * 多源加载器：把"一个 File / 一组 File / 一个 zip" 归一化为
 *   { rawText, files[], entryFile }
 * 再交给 parser.ts。
 *
 * 浏览器环境使用；依赖 jszip（已在 package.json）。
 */
import JSZip from "jszip";
import type { SkillFile } from "./canonical";

export interface LoadedSkill {
  rawText: string;           // entry file 的完整文本
  files: SkillFile[];        // skill 目录下的所有文件
  entryFile: string;         // 相对路径
  rootName: string;          // 文件夹名 / zip 名 / 单文件名
}

const TEXT_EXT = /\.(md|markdown|yaml|yml|txt|json|py|ts|tsx|js|jsx|sh|toml|cfg|ini)$/i;
const MAX_FILE_PREVIEW = 4000; // 每个文本文件最多 preview 4KB

export async function loadFromFileList(files: FileList | File[]): Promise<LoadedSkill> {
  const list = Array.from(files);
  if (list.length === 0) throw new Error("no files");

  // 单文件快速路径
  if (list.length === 1) {
    const f = list[0];
    if (f.name.toLowerCase().endsWith(".zip")) {
      return loadFromZip(f);
    }
    const text = await f.text();
    return {
      rawText: text,
      files: [{ path: f.name, size: f.size, preview: previewOf(text) }],
      entryFile: f.name,
      rootName: stripExt(f.name),
    };
  }

  // 多文件（文件夹）路径：webkitRelativePath 提供了目录结构
  const withRel = list.map((f) => ({
    file: f,
    rel: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
  }));

  const rootSegment = withRel[0].rel.split("/")[0];
  const stripRoot = withRel.every((x) => x.rel.startsWith(rootSegment + "/"));

  const fileRecords: SkillFile[] = [];
  let entryText = "";
  let entryPath = "";

  for (const { file, rel } of withRel) {
    const path = stripRoot ? rel.slice(rootSegment.length + 1) : rel;
    const isText = TEXT_EXT.test(path);
    let preview: string | undefined;
    if (isText && file.size < 1024 * 200) {
      const text = await file.text();
      preview = previewOf(text);
      if (path === "SKILL.md" || path.toLowerCase() === "skill.md") {
        entryText = text;
        entryPath = path;
      }
    }
    fileRecords.push({ path, size: file.size, preview });
  }

  if (!entryText) {
    throw new Error("SKILL.md not found in uploaded folder");
  }

  return {
    rawText: entryText,
    files: fileRecords,
    entryFile: entryPath,
    rootName: stripRoot ? rootSegment : "skill",
  };
}

export async function loadFromZip(zipFile: File): Promise<LoadedSkill> {
  const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
  const entries = Object.values(zip.files).filter((e) => !e.dir);

  // zip 内单层根目录归一化
  const firstSegs = new Set(entries.map((e) => e.name.split("/")[0]));
  const hasSingleRoot = firstSegs.size === 1 && entries.every((e) => e.name.includes("/"));
  const root = hasSingleRoot ? [...firstSegs][0] : "";

  const files: SkillFile[] = [];
  let entryText = "";
  let entryPath = "";

  for (const entry of entries) {
    const rel = root ? entry.name.slice(root.length + 1) : entry.name;
    if (!rel) continue;
    const isText = TEXT_EXT.test(rel);
    let preview: string | undefined;
    let size = 0;

    if (isText) {
      const text = await entry.async("string");
      size = text.length;
      preview = previewOf(text);
      if (rel === "SKILL.md" || rel.toLowerCase() === "skill.md") {
        entryText = text;
        entryPath = rel;
      }
    } else {
      const buf = await entry.async("uint8array");
      size = buf.byteLength;
    }
    files.push({ path: rel, size, preview });
  }

  if (!entryText) throw new Error("SKILL.md not found in uploaded zip");

  return {
    rawText: entryText,
    files,
    entryFile: entryPath,
    rootName: root || stripExt(zipFile.name),
  };
}

function previewOf(text: string): string {
  return text.length <= MAX_FILE_PREVIEW ? text : text.slice(0, MAX_FILE_PREVIEW) + "\n…(truncated)";
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}
