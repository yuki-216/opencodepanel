#!/usr/bin/env node
/**
 * 重建 models.html 内嵌的模型账本快照。
 *
 * 数据来源与浏览器可达性：
 *   opencode.ai/inference/go/v1/models    ACAO:*  免鉴权  → 模型清单、月度额度、单价（浏览器可直连）
 *   modeldial.com/api/v1/radar/latest.json ACAO:* 免鉴权  → 三轴评分（浏览器可直连）
 *   opencode.ai/console/go               无 CORS            → 每 5 小时调用次数（仅本脚本可读）
 *   modeldial.com/data/overview.json     无 CORS            → 五轴评分（仅本脚本可读）
 *
 * 页面打开时会实时拉取前两个，后两个用本脚本写入的快照兜底。
 *
 *   node refresh-models.mjs                           # 抓线上并写回 models.html
 *   node refresh-models.mjs --out data.json           # 只导出 JSON
 *   node refresh-models.mjs --html other.html
 *   node refresh-models.mjs --go-file go.html --radar-file radar.json --latest-file latest.json --api-file api.json
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const URLS = {
  api: 'https://opencode.ai/inference/go/v1/models',
  goPage: 'https://opencode.ai/console/go',
  latest: 'https://modeldial.com/api/v1/radar/latest.json',
  overview: 'https://modeldial.com/data/overview.json',
};

/** Go 页面 slug → ModelDial 的 model_id。confidence 用于在界面上标注可信度。 */
const MATCH = {
  'kimi-k3': ['k3', 'exact'],
  'kimi-k3.1-pro': ['k3.1-pro', 'exact'],
  'qwen3.8-max': ['qwen3.8-max', 'exact'],
  'grok-4.7': ['grok-4.7', 'exact'],
  'step-5-preview': ['step-5-preview', 'exact'],
  'qwen4-max': ['qwen4-max', 'exact'],
  'gemini-4-argon': ['gemini-4-argon', 'exact'],
  'glm-5.2': [null, 'none'],
  'kimi-k2.7-code': ['kimi-for-coding', 'family'],
  'deepseek-v4-pro': ['deepseek-v4-pro', 'exact'],
  'hy4-preview': ['hy4-preview', 'exact'],
  'gpt-5.6-luna': ['gpt-5.6-luna', 'exact'],
  'glm-5.3': ['glm-5.3', 'exact'],
  hy4: ['hy4-dev', 'exact'],
  'minimax-m3': ['MiniMax-M3', 'exact'],
  'mimo-v2.6-pro': ['mimo-v2.6-pro', 'exact'],
  'claude-haiku-5-5': ['anthropic/haiku-5.5', 'exact'],
  'minimax-m3.1-flash': ['MiniMax-M3.1-Flash', 'exact'],
  'gpt-6-luna': ['gpt-6-luna', 'exact'],
  hy3: [null, 'none'],
  'qwen3.7-plus': [null, 'none'],
  'qwen3.8-flash': ['qwen3.8-flash', 'exact'],
  'glm-5.3-flash': ['glm-5.3-flash', 'exact'],
  'longcat-2.5': ['LongCat-2.5', 'exact'],
  'mimo-v2.6-flash': ['mimo-v2.6-flash', 'exact'],
  'deepseek-v4.1-flash': ['deepseek-flash', 'exact'],
  'muse-spark-1.2-contributor': [null, 'none'],
  'muse-spark-1.3-contributor': ['muse-spark-1.3-contributor', 'exact'],
  'beam-free': [null, 'none'],
  'hungerg-free': ['qoder/hmodel', 'family'],
  'hy4-flash-free': ['hy4-flash-dev', 'family'],
  'iceman-contributor-free': [null, 'none'],
};

