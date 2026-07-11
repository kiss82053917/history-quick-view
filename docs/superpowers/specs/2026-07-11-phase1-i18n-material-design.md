# History Quick View 改造一期：汉化 + Chrome 原生风格美化 — 设计文档

日期：2026-07-11
状态：已获用户认可（方案 A）

## 背景与目标

用户基于 [kiss82053917/history-quick-view](https://github.com/kiss82053917/history-quick-view)（上游原作者 AxelArielSaravia，v0.4.3，MIT）fork 改造，做自己的 Chrome 历史记录插件。整体规划四期：

1. **一期（本文档）**：界面汉化 + 贴近 Chrome 原生 Material 风格的美化
2. 二期：更强的搜索/分组（域名分组、频率排序、模糊搜索）
3. 三期：统计/可视化（Top 网站、时间分布）
4. 四期：导出/备份（CSV/JSON）

一期原则：**功能零改动**——搜索、日期筛选、删除、快捷键、选项全部保持原样，只做语言与外观。

## 现状

- 本地仓库：`D:\projects\history-quick-view`（clone 自 fork 仓库，基线 `eb16a3d` v0.4.3）
- 结构：`src/` 为开发源码（原生 JS 零框架，index.html 536 行 / main.js 1636 行 / style.css 442 行），`extension/` 为 build.sh（bun + tdewolff/minify）产出的压缩版
- MV3，权限 `favicon / storage / history`，popup 单页

## 方案（A，已拍板）

保持原有零构建结构，开发与验证都直接针对 `src/`（以"加载已解压的扩展程序"方式加载 `src/` 目录）。`extension/` 与 `build.sh` 一期不动，后续需要发布时再处理构建。

### 1. 国际化（chrome.i18n 双语）

- `manifest.json`：加 `"default_locale": "zh_CN"`；`name` / `description` / `default_title` 改为 `__MSG_xxx__` 引用
- 新建 `src/_locales/zh_CN/messages.json`（默认）与 `src/_locales/en/messages.json`（保留英文，为将来发布商店留路）
- HTML 静态文案：为带文案的元素加 `data-i18n="key"`（占位符用 `data-i18n-placeholder`、title 用 `data-i18n-title`），popup 启动时 JS 统一扫描填充——MV3 popup 标准做法
- JS 动态文案（错误提示、相对日期词如 "yesterday"、确认文案等）：改为 `chrome.i18n.getMessage()` 调用
- 特别注意：原插件支持 "yesterday" 等**日期搜索表达式**，这类属于"输入语法"而非展示文案——一期保持英文关键字不变（避免改动解析逻辑，违背功能零改动原则），仅在提示文案里说明；中文关键字支持留给二期搜索增强
- 语言判定交给 Chrome 本身（浏览器 UI 语言），不做手动切换开关（YAGNI）

### 2. Material 化样式（style.css 重写）

- 参照 Chrome 自带历史页（chrome://history）的视觉：
  - 主色 Google 蓝 `#1a73e8`（深色模式 `#8ab4f8`），全部颜色收敛为 CSS 变量
  - 字体栈 `Roboto, system-ui, "Segoe UI", sans-serif`
  - 列表行布局：favicon + 标题 + 域名（次要色）+ 时间 + hover 时浮现删除按钮
  - 行 hover 背景态、8px 圆角卡片、Material 风格分隔与间距
- 深浅色：`@media (prefers-color-scheme: dark)` 自动切换，两套变量
- 不改 HTML 结构语义，只在必要处加 class；DOM 结构改动最小化以免碰坏 main.js 的选择器

### 3. 明确不做（一期）

- 不引入任何框架/构建工具
- 不改任何业务逻辑（搜索、删除、日期解析、快捷键）
- 不做语言切换 UI、不做日期表达式中文化
- 不动 `extension/` 产物与 `build.sh`

## 错误处理

- i18n key 缺失时 `getMessage` 返回空串：填充函数遇空串保留元素原文案（英文兜底），不出现空白 UI
- 深浅色仅靠 CSS 变量切换，无 JS 参与，无新增出错面

## 验证

1. Chrome「加载已解压的扩展程序」指向 `src/`，弹窗实际打开
2. 用 chrome-devtools-mcp 驱动：核对全部界面文案为中文、无漏翻英文残留（en 语言下核对英文完整）
3. 深浅色各截图一张，与 Chrome 历史页风格对照
4. 功能回归：搜索、日期筛选、单条删除、范围删除、快捷键、选项页各过一遍，确认与改造前行为一致

## 里程碑

- M1：i18n 骨架（_locales + manifest + 填充函数）跑通，界面主体中文
- M2：全部文案覆盖（HTML 静态 + JS 动态），en/zh_CN 双语核对
- M3：Material 样式完成，深浅色验收
- M4：功能回归 + 截图验收，一期收口
