# OCG · OpenCode Go 控制台

两页静态站点，无后端、无构建步骤：

- **配额总览**（`index.html`）— 读取 OpenCode Go 的三个用量窗口；本地 30 节点采样做历史图，按本窗口已过时间比例给出重置时用量预估，并把 5H→周、周→月的剩余预估折算叠加。
- **模型账本**（`models.html`）— Go 订阅下每个模型的月度调用次数 × ModelDial 五轴评分，按调用次数换算性价比。

线上：<https://yuki-216.github.io/opencodepanel/> · 仓库：<https://github.com/yuki-216/opencodepanel>

## 快速开始

1. 直接打开 `index.html`，或部署后访问。
2. 点「用演示数据预览」先看界面（`?demo=1`，不联网）。
3. 点「连接并读取」，粘贴 OpenCode Console 的个人 API key（`oc_sk_...`）。
   - key 只保存在本机浏览器（勾选「记住」用 localStorage，否则 sessionStorage）。
   - key 只会发送到 `https://opencode.ai/inference/go/v1/usage`。
   - 预估按「本窗口已用百分比 ÷ 已过时间」折算，通常打开即有；窗口刚开始的 1 分钟内显示「数据不足」。历史节点会边用边填。

## 部署到 GitHub Pages

1. 新建仓库，把 `index.html` 放在仓库根目录。
2. Settings → Pages → Build and deployment → Source: **Deploy from a branch**。
3. Branch 选 `main`，目录选 `/ (root)`，保存。
4. 打开 `https://<user>.github.io/<repo>/`。

也可以直接把文件夹拖到 Cloudflare Pages / Netlify / Vercel，零配置。项目没有构建步骤。

## 数据与限额

- 官方文档：<https://opencode.ai/docs/console/go/#usage>
- `GET https://opencode.ai/inference/go/v1/usage`，请求头 `Authorization: Bearer <key>`。
- 返回 `rolling`（5 小时）、`weekly`、`monthly` 三个 meter：`status`（`ok` / `rate-limited`）、`percent`、`resetsAt`。
- 5 小时窗口 = 月额度的 20%，每周 = 50%，每月 = 100%。
- 滚动窗口在第一次请求后开始计时；每周一 00:00 UTC 重置；月度按付费周期重置。
- API 只返回百分比，不返回美元金额，也没有历史接口；历史由 dashboard 本地采样（每窗口 30 个等距节点）。

## 预测口径

- 每次成功刷新时，把三个窗口的百分比写入本地 `localStorage` 的 `ocg.history`。
- 每个窗口按窗口时长平均分成 30 个节点；一次采样落在哪一段，就填该段起点节点，只记录这一段里第一次采到的值（后续采样不覆盖）。
- 节点最多 90 个（3 窗口 × 30）；历史只在页面打开时采样，重新打开会沿用同一窗口（`resetsAt` 相同）的节点。
- 图表实线是这些节点（节点时间 + 第一次采到的百分比），横轴是窗口起点 → 重置的真实时间；「现在」标在最后一个采样点。
- 预估不再用节点回归：每个窗口按「本窗口已用百分比 ÷ 已过时间」得到平均速度，从当前点线性外推到重置（原始按比例算法）。窗口刚开始的 1 分钟内显示「数据不足」。
- 「窗口折算」以本窗口已用为底，画三段：
  - 已用；
  - 当前速度预估 = 短窗口速度 × `min(短窗口重置, 本窗口重置) - 现在` × 额度比例（5H→周 ×0.4，周→月 ×0.5）；
  - 折算上限位置 = 已用 + `(100 - 短窗口已用) × 额度比例`，超过本窗口上限时截到 100%；第三段从预估末端画到这个位置；
  - 预估不会超过短窗口剩余上限；超过本窗口上限时标「封顶」；
  - 已用部分不重复计入；折算上限之外的空槽不再画成一段；
  - 折算上限只覆盖当前短窗口的剩余额度；短窗口重置后的新额度不在其中。
- 每组的下面一条是目标窗口从起点到重置的时间轴，圆点标出当前时间。
- 「预计重置时」超过 100% 是线性外推的占比，状态仍按限额判为「将打满」。
- 月度窗口按一个日历月估算；卡片预估和窗口折算都是线性外推，实际会波动，不构成额度保证。

## 交互

