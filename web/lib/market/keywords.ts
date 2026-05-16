/**
 * 从 SKILL.md frontmatter + body 抽取 GitHub 搜索关键词。
 *
 * 设计原则：
 *  - 纯规则、零外部依赖（无需再加一次 LLM 调用）
 *  - 输出 1-3 个**多词短语**（单个词在 GitHub 搜出来全是噪音）
 *  - 拼成 GitHub query 时加 `in:name,description` + `stars:>3` + `archived:false` 等
 *    qualifier 提升精度
 */

const STOPWORDS = new Set([
  "the","a","an","of","for","to","in","on","with","by","and","or","is","are","be",
  "this","that","it","you","your","we","our","i","my","its",
  "skill","skills","agent","agents","ai","tool","tools","use","when","user","users","help","helper",
  "claude","cursor","openclaw","anthropic","openai","gpt",
  "make","makes","do","does","provide","get","got","run","runs","write","writes",
  "good","best","new","great","easy","simple","based","support","supports",
  // 太通用的赛道名（单独出现没信息量；要靠组合才能定位）
  "github","ci","bot","cli","app","api","web","auto","automation","automatic",
]);

/** 真正"信息量超低"的单词关键词；纯单词时若中招就丢弃 */
const SINGLE_WORD_WEAK = new Set([
  "code","review","data","model","poem","poetry","mood","music","style",
  "test","testing","script","scripts","sample","template","templates",
  "ai","ml","llm","gpt","prompt","prompts",
]);

/** 通用引导动词 / 副词，会污染 bigram —— 命中就给一个 bigram 减分 */
const FILLER_WORDS = new Set([
  "asks","ask","when","use","using","used","make","makes","made","get","gets","got",
  "generate","generates","generated","provide","provides","provided","return","returns",
  "create","creates","created","add","adds","added","help","helps","helped","want","wants",
  "need","needs","needed","like","likes","liked","try","tries","tried",
]);

/**
 * 领域感名词白名单：命中其一就让该 bigram 加分。
 * 这些词意味着"具体的技术/产品语境"，比泛用形容词信息量大得多。
 */
const DOMAIN_WORDS = new Set([
  // 工程
  "pull","request","review","commit","branch","merge","lint","format","build","test","ci","cd",
  "diff","patch","refactor","rebase","conflict",
  // 数据
  "schema","json","yaml","csv","parse","parser","validate","serialize","deserialize",
  // 产品 / 工作流
  "report","dashboard","invoice","summary","analyze","analyzer","summarize","translate","translator",
  // 金融 / 交易
  "stock","stocks","trading","trade","trader","market","markets","finance","financial","investment",
  "portfolio","watchlist","quant","securities","banking","fundraising",
  // 心理 / 测评
  "personality","mbti","myers","briggs","enneagram","tarot","quiz","persona",
  // 情绪 / 表达
  "affirmation","sarcasm","sarcastic","poem","quote","quotes","meme","copywriting",
  // 通用动作
  "search","retrieve","extract","detect","classify","predict","recommend","tag",
]);

/**
 * 中文 skill 的 GitHub 检索翻译兜底。
 *
 * GitHub Search 主要搜英文 repo name/description；如果 SKILL.md 全中文，
 * 纯英文 bigram 抽取会拿不到关键词。这里用一组高频赛道词典把中文语义
 * 映射成英文搜索短语。规则词典不是为了"完美翻译"，而是为了给市场调研
 * 一个足够靠谱的首轮 recall。
 */
