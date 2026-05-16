"use client";
import { useRef, useState } from "react";
import type { Lang } from "@/lib/i18n/messages";
import { MESSAGES } from "@/lib/i18n/messages";
import { loadFromFileList, type LoadedSkill } from "@/lib/spec/loader";
import type { SkillType } from "@/lib/llm/types";

export type SkillTypeChoice = SkillType | "auto";

/**
 * One "load sample" button on the dropzone. Pre-bundled skills (e.g. the
 * pr-pipeline / mega-pipeline pipeline showcases) so non-uploading visitors
 * can experience both sub-skill density variants without supplying their own
 * SKILL.md package.
 */
export interface SampleEntry {
  id: string;
  /** Visible label, fallback to the i18n default when omitted. */
  label?: string;
  /** Tooltip / aria-description shown on hover. */
  hint?: string;
  /** Optional skill-type override applied right before loading the sample.
   *  Lets a "Pipeline showcase" sample auto-select the pipeline lens. */
  skillType?: SkillTypeChoice;
}

interface Props {
  lang: Lang;
  onLoad: (loaded: LoadedSkill) => void;
  /** Single-sample mode (legacy). Used when only one example is appropriate
   *  for the current scenario, e.g. the finance-scenario flow. */
  sampleId?: string;
  sampleLabel?: string;
  /** Multi-sample mode. When provided, the dropzone renders one button per
   *  entry instead of the single sampleId button. */
  samples?: SampleEntry[];
  skillTypeChoice?: SkillTypeChoice;
  onSkillTypeChange?: (choice: SkillTypeChoice) => void;
}

const SKILL_TYPE_OPTIONS: Array<{
  id: SkillTypeChoice;
  zh: { label: string; hint: string };
  en: { label: string; hint: string };
}> = [
  {
    id: "auto",
    zh: { label: "自动识别", hint: "默认。按子 SKILL.md 数量推断。" },
    en: { label: "Auto", hint: "Default. Inferred from child SKILL.md count." },
  },
  {
    id: "atomic",
    zh: { label: "Atomic", hint: "单一职责，一份 SKILL.md。" },
    en: { label: "Atomic", hint: "Single-purpose, one SKILL.md." },
  },
  {
    id: "pipeline",
    zh: { label: "Pipeline", hint: "主 skill 编排多个子 SKILL.md / 子 agent。" },
    en: { label: "Pipeline", hint: "Orchestrator over multiple child SKILL.md / sub-agents." },
  },
  {
    id: "composite",
    zh: { label: "Composite", hint: "多个互不耦合的工具集，主 skill 只做导航。" },
    en: { label: "Composite", hint: "Independent toolkit bundle; root only navigates." },
  },
];