- 「窗口折算」的用量轴直接标出 0%、已用、预估结束、折算上限、100% 的坐标；图例只保留文字。
- 悬浮用量条上的色块：显示该段增量，并高亮对应图例（已用 / 折算 / 折算上限）。
- 悬浮三个窗口图表的采样点：显示该点时间与已用百分比。
- 100% 坐标只显示数字，不写「上限」。

## 模型账本（models.html）

第二个页面，统计 Go 订阅下每个模型的额度与性价比。与配额页共用同一套暗色主题和顶部导航，通过 `./` 与 `models.html` 互相跳转。

### 数据来源

| 数据 | 端点 | 浏览器可达 |
|---|---|---|
| 模型清单 + 月度额度 | `opencode.ai/inference/go/v1/models` | ✅ `ACAO: *`，免鉴权 |
| 三轴评分 | `modeldial.com/api/v1/radar/latest.json` | ✅ `ACAO: *`，免鉴权 |
| 每 5 小时调用次数 | `opencode.ai/console/go` | ❌ 无 CORS，需脚本抓 |
| 五轴评分 | `modeldial.com/data/overview.json` | ❌ 无 CORS，需脚本抓 |

页面打开时会实时拉取前两个；后两个用内嵌快照兜底，接口不可达时自动降级为「离线快照」。

### 刷新快照

```bash
node refresh-models.mjs            # 抓线上并写回 models.html
node refresh-models.mjs --out d.json   # 只导出 JSON
```

模型或价格变动后重跑一次即可，无需构建。也支持离线重建：

```bash
node refresh-models.mjs --api-file api.json --go-file go.html \
  --radar-file radar.json --latest-file latest.json
```

### 性价比口径

```
月可调用 = 每 5 小时次数 × 5
每次请求成本 = $10 ÷ 月可调用
性价比 = 五轴综合分 × log₁₀(1 + 月可调用)
```

用对数是因为额度跨度接近三个数量级（490 → 226,500 次/月），直接相乘会让低价模型碾压一切。公式写在 `models.html` 的脚本里，改一处即可。

### 数据标注

- **同系列** — Go 上的模型与榜单记录版本不同（如 K2.7 Code 对 K2.8 Coding），分数仅供参考。
- **未发布** — ModelDial 的 `hiddenModelIds` 里、榜单页不展示的配置，分数不参与最高分统计，排序时始终沉底。
- **额度冲突** — 页面与 API 的月额度不一致（当前仅 `kimi-k3.1-pro`）。页面值与该表自身的 5 小时次数自洽，故采用页面值。

### 许可

五轴评分来自 [ModelDial Radar](https://modeldial.com/radar)，采用 CC BY 4.0 许可，本页已二次加工并在页脚署名。

## 安全说明

- 页面无后端、无 analytics、无第三方脚本或 CDN；CSP 只允许连接 `https://opencode.ai`。
- 模型账本页会额外请求 `https://modeldial.com`（公开评分数据，无需凭证）。
- key 存在浏览器 localStorage/sessionStorage，同 origin 的脚本可读。建议：
  - 给面板使用独立子域（Cloudflare Pages/Netlify 每个项目一个子域），或自定义域名；
  - GitHub Pages 的 project site 共享 `username.github.io` origin，同账号的其他项目也能读到同一份 localStorage；
  - 如果 Console 支持多 key，给面板单独建一个，方便随时吊销；
  - 共用设备上取消「记住」，用完点右上角菜单 →「断开并清除 key」。
- 本地历史 `ocg.history` 最多 90 个点（3 窗口 × 30），只含节点时间与百分比，不含 key；清掉用浏览器站点数据（或删除该键）。
- 如果不想让 key 进浏览器：需要一个本地 bridge（本机 Node 进程读取 `~/.zcode/v2/provider_config.json` 并代理 usage 接口），本版本未包含。

## 文件

- `index.html` — 配额总览（HTML/CSS/JS 内联，单文件）。
- `models.html` — 模型账本（HTML/CSS/JS + 内嵌快照数据，单文件）。
- `refresh-models.mjs` — 重建 `models.html` 内嵌快照的 Node 脚本。
- `README.md` — 本文件。

## 说明

- 非 OpenCode 官方项目；接口若变更，页面会提示「返回格式无法识别」并保留原始响应。
- 终端里的 `ocg` 命令不受影响，仍然是独立的 PowerShell 快捷命令。
- `?demo=1` 进入演示模式，使用 30 个合成节点，不发起网络请求。