const CHINESE_HINTS: Array<{ pattern: RegExp; phrases: string[] }> = [
  // 金融 / 投资。放在办公"复盘"之前，避免"盘面复盘/交易复盘"误判成 weekly report。
  { pattern: /股票|A股|盯盘|涨停|炒股|短线|打板|投资|证券|投研|基金|量化|交易|题材轮动|资金流|个股|板块/i, phrases: ["stock trading", "stock analysis", "market analysis"] },

  // 工程 / 开发者工具
  { pattern: /代码评审|代码审查|code\s*review|PR\s*(评审|审查|review)|拉取请求|合并请求/i, phrases: ["code review", "pull request", "reviewdog"] },
  { pattern: /代码生成|生成代码|脚手架|模板生成|组件生成/i, phrases: ["code generator", "scaffold generator", "template generator"] },
  { pattern: /单元测试|测试生成|测试用例|回归测试/i, phrases: ["test generator", "unit test", "test case generator"] },
  { pattern: /日志分析|报错分析|错误排查|故障排查|debug|调试/i, phrases: ["log analysis", "error diagnosis", "debug assistant"] },
  { pattern: /接口文档|API\s*文档|swagger|openapi/i, phrases: ["api documentation", "openapi generator", "swagger documentation"] },

  // 文档 / 内容 / 办公
  { pattern: /周报|日报|月报|工作总结|工作复盘|项目复盘|会议复盘/i, phrases: ["weekly report", "work summary", "retrospective"] },
  { pattern: /PPT|幻灯片|演示文稿|路演|slide|slides/i, phrases: ["presentation generator", "slide deck", "html slides"] },
  { pattern: /简历|履历|求职|面试/i, phrases: ["resume builder", "cv generator", "interview assistant"] },
  { pattern: /发票|账单|报价单|收据/i, phrases: ["pdf invoices", "invoice generator", "billing"] },
  { pattern: /翻译|本地化|润色|改写|校对/i, phrases: ["translation tool", "text polishing", "proofreading"] },

  // 数据 / 分析
  { pattern: /数据分析|表格分析|Excel|CSV|可视化|图表/i, phrases: ["data analysis", "csv analysis", "chart generator"] },
  { pattern: /舆情|竞品分析|市场调研|行业分析/i, phrases: ["market research", "competitor analysis", "sentiment analysis"] },

  // 学习 / 心理 / 情绪表达
  { pattern: /MBTI|性格测试|人格测试|人格分析|心理测试/i, phrases: ["mbti personality", "personality test", "big five personality"] },
  { pattern: /塔罗|占卜|星座|运势/i, phrases: ["tarot reading", "astrology", "fortune telling"] },
  { pattern: /英语|背单词|口语|雅思|托福|语言学习/i, phrases: ["language learning", "english tutor", "vocabulary trainer"] },
  { pattern: /算法讲解|学习助手|知识卡片|错题|刷题/i, phrases: ["learning assistant", "flashcards", "quiz generator"] },
  { pattern: /毒鸡汤|邪修|搞笑|段子|梗图|吐槽|情绪价值|解压|emo|阴阳怪气/i, phrases: ["motivational quotes", "sarcasm", "meme generator"] },
  { pattern: /文风模仿|人设|角色扮演|口吻|语气/i, phrases: ["writing style", "persona prompt", "roleplay"] },
  // 泛文案规则放在情绪/搞笑后面，避免"毒鸡汤文案"被 copywriting 抢走。
  { pattern: /小红书|朋友圈|公众号|标题|文案|种草/i, phrases: ["copywriting", "social media post", "title generator"] },

  // 生活 / 小工具
  { pattern: /菜谱|做饭|食谱|营养|减脂/i, phrases: ["recipe generator", "meal planner", "nutrition"] },
  { pattern: /旅行|行程|攻略|路线规划/i, phrases: ["travel planner", "itinerary generator", "trip planner"] },
  { pattern: /记账|预算|理财|消费分析/i, phrases: ["budget planner", "expense tracker", "personal finance"] },
];

/**
 * 抽 1-3 个最有信息量的搜索短语。
 * 优先级：description 里的 2-3 词组 > name（拆词后） > tags 组合
 */
export function extractKeywords(input: {
  name?: string;
  description?: string;
  tags?: string[];
  body?: string;
}): string[] {
  const candidates: string[] = [];
  const allText = [
    input.name,
    input.description,
    input.tags?.join(" "),
    input.body?.slice(0, 3000),
  ].filter(Boolean).join("\n");

  // 0) 中文翻译兜底：全中文 skill 也能搜到英文 GitHub repo。
  //    放在最前面，命中的中文赛道短语通常比英文启发式更准。
  const translated = chineseHintsToKeywords(allText);
  candidates.push(...translated);

  // 1) tags：multi-word tag（`code-review` / `pull_request`）拆词后是天然好关键词；
  //    优先级最高 —— 作者已经主动给我们标了
  if (input.tags?.length) {
    for (const t of input.tags) {
      const phrase = String(t).trim().toLowerCase().replace(/[-_]/g, " ");
      if (!phrase) continue;
      const tokens = phrase.split(/\s+/).filter((w) => !STOPWORDS.has(w));
      // 双词 tag 直接做关键词；单词 tag 跳过（`github`/`ai` 这种太通用）
      if (tokens.length >= 2) candidates.push(tokens.slice(0, 3).join(" "));
    }
  }

  // 2) description 里的多词短语（最有信息量，能定位到具体动词+领域）
  if (input.description) {
    const phrases = topPhrasesFromText(input.description, 3);
    candidates.push(...phrases);
  }

  // 3) name 拆词组合：`pr-reviewer` → `pr review`；`bad-vibes-master` → `bad vibes`
  if (input.name) {
    const namePhrase = nameToPhrase(input.name);
    if (namePhrase) candidates.push(namePhrase);
  }

  // 4) body 兜底（前面 candidate 不够时）
  if (candidates.length < 2 && input.body) {
    const phrases = topPhrasesFromText(input.body.slice(0, 2000), 2);
    candidates.push(...phrases);
  }

  // 去重 + 过滤太短/太弱的
  const filtered = dedupeOrdered(candidates).filter(isUseful);
  return filtered.slice(0, 3);
}

