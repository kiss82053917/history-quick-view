# History Quick View 四期：导出/备份 — 设计文档

日期：2026-07-11
状态：已获用户认可（方案 A：共享导出模块 + 两入口）
前置：一二三期已合并入 main（tip `582246e`，PR #1 已合并）

## 范围（用户拍板）

手动导出（不做定时自动备份，避免后台 worker + alarms + downloads 权限的体量与打扰）。
两个入口、两种格式：

1. **stats 页**导出当前时间窗口（7/30/90 天）内的**访问明细**（每次访问一行）
2. **popup 搜索态**导出当前过滤结果（模糊/site: 筛出的那批）
3. 格式：CSV（给 Excel）+ JSON（给程序）

明确不做（YAGNI）：定时自动备份、chrome.downloads API、导出到云端、自定义列。

## 架构

一个新文件 + 两处挂接，零新增权限（Blob + `a[download]` 触发浏览器原生下载）：

- `src/export.js` — 纯逻辑 + 下载触发：
  - `toCSV(rows: Array<object>, columns: Array<{key,header}>) → string`
    （首行表头；RFC 4180 转义：字段含 `,` `"` `\n` 时用双引号包裹、内部 `"` 转 `""`；行分隔 `\r\n`）
  - `toJSON(rows: Array<object>) → string`（`JSON.stringify(rows, null, 2)`）
  - `downloadText(filename, mime, text) → undefined`
    （前置 UTF-8 BOM `﻿` 到文本 → `new Blob` → `URL.createObjectURL` → 隐藏 `a[download]` 点击 → `revokeObjectURL`）
  - `exportFilename(prefix, ext, now) → string`（`prefix-YYYYMMDD-HHmm.ext`，纯函数可测）
  - 三个纯函数 + exportFilename 走 Node 单测；downloadText 靠 e2e
- stats 页挂接：`stats.html` 头部加「导出 CSV / 导出 JSON」两按钮；`stats.js`
  用当前 `S.range` 窗口过滤 `S.data.visits`，列 = 时间(ISO本地)/域名/标题/URL；
  标题需从原始 history items 取（visits 只有 url/host/time）——**stats-data.js 的 fetchVisits
  在 visit 记录里补带 title 字段**（getVisits 拿不到 title，用外层 history item 的 title）
- popup 挂接：搜索结果标题行（`#g_container` 里的「搜索结果（N 条）」range 头）右侧加导出图标按钮；
  `groupview.js` 记住当前渲染的结果数组（`HGroupView.lastResults`），导出列 = 标题/URL/最后访问时间

## 数据流

- stats 导出：`S.data.visits`（已在内存）→ 按 `S.range` 窗口过滤 → 映射列 → toCSV/toJSON → downloadText
- popup 导出：`HGroupView.lastResults`（renderFlat/renderGroups 时缓存）→ 映射列 → 同上
- popup 网站视图（分组态）导出：导出该视图下的全部条目（扁平化，含域名列）

## 界面与国际化

- stats 头部两按钮，i18n key `exportCSV` / `exportJSON`；popup 导出按钮 tooltip `exportTitle`
- 弹出下载由浏览器接管（本设计属"下载文件"——但这是用户主动点击自己的数据导出到本地，
  非外发；文件名与内容完全本地生成，无网络）

## 错误处理

- 空结果导出：按钮在无数据时禁用（stats 空态/popup 无结果时不显示导出入口）
- 超大导出（stats 90 天可能数万行）：字符串拼接同步完成，实测毫秒级；不做分片
- 文件名时间戳用本地时间；同分钟内重复导出会覆盖（可接受，用户手动行为）

## 测试

- `tools/test-export.mjs`：`toCSV`（普通/含逗号/含引号/含换行/含中文/空数组）、`toJSON`、
  `exportFilename`（补零格式）纯函数单测
- `tools/e2e.mjs` 增补：CDP `Browser.setDownloadBehavior` 指向临时目录 → stats 页点导出 CSV →
  读文件断言含 BOM、表头、行数≈visits 数；popup 搜索态点导出 → 断言文件生成
- i18n：新增 key 过 check-i18n

## 分支与里程碑

- 分支 `feature/phase4-export`，切自 main
- M1 export.js + 单测 → M2 stats 导出挂接（含 fetchVisits 补 title）→ M3 popup 导出挂接 →
  M4 e2e 增补 + 收口
