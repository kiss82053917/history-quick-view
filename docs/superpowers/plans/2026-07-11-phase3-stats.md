# 三期实施计划：统计可视化

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 独立 stats 标签页：常去网站 Top 10、24 小时分布、每日趋势，7/30/90 天范围切换，手写 SVG、三主题、双语。

**Architecture:** popup 头部按钮打开 `stats.html`；数据层 `stats-data.js`（fetchVisits 分批拉真实访问点 + aggregate 纯函数聚合）；呈现层 `stats.js` 手写 SVG 三图 + stat tile 汇总 + tooltip；90 天一次拉齐，范围切换内存重聚合。popup 现有代码只加一个按钮分支。

**Tech Stack:** 原生 JS 零构建、chrome.history.getVisits、SVG、dataviz 规范（单系列主色/细标记/工具提示/数据表兜底）。

## Global Constraints

- 仓库 `D:\projects\history-quick-view`，分支 `feature/phase3-stats`（切自 `feature/phase1-i18n-material`）
- popup 两条既有管线零改动（只加 HHeader 一个按钮分支）
- 图表遵循 dataviz 规范：单系列一律用主题主色（浅 `#1a73e8`/深 `#8ab4f8`）；条/柱 ≤24px、数据端 4px 圆角基线直角；线 2px；网格 1px `--color-border`；文字用文本色 token 不用系列色；单系列无图例；hover 必有 tooltip；每图带折叠数据表
- 新文案走 i18n 双语，提交前过 `node tools/check-i18n.mjs`（本期扩展其扫描 stats 文件）
- Node 单测加载方式与二期一致（src 是上游 `"type":"module"`，读文本 `new Function` 求值）
- 提交信息中文，结尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: 聚合纯函数 aggregate（TDD）

**Files:**
- Create: `src/stats-data.js`
- Test: `tools/test-stats.mjs`

**Interfaces:**
- Produces:
  - `aggregate(visits: Array<{url,host,time}>, rangeDays: number, now: number) → {topSites: Array<{host,count,sampleUrl}>, byHour: number[24], byDay: Array<{dayStart:number,count:number}>, total: number, uniqueSites: number}`
    窗口 = 含 now 当天的 rangeDays 个本地自然日；byDay 补零对齐；topSites 按 count 降序、同 count 按 host 升序、截 10；host 为空串的条目计入 total/byHour/byDay 但不进 topSites/uniqueSites
  - `fetchVisits(days) → Promise<{visits, capped, now}>`（chrome API，本任务先写好、Task 2 接线后实测）
  - 常量 `STATS_DAY = 86400000`

- [ ] **Step 1: 写失败的单测 `tools/test-stats.mjs`**

```js
// 加载方式说明见 test-fuzzy.mjs
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/stats-data.js", import.meta.url), "utf8");
const { aggregate } = new Function(
    "chrome",
    src + "\nreturn {aggregate};"
)(undefined);

let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
    if (cond) { pass++; }
    else { fail++; console.error(`FAIL ${name} ${extra}`); }
}

const DAY = 86400000;
// 固定 now：取"今天本地正午"，避免跨时区断言脆弱
const nowD = new Date();
nowD.setHours(12, 0, 0, 0);
const now = nowD.getTime();
const H = 3600000;
const v = (hoursAgo, host = "a.com", url = "https://" + host + "/p") =>
    ({url, host, time: now - hoursAgo * H});

// 空输入
let r = aggregate([], 7, now);
ok("空: total=0", r.total === 0);
ok("空: byDay 长度=7", r.byDay.length === 7);
ok("空: byHour 长度=24", r.byHour.length === 24 && r.byHour.every((x) => x === 0));
ok("空: topSites 空", r.topSites.length === 0 && r.uniqueSites === 0);

// 窗口过滤：7 天窗含今天正午起往前 6 个整天
r = aggregate([v(1), v(30), v(24 * 6 + 11), v(24 * 10)], 7, now);
ok("窗口内 3 条", r.total === 3, `got ${r.total}`);
ok("超窗 1 条被滤", r.byDay.reduce((s, d) => s + d.count, 0) === 3);

// byDay 对齐：最后一格是今天
r = aggregate([v(1), v(25)], 7, now);
ok("今天 1 条", r.byDay[6].count === 1);
ok("昨天 1 条", r.byDay[5].count === 1);
ok("dayStart 递增", r.byDay.every((d, i) => i === 0 || d.dayStart === r.byDay[i - 1].dayStart + DAY));

// byHour：正午前 1 小时 = 11 点
r = aggregate([v(1)], 7, now);
ok("11 点计 1", r.byHour[11] === 1, JSON.stringify(r.byHour));

// host 分组 + Top 排序（count 降序、同分 host 升序）
r = aggregate([
    v(1, "b.com"), v(2, "b.com"), v(3, "a.com"), v(4, "a.com"), v(5, "c.com"),
], 7, now);
ok("uniqueSites=3", r.uniqueSites === 3);
ok("Top 同分按 host 升序", r.topSites[0].host === "a.com" && r.topSites[1].host === "b.com");
ok("Top 带 sampleUrl", r.topSites[0].sampleUrl.includes("a.com"));

// host 空串：计入 total 不进榜
r = aggregate([v(1, ""), v(2, "a.com")], 7, now);
ok("空 host 计 total", r.total === 2);
ok("空 host 不进榜", r.topSites.length === 1 && r.uniqueSites === 1);

// Top 截断 10
const many = [];
for (let i = 0; i < 12; i++) many.push(v(1 + i, `s${String(i).padStart(2, "0")}.com`));
r = aggregate(many, 7, now);
ok("Top 截 10", r.topSites.length === 10);

console.log(`stats: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: 跑单测确认失败**