const NOTE = {
  'kimi-k2.7-code': '榜单为 Kimi K2.8 (Coding)，与 Go 的 K2.7 Code 版本不同',
  'glm-5.2': '榜单未收录 GLM-5.2',
  hy3: '榜单未收录 Hy3',
  'qwen3.7-plus': '榜单未收录 Qwen3.7 Plus',
  'muse-spark-1.2-contributor': '榜单只有 Muse Spark 1.3',
  'hungerg-free': '榜单为付费版 HungerG，免费版未独立评测',
  'hy4-flash-free': '榜单为 HY4-flash，免费版未独立评测',
  'beam-free': '限时免费模型，榜单未收录',
  'iceman-contributor-free': '限时免费模型，榜单未收录',
  hy4: '榜单显示名为 HY4',
  'deepseek-v4.1-flash': '榜单显示名为 DeepSeek V4.1 Flash (1017)',
};

const PLAN_PRICE = 10;

const decode = (s) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();

const toNum = (s) => {
  const t = s.replace(/[,\s$]/g, '');
  if (t === '∞' || /inf/i.test(t)) return null;
  const v = Number(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(v) && t !== '' ? v : null;
};

async function get(url, label, { json = false } = {}) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 150000);
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { accept: json ? 'application/json' : '*/*', 'user-agent': 'ocg-model-ledger/1.0' },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return json ? JSON.parse(text) : text;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw new Error(`${label} 抓取失败：${last?.message ?? last}`);
}

