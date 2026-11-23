# OCG · OpenCode Go 配额仪表盘

单文件静态仪表盘，读取 OpenCode Go 的三个用量窗口；本地 30 节点采样做历史图，按本窗口已过时间比例给出重置时用量预估，并把 5H→周、周→月的剩余预估折算叠加。无后端、无构建步骤。

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
- 「窗口折算」把更短窗口的剩余预估累加到本窗口已用上：
  - 剩余时间取 `min(短窗口重置, 本窗口重置) - 现在`；
  - 原始预估 = 短窗口当前速度 × 剩余时间，再按额度比例折成本窗口百分比（5H→周 ×0.4，周→月 ×0.5）；
  - 只加剩余预估；已用的 5H/周部分已经包含在本窗口已用里，不重复计入；
  - 三段依次为已用、折算新增、余量，颜色不同并以空隙分隔；累计超过 100% 时只画到上限。
- 每组的下面一条是目标窗口从起点到重置的时间轴，圆点标出当前时间。
- 「预计重置时」超过 100% 是线性外推的占比，状态仍按限额判为「将打满」。
- 月度窗口按一个日历月估算；卡片预估和窗口折算都是线性外推，实际会波动，不构成额度保证。

## 安全说明

- 页面无后端、无 analytics、无第三方脚本或 CDN；CSP 只允许连接 `https://opencode.ai`。
- key 存在浏览器 localStorage/sessionStorage，同 origin 的脚本可读。建议：
  - 给面板使用独立子域（Cloudflare Pages/Netlify 每个项目一个子域），或自定义域名；
  - GitHub Pages 的 project site 共享 `username.github.io` origin，同账号的其他项目也能读到同一份 localStorage；
  - 如果 Console 支持多 key，给面板单独建一个，方便随时吊销；
  - 共用设备上取消「记住」，用完点右上角菜单 →「断开并清除 key」。
- 本地历史 `ocg.history` 最多 90 个点（3 窗口 × 30），只含节点时间与百分比，不含 key；清掉用浏览器站点数据（或删除该键）。
- 如果不想让 key 进浏览器：需要一个本地 bridge（本机 Node 进程读取 `~/.zcode/v2/provider_config.json` 并代理 usage 接口），本版本未包含。

## 文件

- `index.html` — 全部内容（HTML/CSS/JS 内联，单文件）。
- `README.md` — 本文件。

## 说明

- 非 OpenCode 官方项目；接口若变更，页面会提示「返回格式无法识别」并保留原始响应。
- 终端里的 `ocg` 命令不受影响，仍然是独立的 PowerShell 快捷命令。
- `?demo=1` 进入演示模式，使用 30 个合成节点，不发起网络请求。
