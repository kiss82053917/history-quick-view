# 四期实施计划：导出/备份

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手动把历史记录导出成 CSV / JSON：stats 页导出当前时间窗口访问明细，popup 搜索态导出当前过滤结果，零新增权限。

**Architecture:** 新增 `src/export.js`（纯函数 toCSV/toJSON/exportFilename + downloadText 触发 Blob 下载）；stats.js 与 groupview.js 各挂两个导出按钮，喂各自已有的内存数据。fetchVisits 补带 title 字段供 stats 导出。

**Tech Stack:** 原生 JS 零构建、Blob + a[download]（无新权限）、Node 单测 + CDP e2e。

## Global Constraints

- 仓库 `D:\projects\history-quick-view`，分支 `feature/phase4-export`（切自 main tip `582246e`）
- 零新增权限：导出用 Blob + `URL.createObjectURL` + 隐藏 `a[download]`，不引入 chrome.downloads
- CSV 必须前置 UTF-8 BOM（`﻿`），RFC 4180 转义（字段含 `,`/`"`/`\n` 时双引号包裹、内部 `"`→`""`），行分隔 `\r\n`
- 新文件 Node 单测加载方式同前几期（src 是上游 `"type":"module"`，读文本 `new Function` 求值）
- 新文案走 i18n 双语，提交前过 `node tools/check-i18n.mjs`（check 脚本已扫 stats.js/stats-data.js；本期把 export.js 加入其 JS 扫描列表）
- 提交信息中文，结尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: export.js 纯函数 + 下载触发（TDD）

**Files:**
- Create: `src/export.js`
- Test: `tools/test-export.mjs`

**Interfaces:**
- Produces（浏览器全局函数）:
  - `toCSV(rows: Array<object>, columns: Array<{key: string, header: string}>) → string`（含 BOM + 表头行 + 数据行，`\r\n` 分隔）
  - `toJSON(rows: Array<object>) → string`（`JSON.stringify(rows, null, 2)`）
  - `exportFilename(prefix: string, ext: string, now: number) → string`（`prefix-YYYYMMDD-HHmm.ext`，本地时间补零）
  - `downloadText(filename: string, mime: string, text: string) → undefined`（Blob 下载，e2e 验证）

- [ ] **Step 1: 写失败的单测 `tools/test-export.mjs`**

```js
// 加载方式说明见 test-fuzzy.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/export.js", import.meta.url), "utf8");
const { toCSV, toJSON, exportFilename } = new Function(
    src + "\nreturn {toCSV, toJSON, exportFilename};"
)();

let pass = 0, fail = 0;
function eq(name, got, want) {
    if (got === want) { pass++; }
    else { fail++; console.error(`FAIL ${name}:\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
}
function ok(name, cond, extra = "") {
    if (cond) { pass++; }
    else { fail++; console.error(`FAIL ${name} ${extra}`); }
}

const cols = [{key: "a", header: "列A"}, {key: "b", header: "B"}];
// BOM 前缀
ok("CSV 带 BOM", toCSV([], cols).charCodeAt(0) === 0xFEFF);
// 表头
eq("CSV 空数据只有表头", toCSV([], cols), "﻿列A,B\r\n");
// 普通行
eq("CSV 普通行", toCSV([{a: "x", b: "y"}], cols), "﻿列A,B\r\nx,y\r\n");
// 含逗号 → 引号包裹
eq("CSV 含逗号", toCSV([{a: "x,z", b: "y"}], cols), "﻿列A,B\r\n\"x,z\",y\r\n");
// 含引号 → 内部双写
eq("CSV 含引号", toCSV([{a: 'a"b', b: "y"}], cols), "﻿列A,B\r\n\"a\"\"b\",y\r\n");
// 含换行 → 引号包裹
eq("CSV 含换行", toCSV([{a: "a\nb", b: "y"}], cols), "﻿列A,B\r\n\"a\nb\",y\r\n");
// 数字/缺字段
eq("CSV 数字与缺字段", toCSV([{a: 3}], cols), "﻿列A,B\r\n3,\r\n");
// 中文正常
ok("CSV 中文", toCSV([{a: "知乎", b: "网"}], cols).includes("知乎,网"));

