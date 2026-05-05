#!/usr/bin/env python3
"""
sync_rubric_to_ts.py —— 从 rubric.yaml 生成 web/lib/rubric/rubric.ts。

这是 `rubric.yaml` 与 TS 镜像之间的**唯一同步路径**。
规则：
- 只允许编辑 yaml；ts 由本脚本生成。
- 顶部保留一段"DO NOT EDIT"说明。
- 可在 CI 里跑 `--check` 检测漂移（若 ts 与 yaml 不一致则退出码 1）。

用法:
    python scripts/sync_rubric_to_ts.py          # 覆盖写 ts
    python scripts/sync_rubric_to_ts.py --check  # 只比对是否漂移
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.stderr.write("need pyyaml: pip install pyyaml\n")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
RUBRIC_YAML = ROOT / "rubric" / "rubric.yaml"
TS_OUT = ROOT.parent.parent / "web" / "lib" / "rubric" / "rubric.ts"

HEADER = """/**
 * rubric.ts —— AUTO-GENERATED from `skills/skill-scorer/rubric/rubric.yaml`.
 * DO NOT EDIT BY HAND. Run:
 *
 *   python skills/skill-scorer/scripts/sync_rubric_to_ts.py
 *
 * to regenerate. CI should run `--check` to guard against drift.
 */
import type { Rubric } from "./types";

export const RUBRIC: Rubric = """

FOOTER = ";\n"


def to_ts(obj) -> str:
    """把 Python 结构转为 TS 可读的字面量。利用 JSON 作为公共子集，键不加引号。"""
    # 先 json dump 再把字符串 key 的引号去掉（仅对安全 identifier）
    raw = json.dumps(obj, ensure_ascii=False, indent=2)
    # 仅做最小改动——保持 JSON 合法的 TS 字面量即可
    return raw


def build_rubric_ts(data: dict) -> str:
    # 使用 JSON 子集，TS 可直接 as const-ish 赋值给 Rubric 接口
    return HEADER + to_ts(data) + FOOTER


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="compare without writing; exit 1 on drift")
    args = ap.parse_args()

    data = yaml.safe_load(RUBRIC_YAML.read_text(encoding="utf-8"))
    generated = build_rubric_ts(data)

    if args.check:
        current = TS_OUT.read_text(encoding="utf-8") if TS_OUT.exists() else ""
        if current.strip() != generated.strip():
            sys.stderr.write(
                f"DRIFT: {TS_OUT} is out of sync with {RUBRIC_YAML}.\n"
                f"Run: python {Path(__file__).relative_to(ROOT.parent.parent)}\n"
            )
            return 1
        print("ok: rubric.ts matches rubric.yaml")
        return 0

    TS_OUT.write_text(generated, encoding="utf-8")
    print(f"wrote {TS_OUT.relative_to(ROOT.parent.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