function parseGoPage(html) {
  const rows = [...html.matchAll(/<tr[^>]*data-model="([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)];
  if (!rows.length) throw new Error('Go 页面未解析到模型行，结构可能已变');

  return rows.map(([, slug, body]) => {
    const nameAttr = body.match(/data-layer="model-name"[^>]*title="([^"]+)"/);
    const vals = [...body.matchAll(/data-layer="current-value">([^<]*)<\/span>/g)].map((m) => decode(m[1]));
    return {
      slug,
      name: nameAttr ? decode(nameAttr[1]) : slug,
      est5h: toNum(vals[0] ?? ''),
      est5hPlus: toNum(vals[1] ?? ''),
      monthlyUsdHtml: toNum(vals[2] ?? ''),
      monthlyUsdHtmlPlus: toNum(vals[3] ?? ''),
      limitedRegions: /Limited regions/.test(body),
      limitedTime: /Limited time/.test(body),
    };
  });
}

function assemble(row, apiModel, apiOnly = false) {
  const mu = (apiModel?.go?.monthly_usage) ?? {};
  const cost = apiModel?.cost?.text ?? null;
  const htmlMonthly = row.monthlyUsdHtml;
  const apiMonthly = mu.go ?? null;

  // 每 1 美元额度能换多少次调用：由页面快照测得，两档一致性极高，是稳定的模型常数。
  let reqPerUsd = null;
  if (row.est5h != null && htmlMonthly) {
    reqPerUsd = (row.est5h * 5) / htmlMonthly;
  }

  // 页面与 API 的月额度不一致时以页面为准：页面的 est5h 与月额度在同一张表里
  // 相互自洽，而 API 偶有滞后。冲突会写进 coverage 并在界面上标出。
  const conflict = htmlMonthly != null && apiMonthly != null && Math.abs(htmlMonthly - apiMonthly) > 0.01;
  const monthlyUsd = conflict ? htmlMonthly : (apiMonthly ?? htmlMonthly ?? null);

  const monthlyRequests =
    reqPerUsd != null && monthlyUsd != null ? reqPerUsd * monthlyUsd : row.est5h != null ? row.est5h * 5 : null;

  const [modelId, confidence] = MATCH[row.slug] ?? [null, 'none'];

  return {
    slug: row.slug,
    name: row.name,
    modelId,
    confidence,
    note: NOTE[row.slug] ?? (apiOnly ? '仅 API 列表返回，Go 页面未展示' : null),
    apiOnly,
    est5h: row.est5h,
    reqPerUsd,
    monthlyUsd,
    monthlyUsdHtml: htmlMonthly,
    monthlyRequests,
    perDollarRequests: monthlyRequests != null ? monthlyRequests / PLAN_PRICE : null,
    monthlyUsdApi: apiMonthly,
    conflict,
    limitedRegions: Boolean(apiModel?.go?.limited_regions ?? row.limitedRegions),
    limitedTime: row.limitedTime,
    training: apiModel?.go?.training ?? null,
    free: monthlyUsd == null,
    contextWindow: apiModel?.limit?.context ?? null,
    maxOutput: apiModel?.limit?.output ?? null,
    priceIn: cost?.input?.price ?? null,
    priceOut: cost?.output?.price ?? null,
    openWeights: apiModel?.open_weights ?? null,
    releaseDate: apiModel?.release_date ?? null,
    description: apiModel?.description ?? null,
  };
}

function buildGoModels(apiModels, pageRows) {
  const api = new Map();
  for (const m of apiModels) {
    if (m.type && m.type !== 'chat') continue;
    api.set(m.id, m);
  }

  const out = [];
  const seen = new Set();

  for (const row of pageRows) {
    const a = api.get(row.slug) ?? null;
    if (a) seen.add(row.slug);
    out.push(assemble(row, a));
  }
  for (const [id, a] of api) {
    if (seen.has(id)) continue;
    out.push(assemble({ slug: id, name: a.name ?? id, est5h: null, monthlyUsdHtml: null }, a, true));
  }
  return out;
}

function buildFiveAxis(raw, names) {
  const hidden = new Set(raw.hiddenModelIds ?? []);
  const byModel = {};
  for (const e of raw.snapshot.entries) {
    const c = {
      cid: e.candidate_id,
      conn: e.connection_id,
      effort: e.reasoning_effort,
      backend: e.backend_score,
      frontend: e.frontend_score,
      knowledge: e.knowledge_score,
      aesthetic: e.aesthetic_score,
      maintain: e.maintainability_score,
      overall: e.overall_score,
    };
    (byModel[e.model_id] ??= []).push(c);
  }
  for (const k of Object.keys(byModel)) {
    byModel[k].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
  }
  return {
    batchId: raw.snapshot.batch_id,
    publishedAt: raw.snapshot.published_at,
    scoringRelease: raw.scoringRelease?.release_id ?? null,
    weights: raw.qualityScores?.weights ?? null,
    names,
    // ModelDial 把评测尚不完整的配置列在 hiddenModelIds，榜单页不展示。
    hiddenModelIds: [...hidden],
    byModel,
  };
}

function buildThreeAxis(latest) {
  const rows = (latest.rankings ?? []).map((r) => ({
    id: r.id,
    provider: r.provider,
    model: r.model,
    effort: r.reasoningEffort,
    display: r.displayName,
    backend: r.backendScore,
    frontend: r.frontendScore,
    knowledge: r.knowledgeScore,
    overall: r.overallScore,
    elapsedMs: r.elapsedMs ?? null,
    costUsd: r.estimatedReferenceCostUsd ?? null,
  }));
  return {
    generatedAt: latest.generatedAt ?? null,
    batchId: latest.overallBatch?.id ?? null,
    publishedAt: latest.overallBatch?.publishedAt ?? null,
    weights: latest.weights ?? null,
    rows,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
  };
  // 允许绝对路径：只对相对路径拼 HERE
  const resolvePath = (p) => (/^([A-Za-z]:[\/]|[\/])/.test(p) ? p : join(HERE, p));
  const htmlPath = resolvePath(flag('--html') ?? 'models.html');
  const outPath = flag('--out') ? resolvePath(flag('--out')) : null;
  const local = {
    go: flag('--go-file'),
    radar: flag('--radar-file'),
    latest: flag('--latest-file'),
    api: flag('--api-file'),
  };

  const say = (m) => process.stdout.write(m);

  say('opencode 模型 API … ');
  const apiModels = local.api
    ? JSON.parse(await readFile(join(HERE, local.api), 'utf8')).data
    : (await get(URLS.api, 'opencode 模型 API', { json: true })).data;
  console.log(`${apiModels.length} 条`);

  say('opencode Go 额度表 … ');
  const goHtml = local.go ? await readFile(join(HERE, local.go), 'utf8') : await get(URLS.goPage, 'opencode Go 页面');
  const pageRows = parseGoPage(goHtml);
  console.log(`${pageRows.length} 行`);

  say('ModelDial 三轴榜单 … ');
  const latest = local.latest
    ? JSON.parse(await readFile(join(HERE, local.latest), 'utf8'))
    : await get(URLS.latest, 'modeldial latest.json', { json: true });
  console.log(`${latest.rankings?.length ?? 0} 条`);

  say('ModelDial 五轴榜单 … ');
  const overview = local.radar
    ? JSON.parse(await readFile(join(HERE, local.radar), 'utf8'))
    : await get(URLS.overview, 'modeldial overview.json', { json: true });
  console.log(`${overview.snapshot?.entries?.length ?? 0} 条`);

  const goModels = buildGoModels(apiModels, pageRows);
  const five = buildFiveAxis(overview, overview.displayNames ?? {});
  const three = buildThreeAxis(latest);

  const hidden = new Set(five.hiddenModelIds);
  for (const m of goModels) {
    m.unpublished = Boolean(m.modelId && hidden.has(m.modelId));
  }

  const matched = goModels.filter((m) => m.confidence !== 'none');
  const data = {
    schema: 1,
    builtAt: new Date().toISOString(),
    plan: { name: 'Go', priceUsd: PLAN_PRICE },
    sources: {
      api: { url: URLS.api, cors: true },
      goPage: { url: URLS.goPage, cors: false },
      latest: { url: URLS.latest, cors: true },
      overview: { url: URLS.overview, cors: false },
      license: {
        name: 'CC BY 4.0',
        url: 'https://creativecommons.org/licenses/by/4.0/',
        attribution: 'ModelDial Radar',
        attributionUrl: 'https://modeldial.com/radar',
      },
    },
    goModels,
    fiveAxis: five,
    threeAxis: three,
    coverage: {
      go: goModels.length,
      matched: matched.length,
      exact: goModels.filter((m) => m.confidence === 'exact').length,
      family: goModels.filter((m) => m.confidence === 'family').length,
      missing: goModels.filter((m) => m.confidence === 'none').map((m) => m.slug),
      conflicts: goModels.filter((m) => m.conflict).map((m) => m.slug),
    },
  };

  console.log(
    `\n覆盖 ${data.coverage.matched}/${data.coverage.go}（精确 ${data.coverage.exact}、同系列 ${data.coverage.family}）`,
  );
  if (data.coverage.missing.length) console.log(`无榜单数据：${data.coverage.missing.join(', ')}`);
  if (data.coverage.conflicts.length) console.log(`页面与 API 月额度不一致：${data.coverage.conflicts.join(', ')}`);

  const payload = JSON.stringify(data);

  if (outPath) {
    await writeFile(outPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`已写出 ${outPath}`);
    return;
  }

  let html = await readFile(htmlPath, 'utf8');
  const re = /(<script id="ledger-data" type="application\/json">)[\s\S]*?(<\/script>)/;
  if (!re.test(html)) throw new Error(`${htmlPath} 中找不到 <script id="ledger-data"> 区块`);
  html = html.replace(re, `$1${payload.replace(/<\/script/gi, '<\\/script')}$2`);
  await writeFile(htmlPath, html, 'utf8');
  console.log(`已注入 ${htmlPath}（${(payload.length / 1024).toFixed(0)} KB）`);
}

main().catch((e) => {
  console.error(`\n失败：${e.message}`);
  process.exit(1);
});
