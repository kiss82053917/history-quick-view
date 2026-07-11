# History Quick View 三期：统计可视化 — 设计文档

日期：2026-07-11
状态：已获用户认可（方案 A：独立 stats 页 + 手写 SVG）
前置：一二期已合并于 `feature/phase1-i18n-material`（tip `39ddc63`，PR #1 待合并）

## 范围（用户拍板）

三个指标，全部基于 chrome.history 的**访问时间点**（可靠数据）：

1. 常去网站 Top 10（按窗口内访问次数）
2. 24 小时时段分布
3. 每日趋势（最近 N 天）

入口形态：**独立标签页**（popup 头部按钮打开 `stats.html`）。
明确不做（YAGNI）：估算浏览时长（数据不可靠，用户已弃）、popup 内嵌简版、第三方图表库、导出（四期）。

## 架构

三个新文件 + 两处挂接，popup 现有两条管线零改动：

- `src/stats-data.js` — 数据层。拉取 + 聚合分离：
  - `fetchVisits(days)`：`chrome.history.search({text:"", startTime: now-days*DAY, maxResults: 20000})`
    → 对结果 URL **分批 500 并发** `chrome.history.getVisits` → 过滤窗口内 visit，
    产出 `Array<{url, host, time}>`（host 解析失败归空串，聚合时计入「其他」）
  - `aggregate(visits, rangeDays, now)`：纯函数（Node 可单测），返回
    `{topSites: Array<{host, count, sampleUrl}>, byHour: number[24], byDay: Array<{dayStart, count}>, total, uniqueSites}`
    （byDay 按本地时区切日，起止补零对齐 rangeDays 天）
  - 页面生命周期内缓存 90 天原始 visits，7/30/90 切换在内存重切（`aggregate` 重跑），不重拉
- `src/stats.html` + `src/stats.js` — 呈现层。SVG 手写三图 + 汇总行 + 范围切换 + tooltip
- `src/stats.css` — 独立样式（复用 style.css 的主题变量约定：`html.d/l/a` 三主题同一套
  `--color*` 变量；变量块从 style.css 复制为共享基调，不 @import 以免耦合布局规则）
- 挂接一：popup 头部（`index.html` header nav）新增柱状图图标按钮，`main.js` HHeader.onclick
  分支 `chrome.tabs.create({url: chrome.runtime.getURL("stats.html")})`
- 挂接二：`stats.html` 头部同样挂 `i18n.js`（data-i18n 机制原样复用）；主题初始化读
  `chrome.storage.local` 的 `theme` 设 `<html>` class（与 popup 同一存储键，跟随 popup 设置）

## 图表规范（dataviz 方法论，实现时执行）

三图均为**单系列 magnitude**：一律用现有主题主色（浅色 `#1a73e8` / 深色 `#8ab4f8`），
不引入新色相，不放图例（单系列由标题命名）。

- 通用：条/柱 ≤24px 厚、数据端 4px 圆角基线端直角；网格线 1px 实线灰
  （`--color-border`）、贴地气不抢戏；所有文字用文本色 token（`--color`/`--color-secondary`），
  绝不用系列色写字；hover 必有 tooltip（HTML 浮层，命中区大于标记本身）
- Top 10 网站：横条榜，每行 favicon + 域名（文本色）+ 次数（tabular-nums）+ 比例条；
  按次数降序；「其他」（host 解析失败）若有则计入榜尾不参与 Top 排名
- 24 小时分布：24 柱，相邻柱 2px 表面色间隙；仅峰值柱顶直标数值，其余靠 y 轴刻度与 tooltip
- 每日趋势：2px 折线圆角连接 + 系列色 10% 透明度面积渍；末端点 r≥4 带 2px 表面色环；
  hover 竖向十字线 + tooltip（日期 + 次数）；x 轴稀疏刻度（首/尾/间隔取整）
- 汇总行：两个 stat tile（总访问次数、独立网站数），值用大号半粗、自动紧凑（12.9K）
- 无障碍：每图下方 `<details data-i18n="statsShowTable">` 折叠数据表；
  深浅两主题分别用 dataviz `validate_palette.js` 校验主色×表面色对比，FAIL 则换邻近色阶
- 加载态：拉取期间显示转圈（复用 popup 的 loader svg 样式）；空数据显示「暂无历史记录」同款空态

## 交互

- 范围切换：页顶一行 7 天 / 30 天 / 90 天分段按钮（默认 30 天），切换即内存重聚合重渲染；
  选中态持久化到 `chrome.storage.local`（key `statsRange`，非法值回退 30）
- Top 榜行点击：按「链接打开方式」设置打开该域名下最近访问的 URL（sampleUrl）
- 不做图表联动/钻取（YAGNI）

## 错误处理

- `fetchVisits` 失败：页面内错误条（i18n `errFetchAll` 复用）
- getVisits 个别 URL 失败：跳过该 URL 继续（console.error），不炸整页
- 历史为空：三图区域统一空态文案（复用 `noHistory`）
- 20000 URL 上限：与二期缓存同语义，页脚注明统计基于最近 2 万条记录（i18n `statsCapNote`，
  仅当命中上限时显示）

## 测试

- `tools/test-stats.mjs`：`aggregate` 纯函数单测（构造 visits：跨日/跨时区边界/空输入/
  单日全量/超窗口过滤/host 归组/Top 排序稳定性）
- `tools/e2e.mjs` 增补：popup 统计按钮存在且 tooltip 中文 → 模拟打开 stats.html
  （CDP 直接 navigate）→ 三图 SVG 渲染（元素计数）→ 范围切换后汇总数字变化 →
  数据表 details 可展开 → 深浅主题各截图（`phase3-stats-dark.png` / `phase3-stats-light.png`）
- i18n：新增 key 过 `tools/check-i18n.mjs`（check 脚本需扩展扫 stats.html 与 stats.js）

## 分支与里程碑

- 分支 `feature/phase3-stats`，切自 `feature/phase1-i18n-material`；PR #1 合并后变基
- M1 数据层+单测 → M2 stats 页骨架（入口/i18n/主题/范围切换）→ M3 三图 SVG →
  M4 tooltip/数据表/空态 → M5 e2e 增补+调色校验+截图收口