Run: `node D:/projects/history-quick-view/tools/test-stats.mjs`
Expected: FAIL（找不到 ../src/stats-data.js）

- [ ] **Step 3: 实现 `src/stats-data.js`**

```js
"use strict";
/*
 * 统计数据层：fetchVisits 拉真实访问时间点（分批 getVisits），
 * aggregate 纯函数聚合（Node 可单测，不碰 chrome API）。
 */

const STATS_DAY = 86400000;
const STATS_MAX_URLS = 20000;
const STATS_BATCH = 500;

/**@type{(t: number) => number} 本地自然日零点*/
function startOfLocalDay(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/**
 * @type{(
 *  visits: Array<{url: string, host: string, time: number}>,
 *  rangeDays: number,
 *  now: number
 * ) => {
 *  topSites: Array<{host: string, count: number, sampleUrl: string}>,
 *  byHour: Array<number>,
 *  byDay: Array<{dayStart: number, count: number}>,
 *  total: number,
 *  uniqueSites: number,
 * }}*/
function aggregate(visits, rangeDays, now) {
    const windowStart = startOfLocalDay(now) - (rangeDays - 1) * STATS_DAY;
    const byHour = new Array(24).fill(0);
    const byDay = [];
    for (let i = 0; i < rangeDays; i += 1) {
        byDay.push({dayStart: windowStart + i * STATS_DAY, count: 0});
    }
    /**@type{Map<string, {count: number, sampleUrl: string, lastTime: number}>}*/
    const hosts = new Map();
    let total = 0;
    for (const v of visits) {
        if (v.time < windowStart || v.time > now) {
            continue;
        }
        total += 1;
        const d = new Date(v.time);
        byHour[d.getHours()] += 1;
        const di = Math.floor((startOfLocalDay(v.time) - windowStart) / STATS_DAY);
        if (0 <= di && di < byDay.length) {
            byDay[di].count += 1;
        }
        if (v.host !== "") {
            const h = hosts.get(v.host);
            if (h === undefined) {
                hosts.set(v.host, {count: 1, sampleUrl: v.url, lastTime: v.time});
            } else {
                h.count += 1;
                if (v.time > h.lastTime) {
                    h.lastTime = v.time;
                    h.sampleUrl = v.url;
                }
            }
        }
    }
    const topSites = [...hosts.entries()]
        .sort(function (a, b) {
            return b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1);
        })
        .slice(0, 10)
        .map(function (e) {
            return {host: e[0], count: e[1].count, sampleUrl: e[1].sampleUrl};
        });
    return {topSites, byHour, byDay, total, uniqueSites: hosts.size};
}

/**@type{(days: number) => Promise<{visits: Array<{url,host,time}>, capped: boolean, now: number}>}*/
async function fetchVisits(days) {
    const now = Date.now();
    const startTime = now - days * STATS_DAY;
    const items = await chrome.history.search({
        text: "",
        startTime,
        maxResults: STATS_MAX_URLS,
    });
    const capped = items.length >= STATS_MAX_URLS;
    const visits = [];
    for (let i = 0; i < items.length; i += STATS_BATCH) {
        const batch = items.slice(i, i + STATS_BATCH);
        await Promise.all(batch.map(async function (it) {
            let host = "";
            try {
                host = new URL(it.url).hostname.toLowerCase();
            } catch { /* host 留空串，聚合时不进榜 */ }
            try {
                const vs = await chrome.history.getVisits({url: it.url});
                for (const x of vs) {
                    if (x.visitTime >= startTime && x.visitTime <= now) {
                        visits.push({url: it.url, host, time: x.visitTime});
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }));
    }
    return {visits, capped, now};
}
```

- [ ] **Step 4: 跑单测确认通过**

Run: `node D:/projects/history-quick-view/tools/test-stats.mjs`
Expected: `stats: 18 PASS / 0 FAIL`

- [ ] **Step 5: Commit**

```bash
cd D:/projects/history-quick-view
git add src/stats-data.js tools/test-stats.mjs
git commit -m "feat: 统计数据层（分批getVisits拉取+纯函数聚合）与单测"
```

---

### Task 2: stats 页骨架 + popup 入口 + i18n