export default function Uploader({
  lang,
  onLoad,
  sampleId = "pr-reviewer",
  sampleLabel,
  samples,
  skillTypeChoice = "auto",
  onSkillTypeChange,
}: Props) {
  const t = MESSAGES[lang];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [pasteBuf, setPasteBuf] = useState("");

  async function load(files: FileList | File[] | null) {
    if (!files || (files as FileList).length === 0) return;
    setError("");
    setBusy(true);
    try {
      const loaded = await loadFromFileList(files);
      onLoad(loaded);
    } catch (e) {
      setError((e as Error).message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function loadPasted() {
    if (!pasteBuf.trim()) return;
    onLoad({
      rawText: pasteBuf,
      files: [{ path: "SKILL.md", size: pasteBuf.length }],
      entryFile: "SKILL.md",
      rootName: "pasted",
    });
  }

  async function loadSample(id: string, skillType?: SkillTypeChoice) {
    setError("");
    setBusy(true);
    try {
      const r = await fetch(`/api/sample/${id}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || j.error || `HTTP ${r.status}`);
      }
      const payload = (await r.json()) as LoadedSkill;
      // Apply the sample's preferred lens before announcing the load so the
      // first review pass picks up the right rubric (pipeline vs atomic).
      if (skillType && onSkillTypeChange) {
        onSkillTypeChange(skillType);
      }
      onLoad(payload);
    } catch (e) {
      setError((e as Error).message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {onSkillTypeChange && (
        <section className="glass rounded-2xl p-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="text-sm font-semibold text-brand-900">
              {lang === "zh" ? "skill 类型" : "Skill type"}
            </h3>
            <p className="text-xs text-stone-500">
              {lang === "zh"
                ? "影响 SkillLens 评估视角和 LLM 改进建议；多 skill 嵌套时优先选 pipeline。"
                : "Sets the evaluation lens and tunes LLM fix recommendations. For multi-skill packages choose pipeline."}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {SKILL_TYPE_OPTIONS.map((opt) => {
              const active = skillTypeChoice === opt.id;
              const t = lang === "zh" ? opt.zh : opt.en;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSkillTypeChange(opt.id)}
                  className={[
                    "rounded-xl px-3 py-2 text-left ring-1 transition cursor-pointer",
                    active
                      ? "bg-brand-500 text-white ring-brand-500 shadow-sm"
                      : "bg-white/70 text-brand-800 ring-brand-100 hover:bg-white hover:ring-brand-200",
                  ].join(" ")}
                  aria-pressed={active}
                >
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className={["text-[11px] leading-snug mt-0.5", active ? "text-white/85" : "text-stone-500"].join(" ")}>
                    {t.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const items = e.dataTransfer.files;
          if (items?.length) load(items);
        }}
        className={[
          "glass rounded-2xl p-10 text-center transition",
          "border border-dashed border-brand-200 hover:border-brand-500/70",
          dragOver ? "ring-2 ring-brand-500 border-brand-500/60" : "",
          busy ? "opacity-60 pointer-events-none" : "",
        ].join(" ")}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.markdown,.txt,.yaml,.yml,.zip"
          className="hidden"
          onChange={(e) => load(e.target.files)}
        />
        <input
          ref={dirInputRef}
          type="file"
          {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
          multiple
          className="hidden"
          onChange={(e) => load(e.target.files)}
        />

        <div className="text-lg font-medium">
          {busy
            ? (lang === "zh" ? "解析中…" : "Parsing…")
            : dragOver
              ? t.dropFile
              : t.uploadHint}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-brand-500 hover:bg-brand-600 text-white px-4 py-1.5 text-sm"
          >
            {lang === "zh" ? "选择 SKILL.md / .zip" : "SKILL.md / .zip"}
          </button>
          <button
            onClick={() => dirInputRef.current?.click()}
            className="rounded-full border border-brand-200 hover:bg-brand-50 px-4 py-1.5 text-sm text-brand-700"
          >
            {lang === "zh" ? "选择文件夹" : "Folder"}
          </button>
          {samples && samples.length > 0 ? (
            samples.map((s) => (
              <button
                key={s.id}
                onClick={() => loadSample(s.id, s.skillType)}
                title={s.hint}
                className="rounded-full border border-brand-200 hover:bg-brand-50 px-4 py-1.5 text-sm text-brand-700"
              >
                {s.label ?? t.sampleLabel}
              </button>
            ))
          ) : (
            <button
              onClick={() => loadSample(sampleId)}
              className="rounded-full border border-brand-200 hover:bg-brand-50 px-4 py-1.5 text-sm text-brand-700"
            >
              {sampleLabel ?? t.sampleLabel}
            </button>
          )}
        </div>
        {error && (
          <div className="mt-4 text-sm text-rose-600 bg-rose-50 ring-1 ring-rose-200 rounded-lg px-3 py-2 inline-block">
            {error}
          </div>
        )}
      </div>

      <details className="glass rounded-2xl p-4">
        <summary className="cursor-pointer text-sm text-stone-600">{t.pasteHint}</summary>
        <div className="mt-3 space-y-2">
          <textarea
            value={pasteBuf}
            onChange={(e) => setPasteBuf(e.target.value)}
            rows={8}
            placeholder={"---\nname: my-skill\ndescription: ...\n---"}
            className="w-full rounded-lg border border-brand-100 bg-white/80 p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <button
            onClick={loadPasted}
            className="rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 text-sm"
          >
            {t.pasteCta}
          </button>
        </div>
      </details>
    </div>
  );
}
