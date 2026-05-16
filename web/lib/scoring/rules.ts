/**
 * 规则引擎：对 rubric 中 type=rule 的细则做确定性评估。
 * 保持与 Python CLI（skills/skill-scorer/scripts/score.py）行为等价。
 *
 * v3：rubric 改为 pillars[].dimensions[].checks[]，遍历跟着改。
 *      新增成本/稳定性相关的 rule 实现。
 */
import type { CanonicalSkill } from "../spec/canonical";
import type { CheckResult, CheckStatus, Rubric } from "../rubric/types";

type EvalOut = { status: CheckStatus; evidence: string };

const toRatio = (s: CheckStatus): number | null =>
  s === "pass" ? 1 : s === "partial" ? 0.5 : s === "fail" ? 0 : null;

export function runRuleCheck(
  checkId: string,
  skill: CanonicalSkill,
  rubric: Rubric,
): EvalOut {
  const { meta, body, headings, files } = skill;
  const specCfg = rubric.specs[skill.spec];

  const metaRec = meta as Record<string, unknown>;
  const desc = String((metaRec.description as string) ?? "");
  const name = String((metaRec.name as string) ?? "");

  switch (checkId) {
    // ---- writeup → metadata ----
    case "meta.frontmatter_valid": {
      const ok = metaRec && !("__parse_error__" in metaRec) && Object.keys(metaRec).length > 0;
      return ok
        ? { status: "pass", evidence: "frontmatter 可正常解析" }
        : { status: "fail", evidence: "缺少 frontmatter 或格式无效" };
    }
    case "meta.required_fields": {
      const missing = specCfg.required_fields.filter((f) => !(f in metaRec));
      if (missing.length === 0) return { status: "pass", evidence: `必填字段齐全：${specCfg.required_fields.join(", ")}` };
      if (missing.length < specCfg.required_fields.length) return { status: "partial", evidence: `缺少字段：${missing.join(", ")}` };
      return { status: "fail", evidence: `必填字段全部缺失：${missing.join(", ")}` };
    }
    case "meta.recommended_fields": {
      const rec = specCfg.recommended_fields ?? [];
      if (rec.length === 0) return { status: "pass", evidence: "不适用" };
      const present = rec.filter((f) => f in metaRec);
      if (present.length === rec.length) return { status: "pass", evidence: `推荐字段齐全：${rec.join(", ")}` };
      if (present.length > 0) return { status: "partial", evidence: `已有：${present.join(", ")}；缺少：${rec.filter((f) => !(f in metaRec)).join(", ")}` };
      return { status: "fail", evidence: `推荐字段都未填写，建议补充：${rec.join(", ")}` };
    }
    case "meta.name_format": {
      const ok = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
      return { status: ok ? "pass" : "fail", evidence: `name=${JSON.stringify(name)}` };
    }

    // ---- writeup → discoverability ----
    case "disc.length_ok": {
      const n = desc.length;
      const budget = specCfg.desc_budget_chars;
      if (n === 0) return { status: "fail", evidence: "description 为空" };
      if (n > budget) return { status: "partial", evidence: `${n} > ${budget} chars` };
      if (n < 40) return { status: "partial", evidence: `只有 ${n} 个字符，可能过短` };
      return { status: "pass", evidence: `${n} chars (<= ${budget})` };
    }
    case "disc.has_trigger_cue": {
      const cues = [/use when/i, /用于/, /当用户/, /适用于/, /triggered when/i, /when the user/i];
      const hit = cues.some((re) => re.test(desc));
      return { status: hit ? "pass" : "fail", evidence: hit ? "已找到触发线索" : "description 中缺少 'Use when' / '用于' 等触发线索" };
    }
    case "disc.third_person": {
      const m = /\b(I will|I'll)\b|我将|我会/i.exec(desc);
      return m
        ? { status: "fail", evidence: `检测到第一人称：${m[0]}` }
        : { status: "pass", evidence: "已使用第三人称表达" };
    }

    // ---- writeup → structure ----
    case "struct.has_headings": {
      const h2 = headings.filter((h) => h.level === 2).length;
      if (h2 >= 2) return { status: "pass", evidence: `共有 ${h2} 个 H2 章节` };
      if (h2 === 1) return { status: "partial", evidence: "只有 1 个 H2 章节" };
      return { status: "fail", evidence: "没有 H2 章节" };
    }
    case "struct.has_workflow": {
      const titles = headings.map((h) => h.text.toLowerCase()).join(" | ");
      const hit = ["workflow", "steps", "how it works", "步骤", "流程", "使用流程"].some((k) => titles.includes(k));
      return { status: hit ? "pass" : "fail", evidence: hit ? "已找到 Workflow / steps 章节" : "缺少 Workflow / steps 章节" };
    }
    case "struct.md_well_formed": {
      const fences = (body.match(/```/g) ?? []).length;
      const ok = fences % 2 === 0;
      return { status: ok ? "pass" : "fail", evidence: `${fences} 个代码块围栏，${ok ? "已成对闭合" : "未闭合"}` };
    }

    // ---- writeup → actionability (rule-only) ----
    case "act.tool_calls_clear": {
      const hasCode = /```[\s\S]*?```/m.test(body);
      return { status: hasCode ? "pass" : "partial", evidence: hasCode ? "已有可复制的代码块" : "没有 fenced code block" };
    }
    case "act.has_examples": {
      const hit = /example|示例|样例|usage|用法/i.test(body) ||
        headings.some((h) => /example|示例|usage|用法/i.test(h.text));
      return { status: hit ? "pass" : "fail", evidence: hit ? "已找到示例/用法内容" : "缺少 Example / usage 章节" };
    }

    // ---- writeup → safety ----
    case "safe.dangerous_ops_flagged": {
      const dangers = body.match(/rm -rf|git push --force|DROP TABLE|--no-verify/gi) ?? [];
      if (dangers.length === 0) return { status: "pass", evidence: "未检测到破坏性操作" };
      const flagged = /warning|警告|危险|caution|confirm/i.test(body);
      return {
        status: flagged ? "pass" : "partial",
        evidence: `${dangers.length} 个破坏性操作；${flagged ? "已有警告" : "未标注警告"}`,
      };
    }
    case "safe.secrets_policy": {
      const leak = /sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}/.exec(body);
      return leak
        ? { status: "fail", evidence: `疑似写入明文密钥：${leak[0].slice(0, 10)}...` }
        : { status: "pass", evidence: "未检测到明文密钥" };
    }

    // ---- writeup → maintainability ----
    case "maint.has_version":
      return "version" in metaRec
        ? { status: "pass", evidence: `version=${JSON.stringify(metaRec.version)}` }
        : { status: "fail", evidence: "缺少 version 字段" };
    case "maint.declares_deps": {
      const depFiles = ["requirements.txt", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"];
      const hit = files.some((f) => depFiles.some((d) => f.path.toLowerCase().endsWith(d.toLowerCase())));
      const mentioned = /depend|依赖|requirement|环境/i.test(body);
      if (hit) return { status: "pass", evidence: "已找到依赖清单文件" };
      if (mentioned) return { status: "partial", evidence: "只在正文中提到依赖，缺少清单文件" };
      return { status: "fail", evidence: "未声明依赖或运行环境" };
    }
    case "maint.has_tests": {
      const hit = files.some((f) => /test/i.test(f.path));
      const singleFile = files.length <= 1;
      if (singleFile) return { status: "partial", evidence: "单文件上传，无法确认是否有 tests/" };
      return { status: hit ? "pass" : "fail", evidence: hit ? "已找到测试文件" : "未找到测试文件" };
    }
    case "maint.has_changelog": {
      const hit = files.some((f) => /changelog/i.test(f.path)) || /changelog|更新日志/i.test(body);
      return { status: hit ? "pass" : "fail", evidence: hit ? "已找到 changelog / 更新记录" : "缺少 changelog / 更新记录" };
    }

    // ---- runtime_cost → context budget ----
    case "cost.context_budget.skill_md_size": {
      const n = body.length;
      if (n <= 6000) return { status: "pass", evidence: `${n} chars（约 ${Math.round(n / 3)} tokens）` };
      if (n <= 12000) return { status: "partial", evidence: `${n} chars，建议控制在 6000 以内` };
      return { status: "fail", evidence: `${n} chars 过长，每次调用都会消耗这部分上下文` };
    }
    case "cost.reference_layering.has_dirs": {
      const layered = files.some((f) => /^(references|scripts|assets)\//i.test(f.path));
      const isSingleFile = files.length <= 1;
      if (isSingleFile) return { status: "partial", evidence: "单文件上传，无法确认是否使用分层目录" };
      return { status: layered ? "pass" : "partial", evidence: layered ? "已检测到 references/ scripts/ assets/ 等分层目录" : "未检测到 references/ scripts/ assets/ 分层目录" };
    }

    // ---- runtime_cost → external dependencies ----
    case "cost.external_dependencies.declared": {
      // 算两条信息源：依赖清单文件 + ## Dependencies / ## 依赖 章节
      const depFiles = ["requirements.txt", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"];
      const hasManifest = files.some((f) => depFiles.some((d) => f.path.toLowerCase().endsWith(d.toLowerCase())));
      const hasDepHeading = headings.some((h) =>
        /^(dependenc|依赖|requirements?|external|api keys?|cost)/i.test(h.text.trim()));
      if (hasManifest && hasDepHeading) return { status: "pass", evidence: "已同时提供依赖清单和 Dependencies 说明" };
      if (hasManifest || hasDepHeading) return { status: "partial", evidence: hasManifest ? "只有依赖清单，缺少文字说明" : "只有依赖说明，缺少清单文件" };
      return { status: "fail", evidence: "未声明外部依赖" };
    }

    // ---- reliability → script fallback ----
    case "rel.script_fallback.has_scripts": {
      const hasScriptsDir = files.some((f) => /^scripts\//i.test(f.path));
      const hasCodeFiles = files.some((f) => /\.(py|js|ts|sh|rb|go|rs)$/i.test(f.path));
      const isSingleFile = files.length <= 1;
      if (isSingleFile) return { status: "partial", evidence: "单文件上传，无法确认是否有 scripts/" };
      if (hasScriptsDir) return { status: "pass", evidence: "已找到 scripts/ 目录" };
      if (hasCodeFiles) return { status: "partial", evidence: "有代码文件，但没有专门的 scripts/ 目录" };
      return { status: "fail", evidence: "没有脚本兜底，skill 基本是纯文本流程" };
    }

    // ---- reliability → output validation ----
    case "rel.output_validation.declared": {
      const titles = headings.map((h) => h.text.toLowerCase()).join(" | ");
      const hasOutputs = /output|输出|returns?|结果/i.test(titles);
      // 简单启发式：Outputs 章节后跟 JSON / schema / 字段表，认为是声明
      const hasSchemaHint = /\bjson schema\b|jsonschema|pydantic|zod|interface\s+\w+|"type":\s*"|字段[:：]/i.test(body);
      if (hasOutputs && hasSchemaHint) return { status: "pass", evidence: "已找到 Outputs 章节和 schema / typed declaration" };
      if (hasOutputs) return { status: "partial", evidence: "有 Outputs 章节，但缺少 schema / typed declaration" };
      return { status: "fail", evidence: "缺少 Outputs 章节和 schema" };
    }

    // ---- reliability → pipeline-only sub-skill self-containment ----
    // Mirrors score.py:run_rule for rel.pipeline_subskill_quality.self_contained.
    // Only emitted for pipeline skills (applies_to=[pipeline]) — otherwise the
    // case is short-circuited upstream by check_applies and never reaches here.
    case "rel.pipeline_subskill_quality.self_contained": {
      const subSkillFiles = files.filter(
        (f) => f.path !== skill.entryFile && /(^|\/)SKILL\.md$/i.test(f.path),
      );
      if (subSkillFiles.length === 0) {
        return { status: "n_a", evidence: "未发现子 SKILL.md（applies_to 应阻断到此）" };
      }
      const headRe = /^#{1,6}\s+(.+)$/gm;
      const whenRe = /when to use|trigger|何时使用|触发|适用/i;
      const flowRe = /workflow|steps?|流程|步骤|how it works/i;
      const weak: string[] = [];
      for (const f of subSkillFiles) {
        const text = f.preview ?? "";
        const heads: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = headRe.exec(text)) !== null) heads.push(m[1].trim());
        const headBlob = heads.join(" | ");
        const hasWhen = whenRe.test(headBlob) || whenRe.test(text.slice(0, 400));
        const hasFlow = flowRe.test(headBlob);
        if (!(hasWhen && hasFlow)) {
          const missing: string[] = [];
          if (!hasWhen) missing.push("when-to-use");
          if (!hasFlow) missing.push("workflow");
          weak.push(`${f.path} (missing ${missing.join(",")})`);
        }
      }
      const total = subSkillFiles.length;
      const ok = total - weak.length;
      if (weak.length === 0) {
        return { status: "pass", evidence: `${total} 个子 SKILL.md 都有 when-to-use + workflow 章节` };
      }
      const sample = weak.slice(0, 3).join("; ") + (weak.length > 3 ? `; +${weak.length - 3} more` : "");
      if (ok === 0) {
        return { status: "fail", evidence: `0/${total} 子 skill 自洽；如 ${weak[0]}` };
      }
      const ratio = ok / total;
      return {
        status: ratio >= 0.6 ? "partial" : "fail",
        evidence: `${ok}/${total} 子 skill 自洽；薄弱：${sample}`,
      };
    }

    // ---- bonus ----
    case "port.spec_agnostic_frontmatter": {
      const known = new Set(["name", "description", "version", "license", "tags", "author"]);
      const extra = Object.keys(metaRec).filter((k) => !known.has(k) && !k.startsWith("__"));
      return extra.length === 0
        ? { status: "pass", evidence: "frontmatter 字段跨规范通用" }
        : { status: "partial", evidence: `存在额外字段：${extra.join(", ")}` };
    }
  }

  return { status: "n_a", evidence: "规则未实现，通常应由 SkillLens 深度评测" };
}

export function scoreAllRules(skill: CanonicalSkill, rubric: Rubric): Map<string, CheckResult> {
  const results = new Map<string, CheckResult>();
  const collect = (checks: { id: string; type: "rule" | "llm"; weight: number }[]) => {
    for (const c of checks) {
      if (c.type !== "rule") continue;
      const { status, evidence } = runRuleCheck(c.id, skill, rubric);
      results.set(c.id, {
        id: c.id, type: "rule", weight: c.weight, status, evidence,
        ratio: toRatio(status),
      });
    }
  };
  rubric.pillars.forEach((p) =>
    p.dimensions.forEach((d) => collect(d.checks)),
  );
  rubric.bonus.forEach((b) => collect(b.checks));
  return results;
}