**Files:**
- Create: `src/stats.html`、`src/stats.css`、`src/stats.js`（本任务：主题/范围切换/汇总 tile/加载态/空态/错误条；三图占位容器，Task 3 填）
- Modify: `src/index.html`（头部按钮）、`src/main.js:1052-1070`（HHeader.onclick）、`src/_locales/*/messages.json`、`tools/check-i18n.mjs`（扫描范围扩展）

**Interfaces:**
- Consumes: Task 1 的 `fetchVisits`/`aggregate`
- Produces: i18n keys（见 Step 3）；`stats.js` 内 `HStats.rerender()`（Task 3 的图表渲染函数挂进它）；三个图表容器 `#chart_top` `#chart_hour` `#chart_day`（各含 `.chart-body` 与 `<details class="chart-table">`）

- [ ] **Step 1: `src/stats.html`**

```html
<!doctype html>
<html lang="en" class="d">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>History stats</title>
        <link rel="stylesheet" href="/stats.css">
        <script src="/i18n.js" defer></script>
        <script src="/stats-data.js" defer></script>
        <script src="/stats.js" defer></script>
    </head>
    <body>
        <main class="stats">
            <header class="stats-header">
                <h1 data-i18n="statsTitle">History stats</h1>
                <div class="range" role="group">
                    <button type="button" data-range="7" data-i18n="statsRange7">7 days</button>
                    <button type="button" data-range="30" data-i18n="statsRange30">30 days</button>
                    <button type="button" data-range="90" data-i18n="statsRange90">90 days</button>
                </div>
            </header>
            <p id="s_loading" data-i18n="statsLoading">Loading…</p>
            <p id="s_empty" data-css-hidden data-i18n="noHistory">No History</p>
            <p id="s_error" data-css-hidden data-i18n="errFetchAll">Failed to load history</p>
            <div id="s_content" data-css-hidden>
                <section class="tiles">
                    <div class="tile">
                        <p class="label" data-i18n="statsTotalVisits">Total visits</p>
                        <p class="value" id="v_total"></p>
                    </div>
                    <div class="tile">
                        <p class="label" data-i18n="statsUniqueSites">Unique sites</p>
                        <p class="value" id="v_sites"></p>
                    </div>
                </section>
                <section class="chart" id="chart_top">
                    <h2 data-i18n="statsTopSites">Top sites</h2>
                    <div class="chart-body"></div>
                    <details class="chart-table">
                        <summary data-i18n="statsShowTable">Show data table</summary>
                        <table></table>
                    </details>
                </section>
                <section class="chart" id="chart_hour">
                    <h2 data-i18n="statsByHour">Visits by hour</h2>
                    <div class="chart-body"></div>
                    <details class="chart-table">
                        <summary data-i18n="statsShowTable">Show data table</summary>
                        <table></table>
                    </details>
                </section>
                <section class="chart" id="chart_day">
                    <h2 data-i18n="statsByDay">Daily trend</h2>
                    <div class="chart-body"></div>
                    <details class="chart-table">
                        <summary data-i18n="statsShowTable">Show data table</summary>
                        <table></table>
                    </details>
                </section>
                <p id="s_cap" class="cap" data-css-hidden data-i18n="statsCapNote">Based on the most recent 20,000 history entries</p>
            </div>
            <div id="s_tooltip" class="tooltip" data-css-hidden></div>
        </main>
    </body>
</html>
```

- [ ] **Step 2: `src/stats.css`**

主题变量块从 style.css 原样复制（`html.d`/`html.l`/两段 `@media` 的 `html.a`，共四块，值不改），再加 stats 布局：

