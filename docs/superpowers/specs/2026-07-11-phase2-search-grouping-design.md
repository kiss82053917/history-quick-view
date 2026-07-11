# History Quick View 二期：搜索/分组增强 — 设计文档

日期：2026-07-11
状态：已获用户认可（方案 A：双管线）
前置：一期（汉化 + Material，`feature/phase1-i18n-material`，PR #1 待合并）

## 范围（用户拍板四项）

1. 模糊搜索（子序列 + 错字容忍，纯 JS 无依赖，不做拼音）
2. 按域名分组的「按网站」视图 + `site:` 搜索语法（两者都做）
3. 中文日期关键字（与英文关键字共存）
4. 修「历史记录极少时循环填充重复渲染」上游 bug

不做（YAGNI）：拼音搜索、访问频率排序、原生管线整体重写。

## 总体架构：双管线

- **默认「按时间」浏览**（搜索框为空时）：保持原有增量分页拉取架构不动，仅加去重护栏（第 4 节）
- **搜索态 +「按网站」视图**：新客户端管线——popup 打开后首次需要时一次性拉取
  `chrome.history.search({text: "", startTime: 0, maxResults: 20000})` 缓存在内存
  （每条约 200B，约 4MB，过滤为毫秒级），模糊打分、`site:` 过滤、域名分组都在这份缓存上做；
  popup 生命周期内缓存复用，删除操作后使缓存失效重拉

理由：原生 search API 只支持子串分词匹配，模糊/分组必须客户端做；老路径不动保住一期验收基准。

## 1. 模糊搜索 — `src/fuzzy.js`（纯函数模块）

接口：

```
fuzzyScore(query: string, text: string) → number   // 0~1 命中分，-1 不命中
fuzzyMatch(query: string, item: {title, url}) → number  // title/url 分别打分取高者
```

规则：
- 子序列匹配：query 每个字符按序出现在 text 中即候选命中（`gh` → **g**it**h**ub）
- 错字容忍：query 长度 ≥4 时允许 1 个字符不匹配（跳过 query 一个字符继续），
  短 query 不启用以防误命中泛滥
- 加权：连续命中加分、单词首字母（`/[\s\-_./]/` 后首字符）命中加分、匹配跨度越短分越高
- 大小写不敏感；中文按字符处理（天然适用子序列规则）
- 结果按分数降序，同分按 lastVisitTime 降序

挂接：搜索框输入非空 → 走缓存 + fuzzyMatch 排序渲染（渲染复用现有 item 模板/删除逻辑）；
输入清空 → 回到原时间浏览管线。原生 chrome.history.search(text) 搜索路径退役。

## 2. `site:` 语法 + 「按网站」视图 — `src/groupview.js` + main.js 挂接

查询解析（在 fuzzy 管线入口）：
- `parseQuery(raw) → {site: string|null, terms: string}`；`site:` 取值到空格为止，
  域名过滤 = hostname 等于该值或以 `.该值` 结尾；剩余 terms 走模糊匹配；两者可组合
- 非法 URL 条目（hostname 解析失败）归入「其他」组

视图切换：
- 搜索栏旁新增切换按钮（两态图标：时钟=按时间 / 网格=按网站），i18n 用一期的 `data-i18n-title` 机制，
  新增 key：`viewByTime`、`viewBySite`；状态存 `chrome.storage.local`（key `view`，值 `"t"|"s"`，默认 `"t"`，
  沿用 storage 现有校验模式：非法值回退默认）
- 「按网站」视图：组行 = favicon + 域名 + 条数徽标，组间按组内最近访问时间降序；
  点击组行展开/收起该组条目（条目按时间降序，复用现有 item 模板与删除逻辑）；
  搜索词在网站视图下同样生效（先过滤再分组）
- 「按网站」视图下日期输入框隐藏（日期过滤只属于时间轴语义）

## 3. 中文日期关键字 — main.js DateParser 入口加翻译层

`translateChineseDateExpr(expr) → string`：中文表达式翻译成现有英文语法再走原解析器，
翻译不命中则原样返回（英文关键字零影响）。映射表：

| 中文 | 译为 |
|---|---|
| 今天 | （空串，= today 语义） |
| 昨天 | yesterday |
| 前天 | -2 d |
| N天前 / N 天前 | -N d |
| N周前 / N星期前 | -N w |
| N个月前 / N月前 | -N m |
| 周一~周日 / 星期一~星期日 | mo~su |
| X月X日 / X月X号 | <monthshort> X（如 7月5日 → jul 5） |
| X月 | <monthshort>（如 10月 → oct） |

数字接受阿拉伯数字与一~十二的汉字数字。日期输入框 placeholder 保持 `today`（i18n zh 下改为「今天」，
en 下仍 today —— 一期该 placeholder 未翻，本期随中文关键字一起放开）。

## 4. 修重复渲染 — main.js 填充循环护栏

根因：历史条目不足以填满容器高度时，填充循环反复拉取同一时间范围，同一批 item 重复 append
（一期验收实证原版 v0.4.3 同样存在）。

修法（不动分页主逻辑）：
- 渲染循环维护 `Set<itemId>`（chrome.history.HistoryItem.id），每批结果先滤掉已见 id
- 若某批结果过滤后为空（全是已见），视为「没有更多」，终止继续拉取
- Set 在重新搜索/清空重渲染（searchAgain、视图切换）时重置

## 错误处理

- 全量拉取失败：走一期既有 HError 路径展示（新增 i18n key `errFetchAll`）
- 20000 条上限：达到上限时更早的记录不进缓存——搜索/网站视图覆盖最近 2 万条访问，
  设计上可接受，不做二级分页（YAGNI）；时间视图不受影响仍可无限翻
- `site:` 值为空（只输入 `site:`）：视为无 site 过滤
- 中文日期翻译后仍非法：沿用原有 `data-css-invalid` 标红行为

## 测试与验证

- `src/fuzzy.js` 纯函数：Node 单测 `tools/test-fuzzy.mjs`（TDD：gh→github 命中、gogle→google 命中、
  短 query 不启用容错、中文子序列、不命中返回 -1、排序稳定性）
- 查询解析/中文日期翻译：同样入 Node 单测（`translateChineseDateExpr`、`parseQuery` 抽成可测纯函数）
- 端到端：一期 CDP 验收管线固化进仓库 `tools/e2e.mjs`（Chrome + `--enable-unsafe-extension-debugging` +
  CDP `Extensions.loadUnpacked`），一期 33 项回归全保留，新增：模糊命中两例、site: 过滤、
  组合查询、网站视图分组/展开/删除、中文日期 5 关键字、种 3 条历史验证不重复渲染
- i18n：新增 key 过 `tools/check-i18n.mjs`

## 分支与里程碑

- 分支 `feature/phase2-search-grouping`，切自 `feature/phase1-i18n-material`（stacked）；
  PR #1 合并后变基 main
- M1 修重复渲染（独立小刀，先落）→ M2 fuzzy.js+单测 → M3 搜索管线挂接 →
  M4 site:+网站视图 → M5 中文日期 → M6 端到端回归+截图
