"use client";
import { useRef, useState } from "react";
import type { Lang } from "@/lib/i18n/messages";
import { MESSAGES } from "@/lib/i18n/messages";
import { loadFromFileList, type LoadedSkill } from "@/lib/spec/loader";

interface Props {
  lang: Lang;
  onLoad: (loaded: LoadedSkill) => void;
}

export default function Uploader({ lang, onLoad }: Props) {
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

  async function loadSample() {
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/sample/pr-reviewer");
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || j.error || `HTTP ${r.status}`);
      }
      const payload = (await r.json()) as LoadedSkill;
      onLoad(payload);
    } catch (e) {
      setError((e as Error).message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
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
          <button
            onClick={loadSample}
            className="rounded-full border border-brand-200 hover:bg-brand-50 px-4 py-1.5 text-sm text-brand-700"
          >
            {t.sampleLabel}
          </button>
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