```css
/* ……四块主题变量（照抄 style.css 的 html.d / html.l / @media html.a）…… */

html {
    background: var(--color-bg, #202124);
    font-size: 10px;
    box-sizing: border-box;
}
*, *::before, *::after { box-sizing: inherit; }
body {
    margin: 0;
    font-family: "Roboto","Segoe UI",system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
    background: var(--color-bg);
    color: var(--color);
}
[data-css-hidden] { display: none; }

.stats {
    max-width: 720px;
    margin: 0 auto;
    padding: 24px 16px 40px;
}
.stats-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 16px;
}
.stats-header h1 { font-size: 2rem; font-weight: 500; margin: 0; }

.range { display: flex; gap: 0; border: 1px solid var(--color-border); border-radius: 18px; overflow: hidden; }
.range button {
    border: none; background: transparent; color: var(--color);
    font: inherit; font-size: 1.3rem; padding: 6px 14px; cursor: pointer;
}
.range button:hover { background: var(--color-hover); }
.range button[data-active] { background: var(--color-primary); color: var(--color-bg); }

#s_loading, #s_empty, #s_error { font-size: 1.4rem; color: var(--color-secondary); padding: 40px 0; text-align: center; }
#s_error { color: var(--color-danger); }

.tiles { display: flex; gap: 16px; padding-bottom: 8px; }
.tile { flex: 1; background: var(--color-bg-d); border-radius: 8px; padding: 14px 16px; }
.tile .label { margin: 0; font-size: 1.3rem; color: var(--color-secondary); }
.tile .value { margin: 4px 0 0; font-size: 2.8rem; font-weight: 600; }

.chart { padding: 20px 0 4px; }
.chart h2 { font-size: 1.5rem; font-weight: 500; margin: 0 0 12px; }
.chart svg { display: block; width: 100%; height: auto; }
.chart text { font-size: 11px; fill: var(--color-secondary); font-family: inherit; }

/* Top 榜（HTML 比例条） */
.toprow { display: flex; align-items: center; gap: 8px; height: 30px; }
.toprow img { width: 16px; height: 16px; }
.toprow .host { width: 180px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 1.3rem; }
.toprow .bar-track { flex: 1; }
.toprow .bar {
    height: 16px; max-height: 16px;
    background: var(--color-primary);
    border-radius: 0 4px 4px 0; /* 数据端圆角、基线端直角 */
}
.toprow .count { width: 56px; text-align: right; font-size: 1.3rem; color: var(--color-secondary); font-variant-numeric: tabular-nums; }
.toprow:hover { background: var(--color-hover); border-radius: 6px; cursor: pointer; }

.chart-table { padding-top: 6px; }
.chart-table summary { font-size: 1.2rem; color: var(--color-secondary); cursor: pointer; }
.chart-table table { border-collapse: collapse; font-size: 1.2rem; margin-top: 6px; }
.chart-table td, .chart-table th { border: 1px solid var(--color-border); padding: 3px 10px; font-variant-numeric: tabular-nums; }

.cap { font-size: 1.2rem; color: var(--color-secondary); }

.tooltip {
    position: fixed; z-index: 10; pointer-events: none;
    background: var(--color-bg-d); color: var(--color);
    border: 1px solid var(--color-border); border-radius: 6px;
    padding: 5px 9px; font-size: 1.2rem; white-space: nowrap;
}
```

- [ ] **Step 3: i18n keys（双语各加一段）**

zh_CN：

```json
    "ttStats": { "message": "统计" },
    "statsTitle": { "message": "浏览统计" },
    "statsLoading": { "message": "正在统计，历史较多时需要几秒…" },
    "statsRange7": { "message": "7 天" },
    "statsRange30": { "message": "30 天" },
    "statsRange90": { "message": "90 天" },
    "statsTotalVisits": { "message": "总访问次数" },
    "statsUniqueSites": { "message": "独立网站数" },
    "statsTopSites": { "message": "常去网站 Top 10" },
    "statsByHour": { "message": "24 小时分布" },
    "statsByDay": { "message": "每日趋势" },
    "statsShowTable": { "message": "查看数据表" },
    "statsCapNote": { "message": "统计基于最近 20000 条历史记录" },
    "statsVisitsUnit": { "message": "$N$ 次", "placeholders": { "n": { "content": "$1" } } },
    "statsColSite": { "message": "网站" },
    "statsColCount": { "message": "次数" },
    "statsColHour": { "message": "时段" },
    "statsColDate": { "message": "日期" },
```

en 对应：`Stats / Browsing stats / Crunching history, this can take a few seconds… / 7 days / 30 days / 90 days / Total visits / Unique sites / Top 10 sites / Visits by hour / Daily trend / Show data table / Based on the most recent 20,000 history entries / $N$ visits / Site / Visits / Hour / Date`。

- [ ] **Step 4: check-i18n.mjs 扫描范围扩展**

HTML 扫描从单文件改为循环 `["index.html", "stats.html"]`（合并计数）；JS 循环列表改为 `["main.js", "i18n.js", "groupview.js", "stats.js", "stats-data.js"]`。标注下限 30 保持不变。

- [ ] **Step 5: popup 入口按钮**

`src/index.html` header nav：在 `button[name="keyboard"]` 之前插入：

```html
                <button
                    name="stats"
                    title="Stats"
                    data-i18n-title="ttStats"
                    type="button"
                    class="shell"
                >
                    <svg
                        class="icon icon-chart"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <line x1="12" x2="12" y1="20" y2="10"/>
                        <line x1="18" x2="18" y1="20" y2="4"/>
                        <line x1="6" x2="6" y1="20" y2="16"/>
                    </svg>
                </button>
```

`src/main.js` HHeader.onclick 的 `name === "keyboard"` 分支之前加：

```js
        } else if (name === "stats") {
            HHeader.openActiveTab(chrome.runtime.getURL("stats.html"));
```

- [ ] **Step 6: `src/stats.js`（骨架版）**