// JSON
eq("JSON 结构", toJSON([{a: 1}]), "[\n  {\n    \"a\": 1\n  }\n]");
eq("JSON 空", toJSON([]), "[]");

// exportFilename（构造一个固定本地时间：2026-03-05 09:07）
const t = new Date(2026, 2, 5, 9, 7, 0).getTime();
eq("文件名补零", exportFilename("history-export", "csv", t), "history-export-20260305-0907.csv");

console.log(`export: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: 跑单测确认失败**

Run: `node D:/projects/history-quick-view/tools/test-export.mjs`
Expected: FAIL（找不到 ../src/export.js）

- [ ] **Step 3: 实现 `src/export.js`**

```js
"use strict";
/*
 * 导出工具：纯函数 toCSV/toJSON/exportFilename + downloadText 触发下载。
 * CSV 前置 UTF-8 BOM 保证 Excel 中文不乱码；RFC 4180 转义。
 * 零新增权限：Blob + a[download]。
 */

/**@type{(s: string) => string} RFC 4180 单字段转义*/
function csvEscape(s) {
    if (/[",\n\r]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

/**@type{(rows: Array<object>, columns: Array<{key: string, header: string}>) => string}*/
function toCSV(rows, columns) {
    const lines = [];
    lines.push(columns.map(function (c) { return csvEscape(c.header); }).join(","));
    for (const row of rows) {
        lines.push(columns.map(function (c) {
            const v = row[c.key];
            return csvEscape(v === undefined || v === null ? "" : String(v));
        }).join(","));
    }
    return "﻿" + lines.join("\r\n") + "\r\n";
}

/**@type{(rows: Array<object>) => string}*/
function toJSON(rows) {
    return JSON.stringify(rows, null, 2);
}

/**@type{(n: number) => string}*/
function pad2(n) {
    return n < 10 ? "0" + n : String(n);
}

/**@type{(prefix: string, ext: string, now: number) => string}*/
function exportFilename(prefix, ext, now) {
    const d = new Date(now);
    const stamp = d.getFullYear()
        + pad2(d.getMonth() + 1)
        + pad2(d.getDate())
        + "-"
        + pad2(d.getHours())
        + pad2(d.getMinutes());
    return prefix + "-" + stamp + "." + ext;
}

/**@type{(filename: string, mime: string, text: string) => undefined}*/
function downloadText(filename, mime, text) {
    const blob = new Blob([text], {type: mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: 跑单测确认通过**

Run: `node D:/projects/history-quick-view/tools/test-export.mjs`
Expected: `export: 12 PASS / 0 FAIL`

- [ ] **Step 5: Commit**

```bash
cd D:/projects/history-quick-view
git add src/export.js tools/test-export.mjs
git commit -m "feat: 导出工具模块（toCSV带BOM+RFC4180转义/toJSON/文件名/Blob下载）与单测"
```

---

### Task 2: stats 页导出（访问明细）

**Files:**
- Modify: `src/stats-data.js`（fetchVisits 补 title 字段）、`tools/test-stats.mjs`（aggregate 不受影响，仅确认回归）、`src/stats.html`（导出按钮 + 脚本挂载）、`src/stats.js`（导出逻辑）、`src/stats.css`（按钮样式）、`src/_locales/*/messages.json`、`tools/check-i18n.mjs`（JS 扫描列表加 export.js）

**Interfaces:**
- Consumes: Task 1 的 `toCSV`/`toJSON`/`exportFilename`/`downloadText`；stats 的 `S.data.visits`、`S.range`、`S.data.now`、`STATS_DAY`
- Produces: `S.exportedRows(range)`（按窗口过滤 + 映射列，供导出与潜在复用）
- 变更：`fetchVisits` 产出的 visit 记录新增 `title: string` 字段（`{url, host, time, title}`）

- [ ] **Step 1: fetchVisits 补 title**

`src/stats-data.js` 的 `fetchVisits` 内层 push 改为带 title（title 取外层 history item）：

先在 batch 的 map 回调开头，`it` 已有 `it.title`。把：

```js
                for (const x of vs) {
                    if (x.visitTime >= startTime && x.visitTime <= now) {
                        visits.push({url: it.url, host, time: x.visitTime});
                    }
                }
```

改为：

```js
                for (const x of vs) {
                    if (x.visitTime >= startTime && x.visitTime <= now) {
                        visits.push({url: it.url, host, time: x.visitTime, title: it.title ?? ""});
                    }
                }
```

（aggregate 只读 url/host/time，title 多带不影响；`tools/test-stats.mjs` 无需改，跑一遍确认仍 16 PASS。）

Run: `node D:/projects/history-quick-view/tools/test-stats.mjs`
Expected: `stats: 16 PASS / 0 FAIL`

- [ ] **Step 2: stats.html 头部导出按钮 + 脚本**

`<script src="/stats-data.js" defer></script>` 之后加：

```html
        <script src="/export.js" defer></script>
```

stats-header 的 `.range` 之后（`</header>` 之前）加导出组：

```html
                <div class="export">
                    <button type="button" id="exp_csv" data-i18n="exportCSV">Export CSV</button>
                    <button type="button" id="exp_json" data-i18n="exportJSON">Export JSON</button>
                </div>
```

- [ ] **Step 3: i18n keys**

zh_CN：

```json
    "exportCSV": { "message": "导出 CSV" },
    "exportJSON": { "message": "导出 JSON" },
    "exportTitle": { "message": "导出当前结果" },
    "exportColTime": { "message": "时间" },
    "exportColHost": { "message": "网站" },
    "exportColTitle": { "message": "标题" },
    "exportColUrl": { "message": "网址" },
    "exportColLastVisit": { "message": "最后访问" },
```

en：`Export CSV / Export JSON / Export current results / Time / Site / Title / URL / Last visit`。

- [ ] **Step 4: check-i18n.mjs 加 export.js**

JS 扫描列表（Task 三期已是 `["main.js","i18n.js","groupview.js","stats.js","stats-data.js"]`）加 `"export.js"`。

- [ ] **Step 5: stats.js 导出逻辑（文件末尾追加）**

```js
// ---------- 导出（访问明细） ----------
/**@type{() => Array<object>} 按当前窗口过滤 visits，映射导出列*/
S.exportedRows = function () {
    const windowStart = new Date(S.data.now);
    windowStart.setHours(0, 0, 0, 0);
    const start = windowStart.getTime() - (S.range - 1) * STATS_DAY;
    const rows = [];
    for (const v of S.data.visits) {
        if (v.time >= start && v.time <= S.data.now) {
            rows.push({
                time: new Date(v.time).toLocaleString(),
                host: v.host,
                title: v.title ?? "",
                url: v.url,
            });
        }
    }
    rows.sort(function (a, b) { return a.time < b.time ? 1 : -1; });
    return rows;
};

const STATS_EXPORT_COLUMNS = [
    {key: "time", headerKey: "exportColTime"},
    {key: "host", headerKey: "exportColHost"},
    {key: "title", headerKey: "exportColTitle"},
    {key: "url", headerKey: "exportColUrl"},
];

/**@type{(kind: "csv"|"json") => undefined}*/
S.doExport = function (kind) {
    if (S.data === null) {
        return;
    }
    const rows = S.exportedRows();
    if (rows.length === 0) {
        return;
    }
    const name = exportFilename("history-" + S.range + "d", kind, Date.now());
    if (kind === "csv") {
        const cols = STATS_EXPORT_COLUMNS.map(function (c) {
            return {key: c.key, header: chrome.i18n.getMessage(c.headerKey)};
        });
        downloadText(name, "text/csv;charset=utf-8", toCSV(rows, cols));
    } else {
        downloadText(name, "application/json", toJSON(rows));
    }
};

document.getElementById("exp_csv").addEventListener("click", function () { S.doExport("csv"); });
document.getElementById("exp_json").addEventListener("click", function () { S.doExport("json"); });
```

- [ ] **Step 6: stats.css 导出按钮样式（文件末尾）**

```css
.stats-header { flex-wrap: wrap; gap: 8px; }
.export { display: flex; gap: 8px; }
.export button {
    border: 1px solid var(--color-border); background: transparent; color: var(--color);
    font: inherit; font-size: 1.3rem; padding: 6px 12px; border-radius: 8px; cursor: pointer;
}
.export button:hover { background: var(--color-hover); }
```

- [ ] **Step 7: 校验 + CDP 手动验证**

`node tools/check-i18n.mjs` → `i18n OK`。
CDP（可选，正式在 Task 4）：stats 页出现「导出 CSV / 导出 JSON」按钮，中文文案。

- [ ] **Step 8: Commit**

```bash
cd D:/projects/history-quick-view
git add src/stats-data.js src/stats.html src/stats.js src/stats.css src/_locales tools/check-i18n.mjs
git commit -m "feat: 统计页导出访问明细（CSV/JSON，按当前时间窗口，含标题列）"
```

---

### Task 3: popup 搜索结果导出

**Files:**
- Modify: `src/index.html`（export.js 脚本挂载）、`src/groupview.js`（缓存 lastResults + 导出按钮注入 + 处理）、`src/style.css`（按钮样式）

**Interfaces:**
- Consumes: Task 1 的导出函数；`HGroupView` 的 renderFlat/renderGroups 渲染数据
- Produces: `HGroupView.lastResults: Array<chrome.history.HistoryItem>`（当前渲染的扁平结果）；`HGroupView.exportResults(kind)`

- [ ] **Step 1: index.html 挂载 export.js**

`<script src="/main.js" defer></script>` 之前（groupview 依赖它，且都在 main 之后加载亦可；确保 export.js 在 groupview.js 之前）——实际顺序：`... fuzzy.js → datecn.js → main.js → export.js → groupview.js`。在 `<script src="/main.js" defer></script>` 之后、`<script src="/groupview.js" defer></script>` 之前加：

```html
        <script src="/export.js" defer></script>
```

- [ ] **Step 2: renderGroups 缓存 lastResults**

（renderFlat 的 lastResults 赋值合并进 Step 3 的改动，此处不重复。）

`src/groupview.js` `renderGroups` 内，`const sorted = ...` 之后、构建 frag 之前加（扁平化全部分组条目）：

```js
        HGroupView.lastResults = sorted.flatMap(function (entry) { return entry[1]; });
```

在 `HGroupView` 对象里加初始字段（`MAX_RESULTS: 500,` 之后）：

```js
    /**@type{Array<chrome.history.HistoryItem>}*/
    lastResults: [],
```

- [ ] **Step 3: 导出按钮注入 range 头 + 处理函数**

`renderFlat` 里给 section 标题追加导出按钮。把：

```js
        const frag = HRange.TEMPLATE_SEARCH.cloneNode(true);
        const section = frag.firstElementChild;
        section.querySelector(".title").insertAdjacentText(
            "beforeend",
            chrome.i18n.getMessage("searchResults", [String(results.length)])
        );
```

改为：

```js
        HGroupView.lastResults = results;
        const frag = HRange.TEMPLATE_SEARCH.cloneNode(true);
        const section = frag.firstElementChild;
        section.querySelector(".title").insertAdjacentText(
            "beforeend",
            chrome.i18n.getMessage("searchResults", [String(results.length)])
        );
        if (results.length > 0) {
            section.appendChild(HGroupView.makeExportBtn());
        }
```

（注意：上面 Step 2 已加 `HGroupView.lastResults = results;`——合并为这一处，勿重复。）

在 `HGroupView` 对象内加方法（`onclick` 之前）：

```js
    makeExportBtn() {
        const btn = document.createElement("button");
        btn.className = "shell export-btn";
        btn.type = "button";
        btn.title = chrome.i18n.getMessage("exportTitle");
        btn.setAttribute("data-export", "");
        btn.innerHTML = '<svg class="icon icon-download" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>';
        return btn;
    },
    /**@type{(kind: "csv"|"json") => undefined}*/
    exportResults(kind) {
        const items = HGroupView.lastResults;
        if (items.length === 0) {
            return;
        }
        const rows = items.map(function (it) {
            let host = "";
            try {
                host = new URL(it.url).hostname.toLowerCase();
            } catch { /* 保持空串 */ }
            return {
                title: it.title ?? "",
                host,
                url: it.url,
                lastVisit: new Date(it.lastVisitTime).toLocaleString(),
            };
        });
        const name = exportFilename("history-search", kind, Date.now());
        if (kind === "csv") {
            const cols = [
                {key: "title", header: chrome.i18n.getMessage("exportColTitle")},
                {key: "host", header: chrome.i18n.getMessage("exportColHost")},
                {key: "url", header: chrome.i18n.getMessage("exportColUrl")},
                {key: "lastVisit", header: chrome.i18n.getMessage("exportColLastVisit")},
            ];
            downloadText(name, "text/csv;charset=utf-8", toCSV(rows, cols));
        } else {
            downloadText(name, "application/json", toJSON(rows));
        }
    },
```

- [ ] **Step 4: 导出按钮点击 → 弹格式选择（在 onclick 里拦截）**

`HGroupView.onclick` 开头（`const type = ...` 之后）加导出分支——点击导出按钮时用原生 confirm 选格式（避免额外 UI）：

```js
        if (target.closest("[data-export]") !== null) {
            e.preventDefault();
            //确定=CSV，取消=JSON（tooltip 已说明；轻量交互）
            const csv = window.confirm(chrome.i18n.getMessage("exportChoose"));
            HGroupView.exportResults(csv ? "csv" : "json");
            return;
        }
```

新增 i18n key（zh_CN / en）：

```json
    "exportChoose": { "message": "确定导出 CSV，取消导出 JSON" }
```

en：`OK to export CSV, Cancel for JSON`。

- [ ] **Step 5: style.css 导出按钮样式（文件末尾）**

```css
/*PHASE4: 搜索结果导出按钮*/
#g_container .range .export-btn {
    position: absolute;
    right: 8px;
    top: 4px;
    z-index: var(--z-index-mid);
    padding: 4px;
}
#g_container .range { position: relative; }
```

- [ ] **Step 6: 校验 + CDP 手动验证**

`node tools/check-i18n.mjs` → `i18n OK`。
CDP：popup 搜索 `gh` → 结果标题行出现导出图标；点击 → confirm 弹窗 → 触发下载。

- [ ] **Step 7: Commit**

```bash
cd D:/projects/history-quick-view
git add src/index.html src/groupview.js src/style.css src/_locales
git commit -m "feat: popup 搜索结果导出（CSV/JSON，结果标题行导出按钮+格式选择）"
```

---

### Task 4: e2e 增补 + 收口

**Files:**
- Modify: `tools/e2e.mjs`（下载行为设置 + 导出断言）

**Interfaces:**
- Consumes: Task 1-3 全部成果

- [ ] **Step 1: e2e 顶部设置下载目录**

`tools/e2e.mjs` 里，装扩展后、种子数据前，给 page 的 CDP 会话设下载行为。在 `await c.send("Page.enable");` 之后加：

```js
const DL_DIR = fileURLToPath(new URL("./e2e-downloads/", import.meta.url));
rmSync(DL_DIR, { recursive: true, force: true });
mkdirSync(DL_DIR, { recursive: true });
await c.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DL_DIR,
});
```

（`fileURLToPath`、`rmSync`、`mkdirSync` 已在 e2e.mjs 顶部 import。）

- [ ] **Step 2: stats 断言块追加导出验证**

在三期 stats 断言块末尾（切回深色 theme 之后、`// ---------- 收尾 ----------` 之前）加：

```js
// —— 四期：stats 导出 ——
const { readdirSync, readFileSync: readF } = await import("node:fs");
await ev(`document.getElementById("exp_csv").click()`);
await sleep(800);
const csvFiles = readdirSync(DL_DIR).filter((f) => f.endsWith(".csv"));
check("stats 导出 CSV 文件生成", csvFiles.length >= 1, JSON.stringify(readdirSync(DL_DIR)));
if (csvFiles.length > 0) {
    const csv = readF(DL_DIR + "/" + csvFiles[0], "utf8");
    check("CSV 含 BOM", csv.charCodeAt(0) === 0xFEFF);
    check("CSV 含表头", csv.includes("时间") && csv.includes("网址"));
    check("CSV 有数据行", csv.trim().split("\n").length >= 2);
}
await ev(`document.getElementById("exp_json").click()`);
await sleep(800);
check("stats 导出 JSON 文件生成", readdirSync(DL_DIR).some((f) => f.endsWith(".json")));
```

- [ ] **Step 3: popup 导出断言（在快捷键块之前、popup 仍在的时机）**

在 e2e 的搜索相关断言区（`site:+词组合` 之后、清空回时间视图之前）加：

```js
// —— 四期：popup 搜索结果导出 ——
await type("git");
check("导出按钮出现", await ev(`document.querySelector('#g_container [data-export]') !== null`));
// 拦截 confirm 返回 true（导 CSV）
await ev(`window.confirm = function () { return true; }`);
await ev(`document.querySelector('#g_container [data-export]').click()`);
await sleep(800);
check("popup 导出 CSV 生成", (await import("node:fs")).readdirSync(DL_DIR).some((f) => f.startsWith("history-search")));
```

（注意 DL_DIR 变量作用域：确保它在整个断言流程可见——定义在 Step 1 的顶层。）

- [ ] **Step 4: 全套验证**

```powershell
node D:/projects/history-quick-view/tools/test-fuzzy.mjs
node D:/projects/history-quick-view/tools/test-datecn.mjs
node D:/projects/history-quick-view/tools/test-stats.mjs
node D:/projects/history-quick-view/tools/test-export.mjs
node D:/projects/history-quick-view/tools/check-i18n.mjs
node D:/projects/history-quick-view/tools/e2e.mjs
```

Expected: 全绿（e2e ≈ 71+7 项）。

- [ ] **Step 5: .gitignore 加下载目录**

`.gitignore` 追加 `tools/e2e-downloads/`。

- [ ] **Step 6: Commit**

```bash
cd D:/projects/history-quick-view
git add tools/e2e.mjs .gitignore
git commit -m "test: e2e 增补导出断言（下载目录+CSV/JSON文件与BOM/表头校验）"
```

---

## 自查记录

- Spec 覆盖：export.js 三纯函数+下载（T1）、stats 导出+fetchVisits 补 title（T2）、popup 导出（T3）、CSV BOM/RFC4180（T1 单测坐实）、e2e 下载验证（T4）、i18n（T2/T3）✓
- 无占位符：全部步骤含完整代码/精确命令 ✓
- 一致性：`toCSV(rows, columns)` 列参数 `{key, header}` 在 T1 定义、T2/T3 构造一致；`downloadText(name, mime, text)`、`exportFilename(prefix, ext, now)` 贯穿；`HGroupView.lastResults` T3 定义并单处赋值（Step 2/3 已提示合并避免重复）✓
- 风险注记：popup 导出用 `window.confirm` 选格式是轻量交互（tooltip+confirm 文案说明），非弹自定义 UI，符合零 UI 膨胀取向；stats 导出文件名前缀带范围天数（`history-30d-...`）便于区分