/**
 * 把单个关键词短语拼成一个 GitHub Search query。
 *
 * **重要**：GitHub Search 不支持括号表达式 `(A OR B)` —— 整体会被当成 0 结果。
 * 所以多关键词时不要拼成单 query；改成对每个关键词单独 search 再合并。
 *
 *  - 短语用引号包起来（保留词序）
 *  - 加 `in:name,description` 限定只搜标题和简介，过滤掉 readme 噪音
 *  - 加 `stars:>3 archived:false` 过滤 spam 和死项目
 */
export function buildGithubQuery(keyword: string): string {
  const k = keyword.trim();
  if (!k) return "";
  const phrase = k.includes(" ") ? `"${k}"` : k;
  return `${phrase} in:name,description stars:>3 archived:false`;
}

/** 把多个关键词拼成"用户可读"的展示查询字符串（仅展示，不实际发给 GitHub） */
export function summarizeQueries(keywords: string[]): string {
  return keywords.map((k) => (k.includes(" ") ? `"${k}"` : k)).join(" + ");
}

// ---------- 内部工具 ----------

function dedupeOrdered(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    const k = a.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function chineseHintsToKeywords(text: string): string[] {
  if (!/[\u3400-\u9fff]/.test(text)) return [];
  const out: string[] = [];
  for (const hint of CHINESE_HINTS) {
    if (!hint.pattern.test(text)) continue;
    out.push(...hint.phrases);
    if (out.length >= 3) break;
  }
  return dedupeOrdered(out).slice(0, 3);
}

/** 一个短语是否"有用"：至少 2 词，或单词不在弱词表里 */
function isUseful(s: string): boolean {
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return !SINGLE_WORD_WEAK.has(tokens[0]) && tokens[0].length >= 4;
  return true;
}

/** name 转成短语：`pr-reviewer` → `pr review`；`MBTI-test` → `mbti test`；`hello` → "" */
function nameToPhrase(name: string): string {
  const cleaned = name.toLowerCase().replace(/[-_]/g, " ").trim();
  // 去掉常见后缀：reviewer → review, helper → "" 之类
  const tokens = cleaned
    .split(/\s+/)
    .map((w) => w.replace(/(?:er|or|ist)$/, "")) // reviewer → review
    .filter((w) => w && !STOPWORDS.has(w));
  if (tokens.length < 2) return ""; // 单词 name 太弱，丢
  return tokens.slice(0, 3).join(" ");
}

/** 从一段文本里取 2-3 个最有"领域感"的 bigram（不用 trigram —— 太严会 0 结果） */
function topPhrasesFromText(text: string, k = 2): string[] {
  // 保留原始词序，bigram 优先按"出现位置 + 是否含弱词"打分
  const words = text
    .toLowerCase()
    .replace(/[`*_#>\-\[\]\(\)\{\}\|\.,:;!?'"`/\\]/g, " ")
    .split(/\s+/)
    .filter((w) => /^[a-z][a-z0-9]*$/.test(w) && !STOPWORDS.has(w) && w.length >= 3);

  // 收集所有 bigram，并打分
  const scored = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i];
    const w2 = words[i + 1];
    const bg = `${w1} ${w2}`;
    let score = scored.get(bg) ?? 0;
    score += 1; // 基础：出现 1 次

    // 任一词命中"领域名词" → 重磅加分（这是信号最强的特征）
    const domainHits = (DOMAIN_WORDS.has(w1) ? 1 : 0) + (DOMAIN_WORDS.has(w2) ? 1 : 0);
    score += domainHits * 3;

    // 任一词是 filler（"asks", "generate", "use"...）→ 减分
    const fillerHits = (FILLER_WORDS.has(w1) ? 1 : 0) + (FILLER_WORDS.has(w2) ? 1 : 0);
    score -= fillerHits * 2;

    // 两个词都不在弱词表 → 中等加分
    if (!SINGLE_WORD_WEAK.has(w1) && !SINGLE_WORD_WEAK.has(w2)) {
      score += 1;
    }

    scored.set(bg, score);
  }

  return [...scored.entries()]
    .filter(([, s]) => s > 0) // 完全负分的（双 filler）直接丢
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s)
    .slice(0, k);
}