```js
"use strict";
/*
 * 统计页：主题初始化 + 90 天数据拉取（一次）+ 范围切换（内存重聚合）。
 * 图表渲染函数（renderTop/renderHour/renderDay）在 Task 3 填充，
 * 本版 rerender 只填两个汇总 tile。
 */

const S = {
    /**@type{{visits: Array, capped: boolean, now: number}|null}*/
    data: null,
    range: 30,
    el(id) { return document.getElementById(id); },
    /**@type{(n: number) => string} 1284→1,284 / 12900→12.9K*/
    fmt(n) {
        if (n >= 10000) {
            return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
        }
        return n.toLocaleString();
    },
    setRangeButtons() {
        for (const b of document.querySelectorAll(".range button")) {
            if (Number(b.getAttribute("data-range")) === S.range) {
                b.setAttribute("data-active", "");
            } else {
                b.removeAttribute("data-active");
            }
        }
    },
    rerender() {
        const agg = aggregate(S.data.visits, S.range, S.data.now);
        S.el("v_total").textContent = S.fmt(agg.total);
        S.el("v_sites").textContent = S.fmt(agg.uniqueSites);
        if (agg.total === 0) {
            S.el("s_empty").removeAttribute("data-css-hidden");
            S.el("s_content").setAttribute("data-css-hidden", "");
            return;
        }
        S.el("s_empty").setAttribute("data-css-hidden", "");
        S.el("s_content").removeAttribute("data-css-hidden");
        if (typeof renderTop === "function") {
            renderTop(agg);
            renderHour(agg);
            renderDay(agg);
        }
    },
};

chrome.storage.local.get(undefined, function (items) {
    // 主题与 popup 同一存储键；非法值回退深色
    const theme = (items.theme === "l" || items.theme === "a") ? items.theme : "d";
    document.documentElement.setAttribute("class", theme);
    const r = Number(items.statsRange);
    S.range = (r === 7 || r === 30 || r === 90) ? r : 30;
    S.setRangeButtons();

    fetchVisits(90).then(function (data) {
        S.data = data;
        S.el("s_loading").setAttribute("data-css-hidden", "");
        if (data.capped) {
            S.el("s_cap").removeAttribute("data-css-hidden");
        }
        S.rerender();
    }).catch(function (e) {
        console.error(e);
        S.el("s_loading").setAttribute("data-css-hidden", "");
        S.el("s_error").removeAttribute("data-css-hidden");
    });
});

document.querySelector(".range").addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-range]");
    if (btn === null || S.data === null) {
        return;
    }
    S.range = Number(btn.getAttribute("data-range"));
    S.setRangeButtons();
    chrome.storage.local.set({statsRange: S.range}, undefined);
    S.rerender();
});
```

注意：范围持久化用**独立 key** `statsRange`（不并入 popup 的 storage 对象，避免 initStorage 校验冲突）。

- [ ] **Step 7: 校验 + CDP 手动验证**

`node tools/check-i18n.mjs` → `i18n OK`。
CDP：popup 出现统计按钮（tooltip「统计」）；navigate `chrome-extension://<id>/stats.html`：中文标题、加载态→汇总数字出现、范围切换选中态与持久化生效、主题 class 跟随 storage。

- [ ] **Step 8: Commit**

```bash
cd D:/projects/history-quick-view
git add src/stats.html src/stats.css src/stats.js src/index.html src/main.js src/_locales tools/check-i18n.mjs
git commit -m "feat: 统计页骨架（入口/主题/范围切换/汇总tile/加载空错态）"
```

---

### Task 3: 三图 SVG 渲染 + tooltip + 数据表

**Files:**
- Modify: `src/stats.js`（追加渲染函数）、`src/stats.css`（若需微调，仅追加）

**Interfaces:**
- Consumes: Task 2 的容器结构、`S`、i18n keys；Task 1 的 agg 结构
- Produces: 全局 `renderTop(agg)`、`renderHour(agg)`、`renderDay(agg)`（S.rerender 已按存在性调用）

- [ ] **Step 1: 追加公共工具 + tooltip（stats.js 末尾）**

```js
// ---------- 图表公共 ----------
const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) {
        el.setAttribute(k, attrs[k]);
    }
    return el;
}
function faviconUrl(src) {
    return chrome.runtime.getURL("/_favicon/") + "?pageUrl=" + src + "&size=16";
}
const Tooltip = {
    EL: document.getElementById("s_tooltip"),
    show(text, x, y) {
        Tooltip.EL.textContent = text;
        Tooltip.EL.removeAttribute("data-css-hidden");
        const w = Tooltip.EL.offsetWidth;
        Tooltip.EL.style.left = Math.min(x + 12, window.innerWidth - w - 8) + "px";
        Tooltip.EL.style.top = (y + 14) + "px";
    },
    hide() {
        Tooltip.EL.setAttribute("data-css-hidden", "");
    },
};
function visitsText(n) {
    return chrome.i18n.getMessage("statsVisitsUnit", [String(n)]);
}
function fillTable(section, headKeys, rows) {
    const table = section.querySelector(".chart-table table");
    table.replaceChildren();
    const tr = document.createElement("tr");
    for (const k of headKeys) {
        const th = document.createElement("th");
        th.textContent = chrome.i18n.getMessage(k);
        tr.appendChild(th);
    }
    table.appendChild(tr);
    for (const row of rows) {
        const trd = document.createElement("tr");
        for (const cell of row) {
            const td = document.createElement("td");
            td.textContent = String(cell);
            trd.appendChild(td);
        }
        table.appendChild(trd);
    }
}
```

- [ ] **Step 2: Top 榜 renderTop（HTML 比例条）**

```js
/**@type{(agg: ReturnType<typeof aggregate>) => undefined}*/
function renderTop(agg) {
    const body = document.querySelector("#chart_top .chart-body");
    body.replaceChildren();
    const max = agg.topSites.length > 0 ? agg.topSites[0].count : 1;
    for (const s of agg.topSites) {
        const row = document.createElement("div");
        row.className = "toprow";
        row.title = s.host;
        const img = document.createElement("img");
        img.src = faviconUrl(s.sampleUrl);
        img.alt = "";
        const host = document.createElement("p");
        host.className = "host";
        host.textContent = s.host;
        const track = document.createElement("div");
        track.className = "bar-track";
        const bar = document.createElement("div");
        bar.className = "bar";
        bar.style.width = Math.max(2, Math.round(s.count / max * 100)) + "%";
        track.appendChild(bar);
        const count = document.createElement("p");
        count.className = "count";
        count.textContent = s.count.toLocaleString();
        row.append(img, host, track, count);
        row.addEventListener("click", function () {
            chrome.tabs.create({url: s.sampleUrl, active: true}, undefined);
        });
        body.appendChild(row);
    }
    fillTable(
        document.getElementById("chart_top"),
        ["statsColSite", "statsColCount"],
        agg.topSites.map(function (s) { return [s.host, s.count]; })
    );
}
```

- [ ] **Step 3: 24 小时柱状 renderHour（SVG）**

规格：viewBox 720×200，绘图区 x∈[32,712] y∈[8,168]，柱宽 = 段宽−2px 间隙（≤24px 上限）、数据端 4px 圆角（用 path 或 rx=4 且柱高≥4 时）；y 轴 3 条 1px 网格 + 取整刻度；仅峰值柱顶标数值；x 轴标 0/6/12/18/23。

```js
/**@type{(agg: ReturnType<typeof aggregate>) => undefined}*/
function renderHour(agg) {
    const body = document.querySelector("#chart_hour .chart-body");
    body.replaceChildren();
    const W = 720, H = 200, L = 32, R = 712, T = 8, B = 168;
    const svg = svgEl("svg", {viewBox: `0 0 ${W} ${H}`});
    const max = Math.max(1, ...agg.byHour);
    const yMax = Math.ceil(max / 4) * 4; //取整刻度
    // 网格 + y 刻度
    for (let g = 0; g <= 2; g += 1) {
        const val = Math.round(yMax * g / 2);
        const y = B - (B - T) * g / 2;
        svg.appendChild(svgEl("line", {
            x1: L, x2: R, y1: y, y2: y,
            stroke: "var(--color-border)", "stroke-width": 1,
        }));
        const t = svgEl("text", {x: L - 6, y: y + 4, "text-anchor": "end"});
        t.textContent = String(val);
        svg.appendChild(t);
    }
    const slot = (R - L) / 24;
    const bw = Math.min(24, slot - 2);
    const peak = agg.byHour.indexOf(Math.max(...agg.byHour));
    for (let h = 0; h < 24; h += 1) {
        const v = agg.byHour[h];
        const bh = Math.round((B - T) * v / yMax);
        const x = L + h * slot + (slot - bw) / 2;
        const y = B - bh;
        const r = Math.min(4, bh); //数据端圆角、基线直角
        const bar = svgEl("path", {
            d: `M${x},${B} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + bw - r},${y} Q${x + bw},${y} ${x + bw},${y + r} L${x + bw},${B} Z`,
            fill: "var(--color-primary)",
        });
        bar.addEventListener("mousemove", function (e) {
            Tooltip.show(`${h}:00 – ${visitsText(v)}`, e.clientX, e.clientY);
        });
        bar.addEventListener("mouseleave", Tooltip.hide);
        svg.appendChild(bar);
        if (h === peak && v > 0) {
            const t = svgEl("text", {x: x + bw / 2, y: y - 5, "text-anchor": "middle"});
            t.textContent = String(v);
            svg.appendChild(t);
        }
        if (h % 6 === 0 || h === 23) {
            const t = svgEl("text", {x: x + bw / 2, y: B + 16, "text-anchor": "middle"});
            t.textContent = String(h);
            svg.appendChild(t);
        }
    }
    body.appendChild(svg);
    fillTable(
        document.getElementById("chart_hour"),
        ["statsColHour", "statsColCount"],
        agg.byHour.map(function (v, h) { return [`${h}:00`, v]; })
    );
}
```

- [ ] **Step 4: 每日趋势 renderDay（SVG 折线+面积渍）**

规格：viewBox 720×220，2px 折线圆角、面积 fill 主色 opacity .1、末端点 r=4 + 2px 表面色描边；hover 竖线 + tooltip（就近点）；x 轴稀疏刻度（≈6 个，M/d 格式）。

```js
/**@type{(agg: ReturnType<typeof aggregate>) => undefined}*/
function renderDay(agg) {
    const body = document.querySelector("#chart_day .chart-body");
    body.replaceChildren();
    const W = 720, H = 220, L = 32, R = 712, T = 8, B = 184;
    const svg = svgEl("svg", {viewBox: `0 0 ${W} ${H}`});
    const days = agg.byDay;
    const max = Math.max(1, ...days.map(function (d) { return d.count; }));
    const yMax = Math.ceil(max / 4) * 4;
    for (let g = 0; g <= 2; g += 1) {
        const y = B - (B - T) * g / 2;
        svg.appendChild(svgEl("line", {
            x1: L, x2: R, y1: y, y2: y,
            stroke: "var(--color-border)", "stroke-width": 1,
        }));
        const t = svgEl("text", {x: L - 6, y: y + 4, "text-anchor": "end"});
        t.textContent = String(Math.round(yMax * g / 2));
        svg.appendChild(t);
    }
    const px = function (i) {
        return days.length === 1 ? (L + R) / 2 : L + (R - L) * i / (days.length - 1);
    };
    const py = function (v) { return B - (B - T) * v / yMax; };
    const fmtDate = new Intl.DateTimeFormat(undefined, {month: "numeric", day: "numeric"});
    let line = "";
    for (let i = 0; i < days.length; i += 1) {
        line += (i === 0 ? "M" : "L") + px(i) + "," + py(days[i].count);
    }
    svg.appendChild(svgEl("path", {
        d: line + `L${px(days.length - 1)},${B} L${px(0)},${B} Z`,
        fill: "var(--color-primary)", opacity: 0.1, stroke: "none",
    }));
    svg.appendChild(svgEl("path", {
        d: line, fill: "none", stroke: "var(--color-primary)",
        "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
    const last = days.length - 1;
    svg.appendChild(svgEl("circle", {
        cx: px(last), cy: py(days[last].count), r: 4,
        fill: "var(--color-primary)", stroke: "var(--color-bg)", "stroke-width": 2,
    }));
    const step = Math.max(1, Math.round(days.length / 6));
    for (let i = 0; i < days.length; i += step) {
        const t = svgEl("text", {x: px(i), y: B + 16, "text-anchor": "middle"});
        t.textContent = fmtDate.format(days[i].dayStart);
        svg.appendChild(t);
    }
    const cross = svgEl("line", {
        x1: 0, x2: 0, y1: T, y2: B,
        stroke: "var(--color-border)", "stroke-width": 1, visibility: "hidden",
    });
    svg.appendChild(cross);
    svg.addEventListener("mousemove", function (e) {
        const rect = svg.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * W / rect.width;
        const i = Math.max(0, Math.min(days.length - 1,
            Math.round((mx - L) / ((R - L) / Math.max(1, days.length - 1)))));
        cross.setAttribute("x1", px(i));
        cross.setAttribute("x2", px(i));
        cross.setAttribute("visibility", "visible");
        Tooltip.show(`${fmtDate.format(days[i].dayStart)} – ${visitsText(days[i].count)}`, e.clientX, e.clientY);
    });
    svg.addEventListener("mouseleave", function () {
        cross.setAttribute("visibility", "hidden");
        Tooltip.hide();
    });
    body.appendChild(svg);
    fillTable(
        document.getElementById("chart_day"),
        ["statsColDate", "statsColCount"],
        days.map(function (d) { return [fmtDate.format(d.dayStart), d.count]; })
    );
}
```

- [ ] **Step 5: CDP 手动验证**

stats 页：三图渲染（Top 行数>0、24 柱、折线路径存在）；hover 柱/折线出 tooltip；数据表展开有行；范围切换三图重绘。

- [ ] **Step 6: Commit**

```bash
cd D:/projects/history-quick-view
git add src/stats.js src/stats.css
git commit -m "feat: 三图SVG渲染（Top榜/24h柱状/每日趋势）+tooltip+数据表"
```

---

### Task 4: 调色校验 + e2e 增补 + 截图收口

**Files:**
- Modify: `tools/e2e.mjs`（追加 stats 断言块与截图）
- 产出: `docs/superpowers/plans/assets/phase3-stats-dark.png`、`phase3-stats-light.png`

**Interfaces:**
- Consumes: Task 1-3 全部成果

- [ ] **Step 1: 跑 dataviz 调色校验**

```powershell
node "C:/Users/kly38/AppData/Local/Temp/claude/bundled-skills/2.1.205/6387f49cc552945620930b307ebae3b0/dataviz/scripts/validate_palette.js" "#1a73e8" --mode light
node "C:/Users/kly38/AppData/Local/Temp/claude/bundled-skills/2.1.205/6387f49cc552945620930b307ebae3b0/dataviz/scripts/validate_palette.js" "#8ab4f8" --mode dark
```

（脚本参数以其 usage 输出为准；surface 分别对 `#ffffff` / `#202124`。）
Expected: 两主色 PASS；若 FAIL 换相邻 Google 蓝色阶重跑（浅色备选 `#1967d2`，深色备选 `#aecbfa`），并同步 style.css/stats.css 变量。

- [ ] **Step 2: e2e.mjs 追加 stats 断言块（快捷键区之后、收尾之前）**

```js
// ---------- 三期：统计页 ----------
check("统计按钮存在", await ev(`document.querySelector('button[name="stats"]') !== null`));
check("统计按钮 tooltip", (await ev(`document.querySelector('button[name="stats"]').title`)) === "统计");
await c.send("Page.navigate", { url: `chrome-extension://${EXT}/stats.html` });
await sleep(2500);
check("stats 标题中文", (await ev(`document.querySelector(".stats-header h1").textContent`)) === "浏览统计");
check("默认 30 天选中", await ev(`document.querySelector('.range button[data-range="30"]').hasAttribute("data-active")`));
check("汇总数字为正", await ev(`Number(document.getElementById("v_total").textContent.replace(/,/g, "")) > 0`));
check("Top 榜有行", (await ev(`document.querySelectorAll("#chart_top .toprow").length`)) >= 1);
check("24h 图 24 柱", (await ev(`document.querySelectorAll("#chart_hour svg path").length`)) === 24);
check("趋势图折线存在", (await ev(`document.querySelectorAll("#chart_day svg path").length`)) >= 2);
check("趋势图 30 天点数", await ev(`(function(){
    const rows = document.querySelectorAll("#chart_day .chart-table table tr");
    return rows.length === 31; //表头+30 天
})()`));
// 范围切换
await ev(`document.querySelector('.range button[data-range="7"]').click()`);
await sleep(400);
check("切 7 天选中态", await ev(`document.querySelector('.range button[data-range="7"]').hasAttribute("data-active")`));
check("切 7 天表格 8 行", (await ev(`document.querySelectorAll("#chart_day .chart-table table tr").length`)) === 8);
check("范围持久化", (await ev(`chrome.storage.local.get().then((s) => s.statsRange)`, true)) === 7);
// 数据表展开
await ev(`document.querySelector("#chart_top .chart-table").open = true`);
check("Top 数据表有行", (await ev(`document.querySelectorAll("#chart_top .chart-table table tr").length`)) >= 2);
// 深色截图（当前 theme=d）
await screenshot(ASSETS + "phase3-stats-dark.png");
// 浅色截图
await ev(`chrome.storage.local.get().then((s) => chrome.storage.local.set({...s, theme: "l"}))`, true);
await c.send("Page.reload");
await sleep(2500);
check("浅色主题生效", (await ev(`document.documentElement.className`)) === "l");
await screenshot(ASSETS + "phase3-stats-light.png");
await ev(`chrome.storage.local.get().then((s) => chrome.storage.local.set({...s, theme: "d"}))`, true);
```

注意：stats 断言块要放在**键盘快捷键断言之后**（那些断言依赖 popup 页面）；块开头仍在 popup 页，navigate 后不再回 popup。

- [ ] **Step 3: 全套验证**

```powershell
node D:/projects/history-quick-view/tools/test-fuzzy.mjs
node D:/projects/history-quick-view/tools/test-datecn.mjs
node D:/projects/history-quick-view/tools/test-stats.mjs
node D:/projects/history-quick-view/tools/check-i18n.mjs
node D:/projects/history-quick-view/tools/e2e.mjs
```

Expected: 全绿（e2e ≈ 57+17 项）。

- [ ] **Step 4: 目检截图**

Read 两张截图：三图布局、主色、深浅主题、中文文案；对照 dataviz anti-patterns（无双轴/无彩虹/文字不穿系列色/图例缺省正确）。

- [ ] **Step 5: Commit**

```bash
cd D:/projects/history-quick-view
git add tools/e2e.mjs docs/superpowers/plans/assets
git commit -m "test: e2e 增补统计页断言与双主题截图，调色对比度校验通过"
```

---

## 自查记录

- Spec 覆盖：数据层+单测（T1）、入口/i18n/主题/范围切换（T2）、三图/tooltip/数据表（T3）、调色校验/e2e/截图（T4）、错误处理（T2 错误条+T1 getVisits 容错+capped 提示）✓
- 无占位符：全部步骤含完整代码或精确命令 ✓
- 一致性：`aggregate` 返回结构 T1 定义、T2 S.rerender 与 T3 三渲染函数消费一致；容器 id（chart_top/hour/day、s_* 系列）T2 定义 T3/T4 引用一致；`statsRange` 独立 key 贯穿 T2/T4 ✓
- 风险注记：T2 的 S.rerender 以 `typeof renderTop === "function"` 兼容 T3 未落地的中间态；validate_palette.js 参数形式以脚本实际 usage 为准，plan 中命令仅为基准形态
