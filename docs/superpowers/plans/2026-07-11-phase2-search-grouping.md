# 二期实施计划：搜索/分组增强

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 模糊搜索（子序列+错字容忍）、`site:` 语法与「按网站」分组视图、中文日期关键字、修历史少时重复渲染。

**Architecture:** 双管线——默认时间浏览保持原架构只加去重护栏；搜索态与网站视图走新客户端管线（一次拉取最近 2 万条缓存，本地打分/过滤/分组），渲染进独立容器 `#g_container`，与原 `#m_container` 互斥显示，互不干扰。

**Tech Stack:** 原生 JS 零构建（新文件用 `module.exports` 兜底导出以便 Node 单测）、chrome.history/chrome.storage、CDP 端到端验证。

## Global Constraints

- 仓库 `D:\projects\history-quick-view`，分支 `feature/phase2-search-grouping`（切自一期分支）
- 原时间浏览管线（searchToDOM/TimeRange/分页）除 Task 1 护栏外不动
- 模糊搜索纯 JS 无依赖、不做拼音；缓存上限 `maxResults: 20000`
- 错字容忍仅 query 长度 ≥4 启用；中文按字符匹配
- 英文日期关键字零影响；中文翻译不命中原样返回
- 新增界面文案一律走一期 i18n 机制（`_locales` 双语 + `data-i18n*`/`getMessage`），提交前必过 `node tools/check-i18n.mjs`
- 脚本加载顺序（index.html `<head>`，全部 defer）：`i18n.js` → `fuzzy.js` → `datecn.js` → `main.js` → `groupview.js`
- 提交信息中文，结尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: 修历史少时重复渲染（去重护栏）

**Files:**
- Modify: `src/main.js:70` 附近（全局变量区）、`src/main.js:876-884`（ontimeout 重置块）、`src/main.js:915-923`（ondatetimeout 重置块）、`src/main.js:1373-1426`（searchToDOM while 循环）

**Interfaces:**
- Produces: 全局 `const seenItemIds = new Set()`（Task 4 的 updateResultsView 回到浏览态时依赖 ontimeout 现有重置块清空它，无新接口）

- [ ] **Step 1: 加全局 Set**

`src/main.js` 全局变量区（`let itemsFromSearch = 0;` 之后）加：

```js
const seenItemIds = new Set();
```

- [ ] **Step 2: 两个重置块清空**

`ontimeout` 与 `ondatetimeout` 中各有一段重置（`TimeRange.reset(); visited.length = 0; ...`），在两处 `TimeRange.reset();` 之后各加一行：

```js
            seenItemIds.clear();
```

- [ ] **Step 3: while 循环里跳过已见 id**

`searchToDOM` 中 `Fragment.appendChild(HItem.create(...))` 之前（`} else { lastVisitTime = item.lastVisitTime; }` 闭合之后）加：

```js
        if (seenItemIds.has(item.id)) {
            i += 1;
            continue;
        }
        seenItemIds.add(item.id);
```

- [ ] **Step 4: 整批无新条目则终止拉取**

while 循环结束后、`if (TimeRange.length == 0) {`（创建 DOMRange 的分支）之前加：

```js
    if (itemsCreated === 0 && i >= historyItems.length) {
        noMoreContent = true;
        SearchQuery.maxResults = MAX_SEARCH_RESULTS;
        itemsFromSearch = 0;
        if (totalItems === 0) {
            HSearchCointainer.EMPTY.removeAttribute("data-css-hidden");
        }
        HHeader.LOADING.setAttribute("data-css-hidden", "");
        return;
    }
```

- [ ] **Step 5: 手动验证（临时 CDP，正式 e2e 在 Task 6）**

用一期的验收方法：临时 profile 启 Chrome（`--remote-debugging-port=9223 --enable-unsafe-extension-debugging --user-data-dir=<scratchpad>\p2-profile`），CDP `Extensions.loadUnpacked` 加载 `D:/projects/history-quick-view/src`，popup 页种 3 条历史后 reload，断言 `[...document.querySelectorAll('[data-type="item"]')].map(a=>a.href)` 无重复。
Expected: 每个 URL 恰好出现 1 次（改前会重复 4+ 次）。

- [ ] **Step 6: Commit**

```bash
cd D:/projects/history-quick-view
git add src/main.js
git commit -m "fix: 历史条目全局去重+整批无新条目即终止，修历史少时循环重复渲染"
```

---

### Task 2: fuzzy.js 模糊匹配（TDD）

**Files:**
- Create: `src/fuzzy.js`
- Test: `tools/test-fuzzy.mjs`

**Interfaces:**
- Produces（全局函数，供 main.js/groupview.js 调用；Node 侧经 module.exports）:
  - `fuzzyScore(query: string, text: string) → number`（0~1，不命中 -1）
  - `fuzzyMatch(query: string, item: {title: string, url: string}) → number`（title/url 取高者，url 打 9 折）
  - `parseQuery(raw: string) → {site: string|null, terms: string}`

- [ ] **Step 1: 写失败的单测 `tools/test-fuzzy.mjs`**

```js
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { fuzzyScore, fuzzyMatch, parseQuery } = require("../src/fuzzy.js");

let pass = 0, fail = 0;
function eq(name, got, want) {
    if (Object.is(got, want)) { pass++; }
    else { fail++; console.error(`FAIL ${name}: got ${got}, want ${want}`); }
}
function ok(name, cond, extra = "") {
    if (cond) { pass++; }
    else { fail++; console.error(`FAIL ${name} ${extra}`); }
}

// 子序列命中
ok("gh→github", fuzzyScore("gh", "github") > 0);
ok("hqv→history quick view", fuzzyScore("hqv", "history quick view") > 0);
// 完整匹配分高于稀疏子序列
ok("完整>子序列", fuzzyScore("github", "github") > fuzzyScore("gh", "github"));
// 错字容忍（≥4 字启用）
ok("gogle→google", fuzzyScore("gogle", "google") > 0);
ok("gxthub→github(替换1字)", fuzzyScore("gxthub", "github") > 0);
eq("gxxhub→github(错2字)", fuzzyScore("gxxhub", "github"), -1);
// 短 query 不容错
eq("gx→github 不命中", fuzzyScore("gx", "github"), -1);
// 不命中
eq("zzz→github", fuzzyScore("zzz", "github"), -1);
eq("空query", fuzzyScore("", "github"), -1);
eq("空text", fuzzyScore("gh", ""), -1);
// 大小写不敏感
ok("GH→github", fuzzyScore("GH", "github") > 0);
// 中文按字符
ok("知乎→知乎-发现", fuzzyScore("知乎", "知乎 - 发现") > 0);
ok("知发→知乎-发现(子序列)", fuzzyScore("知发", "知乎 - 发现") > 0);
// 词首加权：跨度短且词首命中的分更高
ok("词首命中更高", fuzzyScore("qv", "quick view") > fuzzyScore("qv", "xq xxxxv"));
// fuzzyMatch: title 与 url 取高者
ok("match命中url", fuzzyMatch("gh", {title: "首页", url: "https://github.com"}) > 0);
ok("match都不中=-1", fuzzyMatch("zzz", {title: "首页", url: "https://a.com"}) === -1);
ok("title优先于url(同文本url打折)",
    fuzzyMatch("abc", {title: "abc", url: "x://x"}) > fuzzyMatch("abc", {title: "x", url: "abc"}));
// parseQuery
eq("无site", JSON.stringify(parseQuery("hello")), JSON.stringify({site: null, terms: "hello"}));
eq("纯site", JSON.stringify(parseQuery("site:github.com")), JSON.stringify({site: "github.com", terms: ""}));
eq("site+词", JSON.stringify(parseQuery("site:github.com claude")), JSON.stringify({site: "github.com", terms: "claude"}));
eq("词+site", JSON.stringify(parseQuery("claude site:github.com")), JSON.stringify({site: "github.com", terms: "claude"}));
eq("空site值", JSON.stringify(parseQuery("site: hello")), JSON.stringify({site: null, terms: "hello"}));

console.log(`fuzzy: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: 跑单测确认失败**

Run: `node D:/projects/history-quick-view/tools/test-fuzzy.mjs`
Expected: FAIL（Cannot find module '../src/fuzzy.js'）

- [ ] **Step 3: 实现 `src/fuzzy.js`**

```js
"use strict";
/*
 * 模糊匹配纯函数模块（无依赖，浏览器全局 + Node module.exports 双出口）。
 * 规则：贪心子序列匹配；query ≥4 字时容忍 1 个错字（逐位剔除重试）；
 * 连续命中/词首命中加权，匹配跨度越短分越高。
 */

/**
 * 严格子序列贪心打分。
 * @type {(q: string, t: string) => {ok: boolean, score: number, span: number}}
 */
function subseqScore(q, t) {
    let qi = 0;
    let ti = 0;
    let score = 0;
    let first = -1;
    let last = -1;
    let prevMatched = false;
    while (qi < q.length && ti < t.length) {
        if (q[qi] === t[ti]) {
            if (first < 0) {
                first = ti;
            }
            last = ti;
            score += 1;
            if (prevMatched) {
                score += 1;
            }
            if (ti === 0 || " -_./".indexOf(t[ti - 1]) !== -1) {
                score += 2;
            }
            prevMatched = true;
            qi += 1;
            ti += 1;
        } else {
            prevMatched = false;
            ti += 1;
        }
    }
    if (qi < q.length) {
        return {ok: false, score: 0, span: 0};
    }
    return {ok: true, score, span: last - first + 1};
}

/**@type {(query: string, text: string) => number}*/
function fuzzyScore(query, text) {
    if (query.length === 0 || text.length === 0) {
        return -1;
    }
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    let r = subseqScore(q, t);
    let qlen = q.length;
    if (!r.ok && q.length >= 4) {
        for (let i = 0; i < q.length; i += 1) {
            const r2 = subseqScore(q.slice(0, i) + q.slice(i + 1), t);
            if (r2.ok) {
                r2.score -= 2; //错字罚分
                r = r2;
                qlen = q.length - 1;
                break;
            }
        }
    }
    if (!r.ok) {
        return -1;
    }
    //归一：每字符最高 4 分（1 基础+1 连续+2 词首）；跨度密度做乘子
    const density = qlen / r.span;
    const norm = (r.score / (qlen * 4)) * (0.5 + 0.5 * density);
    return Math.max(0.01, Math.min(1, norm));
}

/**@type {(query: string, item: {title: string, url: string}) => number}*/
function fuzzyMatch(query, item) {
    const st = fuzzyScore(query, item.title ?? "");
    const su = fuzzyScore(query, item.url ?? "");
    return Math.max(st, su < 0 ? -1 : su * 0.9);
}

/**@type {(raw: string) => {site: string|null, terms: string}}*/
function parseQuery(raw) {
    let site = null;
    const terms = raw.replace(/(?:^|\s)site:(\S*)/i, function (_, v) {
        if (v.length > 0) {
            site = v.toLowerCase();
        }
        return " ";
    }).trim();
    return {site, terms};
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {fuzzyScore, fuzzyMatch, parseQuery};
}
```

- [ ] **Step 4: 跑单测确认通过**

Run: `node D:/projects/history-quick-view/tools/test-fuzzy.mjs`
Expected: `fuzzy: 23 PASS / 0 FAIL`。有 FAIL 就修实现（别改测试的语义）。

- [ ] **Step 5: index.html 挂载脚本**

`<script src="/i18n.js" defer></script>` 之后加：

```html
        <script src="/fuzzy.js" defer></script>
```

- [ ] **Step 6: Commit**

```bash
cd D:/projects/history-quick-view
git add src/fuzzy.js tools/test-fuzzy.mjs src/index.html
git commit -m "feat: 模糊匹配纯函数模块（子序列+错字容忍+site:解析）与单测"
```

---

### Task 3: 中文日期关键字（TDD）

**Files:**
- Create: `src/datecn.js`
- Test: `tools/test-datecn.mjs`
- Modify: `src/main.js:894-908`（ondatetimeout）、`src/index.html` 日期输入框、`src/_locales/*/messages.json`

**Interfaces:**
- Consumes: 无
- Produces: 全局 `translateChineseDateExpr(expr: string) → string`（中文译成 DateParser 现有英文语法；`今天`→`""`；不命中原样返回）；i18n key `datePlaceholder`

- [ ] **Step 1: 写失败的单测 `tools/test-datecn.mjs`**

```js
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { translateChineseDateExpr } = require("../src/datecn.js");

let pass = 0, fail = 0;
function eq(input, want) {
    const got = translateChineseDateExpr(input);
    if (got === want) { pass++; }
    else { fail++; console.error(`FAIL "${input}": got "${got}", want "${want}"`); }
}

eq("今天", ""); eq("今日", "");
eq("昨天", "yesterday"); eq("昨日", "yesterday");
eq("前天", "-2 d");
eq("3天前", "-3 d"); eq("3 天前", "-3 d"); eq("三天前", "-3 d"); eq("十天前", "-10 d");
eq("二十五天前", "-25 d"); eq("两天前", "-2 d");
eq("2周前", "-2 w"); eq("两周前", "-2 w"); eq("3星期前", "-3 w"); eq("3个星期前", "-3 w");
eq("2个月前", "-2 m"); eq("2月前", "-2 m"); eq("两个月前", "-2 m");
eq("周一", "mo"); eq("周日", "su"); eq("周天", "su");
eq("星期三", "we"); eq("礼拜五", "fr");
eq("7月5日", "jul 5"); eq("7月5号", "jul 5"); eq("12月31日", "dec 31");
eq("七月五日", "jul 5");
eq("10月", "oct"); eq("十月", "oct"); eq("十二月", "dec");
// 不命中原样返回
eq("明天", "明天");
eq("yesterday", "yesterday");
eq("-3 d", "-3 d");
eq("oct 5", "oct 5");
eq("", "");
eq("13月", "13月");   // 非法月份不翻
eq("0天前", "0天前"); // 0 不翻

console.log(`datecn: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
```

- [ ] **Step 2: 跑单测确认失败**

Run: `node D:/projects/history-quick-view/tools/test-datecn.mjs`
Expected: FAIL（Cannot find module '../src/datecn.js'）

- [ ] **Step 3: 实现 `src/datecn.js`**

```js
"use strict";
/*
 * 中文日期表达式 → DateParser 现有英文语法 的翻译层。
 * 不含中文字符或规则不命中时原样返回，保证英文关键字零影响。
 * "今天" 翻译为 ""（调用方按空串走"今天"语义）。
 */

const CN_MONTH_SHORT = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
];
const CN_WDAY_SHORT = {
    "一": "mo", "二": "tu", "三": "we", "四": "th",
    "五": "fr", "六": "sa", "日": "su", "天": "su",
};
const CN_DIGIT = {
    "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
};

/**
 * "3"/"三"/"十"/"二十五"/"三十一" → 数字，解析失败返回 -1
 * @type {(s: string) => number}
 */
function cnNumToInt(s) {
    if (/^[0-9]+$/.test(s)) {
        return parseInt(s, 10);
    }
    const m = /^([一二两三四五六七八九])?(十)?([一二三四五六七八九])?$/.exec(s);
    if (m === null || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) {
        return -1;
    }
    if (m[2] === undefined) {
        //个位数
        if (m[1] === undefined || m[3] !== undefined) {
            return -1;
        }
        return CN_DIGIT[m[1]];
    }
    return (m[1] !== undefined ? CN_DIGIT[m[1]] : 1) * 10
        + (m[3] !== undefined ? CN_DIGIT[m[3]] : 0);
}

const NUM = "([0-9]+|[一二两三四五六七八九十]+)";

/**@type {(expr: string) => string}*/
function translateChineseDateExpr(expr) {
    const s = expr.trim();
    if (!/[一-鿿]/.test(s)) {
        return expr;
    }
    if (s === "今天" || s === "今日") {
        return "";
    }
    if (s === "昨天" || s === "昨日") {
        return "yesterday";
    }
    if (s === "前天") {
        return "-2 d";
    }
    let m = new RegExp("^" + NUM + "\\s*天前$").exec(s);
    if (m !== null) {
        const n = cnNumToInt(m[1]);
        return n > 0 ? "-" + n + " d" : expr;
    }
    m = new RegExp("^" + NUM + "\\s*(?:个)?(?:周|星期)前$").exec(s);
    if (m !== null) {
        const n = cnNumToInt(m[1]);
        return n > 0 ? "-" + n + " w" : expr;
    }
    m = new RegExp("^" + NUM + "\\s*(?:个)?月前$").exec(s);
    if (m !== null) {
        const n = cnNumToInt(m[1]);
        return n > 0 ? "-" + n + " m" : expr;
    }
    m = /^(?:周|星期|礼拜)([一二三四五六日天])$/.exec(s);
    if (m !== null) {
        return CN_WDAY_SHORT[m[1]];
    }
    m = new RegExp("^" + NUM + "月" + NUM + "[日号]$").exec(s);
    if (m !== null) {
        const mo = cnNumToInt(m[1]);
        const day = cnNumToInt(m[2]);
        if (1 <= mo && mo <= 12 && 1 <= day && day <= 31) {
            return CN_MONTH_SHORT[mo - 1] + " " + day;
        }
        return expr;
    }
    m = new RegExp("^" + NUM + "月$").exec(s);
    if (m !== null) {
        const mo = cnNumToInt(m[1]);
        if (1 <= mo && mo <= 12) {
            return CN_MONTH_SHORT[mo - 1];
        }
        return expr;
    }
    return expr;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {translateChineseDateExpr};
}
```

- [ ] **Step 4: 跑单测确认通过**

Run: `node D:/projects/history-quick-view/tools/test-datecn.mjs`
Expected: `datecn: 32 PASS / 0 FAIL`

- [ ] **Step 5: main.js 挂接（唯一 parse 调用点在 ondatetimeout）**

先 `grep -n "DateParser.parse" src/main.js` 确认只有一处调用（约 902 行）。把 `ondatetimeout` 中：

```js
        const target = HSearchForm.FORM["date"]
        let endtime = 0;
        if (target.value.length === 0) {
            endtime = TimeRange.createStart(Date.now()) + DAY;
        } else {
            endtime = DateParser.parse(target.value);
```

改为：

```js
        const target = HSearchForm.FORM["date"]
        let endtime = 0;
        const dateExpr = translateChineseDateExpr(target.value);
        if (dateExpr.length === 0) {
            endtime = TimeRange.createStart(Date.now()) + DAY;
        } else {
            endtime = DateParser.parse(dateExpr);
```

（原 `target.value.length === 0` 分支被 `dateExpr.length === 0` 覆盖：空输入翻译后仍是空串；「今天」翻译成空串走同一分支，语义正确。）

- [ ] **Step 6: 脚本挂载 + placeholder 放开**

index.html：`fuzzy.js` 之后加 `<script src="/datecn.js" defer></script>`；
日期输入框加 `data-i18n-placeholder="datePlaceholder"`；
`_locales/zh_CN/messages.json` 加 `"datePlaceholder": { "message": "今天" }`，
`_locales/en/messages.json` 加 `"datePlaceholder": { "message": "today" }`。

Run: `node D:/projects/history-quick-view/tools/check-i18n.mjs`
Expected: `i18n OK`

- [ ] **Step 7: Commit**

```bash
cd D:/projects/history-quick-view
git add src/datecn.js tools/test-datecn.mjs src/main.js src/index.html src/_locales
git commit -m "feat: 日期框支持中文关键字（今天/昨天/N天前/周X/X月X日等），英文关键字共存"
```

---

### Task 4: 客户端缓存 + 模糊搜索视图挂接

**Files:**
- Create: `src/groupview.js`（本任务先落 HistoryCache + 平铺搜索结果渲染 + 事件委托；Task 5 再加分组渲染）
- Modify: `src/index.html`（`#g_container` 容器 + 脚本挂载）、`src/main.js:868-893`（ontimeout）、`src/main.js` HSearchForm.clear、`src/_locales/*/messages.json`、`src/style.css`（追加块）

**Interfaces:**
- Consumes: `fuzzyMatch`/`parseQuery`（Task 2）、main.js 既有全局 `HItem`、`TabsProperties`、`storage`、`getFavicon`、`HHeader`、`DAY`
- Produces:
  - 全局 `HGroupView.render(rawQuery: string) → undefined`（按当前视图态渲染进 #g_container）
  - `HGroupView.CONTAINER: HTMLElement`
  - `HistoryCache.invalidate() → undefined`
  - main.js 新函数 `updateResultsView() → undefined`（新旧管线切换的唯一入口；Task 5 视图切换按钮复用）
  - i18n keys：`searchResults`（占位 $COUNT$）、`errFetchAll`
  - 视图判定：本任务里 `updateResultsView` 仅按「搜索词是否非空」分流；Task 5 加入 `storage.view` 条件

- [ ] **Step 1: index.html 加容器与脚本**

`<div id="m_container" class="container"></div>` 之后加：

```html
                    <div id="g_container" class="container" data-css-hidden></div>
```

`<script src="/main.js" defer></script>` 之后加：

```html
        <script src="/groupview.js" defer></script>
```

- [ ] **Step 2: i18n keys**

`_locales/zh_CN/messages.json` 加：

```json
    "searchResults": {
        "message": "搜索结果（$COUNT$ 条）",
        "placeholders": { "count": { "content": "$1" } }
    },
    "errFetchAll": { "message": "读取历史记录失败" },
```

`_locales/en/messages.json` 加：

```json
    "searchResults": {
        "message": "Search results ($COUNT$)",
        "placeholders": { "count": { "content": "$1" } }
    },
    "errFetchAll": { "message": "Failed to load history" },
```

- [ ] **Step 3: 实现 `src/groupview.js`（本任务版本）**

```js
"use strict";
/*
 * 新管线：客户端缓存 + 模糊搜索平铺视图（Task 5 补分组视图）。
 * 渲染进 #g_container，与原 #m_container 互斥显示（切换逻辑在 main.js updateResultsView）。
 */

const HistoryCache = {
    /**@type{Array<chrome.history.HistoryItem>|null}*/
    items: null,
    /**@type{Promise<Array<chrome.history.HistoryItem>>|null}*/
    loading: null,
    MAX: 20000,
    getAll() {
        if (HistoryCache.items !== null) {
            return Promise.resolve(HistoryCache.items);
        }
        if (HistoryCache.loading === null) {
            HistoryCache.loading = chrome.history.search({
                text: "",
                startTime: 0,
                endTime: Date.now() + DAY,
                maxResults: HistoryCache.MAX,
            }).then(function (items) {
                HistoryCache.items = items;
                HistoryCache.loading = null;
                return items;
            });
        }
        return HistoryCache.loading;
    },
    invalidate() {
        HistoryCache.items = null;
    },
};

const HGroupView = {
    CONTAINER: (function () {
        const el = document.getElementById("g_container");
        if (el === null) {
            throw Error("ERROR: #g_container does not exist");
        }
        return el;
    }()),
    MAX_RESULTS: 500,
    renderSeq: 0,
    /**
     * hostname 后缀匹配 site 过滤值
     * @type{(url: string, site: string) => boolean}*/
    matchSite(url, site) {
        let host = "";
        try {
            host = new URL(url).hostname.toLowerCase();
        } catch {
            return false;
        }
        return host === site || host.endsWith("." + site);
    },
    /**@type{(rawQuery: string) => undefined}*/
    render(rawQuery) {
        const seq = HGroupView.renderSeq += 1;
        const q = parseQuery(rawQuery);
        HHeader.LOADING.removeAttribute("data-css-hidden");
        HistoryCache.getAll().then(function (items) {
            if (seq !== HGroupView.renderSeq) {
                return; //已被更新的渲染取代
            }
            let filtered = items;
            if (q.site !== null) {
                filtered = filtered.filter(function (it) {
                    return HGroupView.matchSite(it.url, q.site);
                });
            }
            HGroupView.renderFlat(filtered, q.terms);
            HHeader.LOADING.setAttribute("data-css-hidden", "");
        }).catch(function (e) {
            console.error(e);
            HError.set(chrome.i18n.getMessage("errFetchAll"));
        });
    },
    /**@type{(items: Array<chrome.history.HistoryItem>, terms: string) => undefined}*/
    renderFlat(items, terms) {
        let results;
        if (terms.length === 0) {
            results = items.slice(0, HGroupView.MAX_RESULTS);
        } else {
            results = [];
            for (const it of items) {
                const s = fuzzyMatch(terms, it);
                if (s >= 0) {
                    results.push({it, s});
                }
            }
            results.sort(function (a, b) {
                return b.s - a.s || b.it.lastVisitTime - a.it.lastVisitTime;
            });
            results = results.slice(0, HGroupView.MAX_RESULTS).map(function (r) {
                return r.it;
            });
        }
        const frag = document.createDocumentFragment();
        const head = HRange.TEMPLATE_SEARCH.cloneNode(true);
        head.querySelector(".title").insertAdjacentText(
            "beforeend",
            chrome.i18n.getMessage("searchResults", [String(results.length)])
        );
        frag.appendChild(head);
        const section = frag.firstElementChild;
        for (const it of results) {
            section.appendChild(
                HItem.create(it.url, it.title, it.id, it.lastVisitTime)
            );
        }
        HGroupView.CONTAINER.replaceChildren(frag);
    },
    /**@type{(e: MouseEvent) => undefined}*/
    onclick(e) {
        const target = e.target;
        const type = target.getAttribute("data-type");
        if (type === "remove") {
            e.preventDefault();
            const DOMItem = target.parentElement;
            const url = DOMItem.getAttribute("href");
            try {
                chrome.history.deleteUrl({url}, undefined);
            } catch (err) {
                console.error(err.message);
            }
            HistoryCache.invalidate();
            DOMItem.remove();
        } else if (type === "item") {
            if (!e.shiftKey) {
                e.preventDefault();
                TabsProperties.url = target.href;
                HItem.open(TabsProperties, storage.open, e.ctrlKey);
            }
        }
    },
    /**@type{(e: KeyboardEvent) => undefined}*/
    onkeyup(e) {
        if (e.code === KEYBOARD_CODE_REMOVE) {
            const target = e.target;
            if (target.getAttribute("data-type") === "item") {
                const next = target.nextElementSibling ?? target.previousElementSibling;
                const url = target.getAttribute("href");
                try {
                    chrome.history.deleteUrl({url}, undefined);
                } catch (err) {
                    console.error(err.message);
                }
                HistoryCache.invalidate();
                target.remove();
                next?.focus?.();
            }
        }
    },
};

HGroupView.CONTAINER.addEventListener("click", HGroupView.onclick, false);
HGroupView.CONTAINER.addEventListener("keyup", HGroupView.onkeyup, false);
```

- [ ] **Step 4: main.js 挂接 updateResultsView**

在 `searchAgain()` 定义之后加：

```js
/**
 * 新旧管线切换唯一入口：搜索词非空走 HGroupView 新管线，
 * 否则回到原时间浏览管线（由调用方 ontimeout 的既有重置逻辑重拉）。
 * @type{() => boolean} 返回 true 表示本次由新管线接管 */
function updateResultsView() {
    const text = HSearchForm.FORM["text"].value;
    if (text.length !== 0) {
        HSearchCointainer.CONTAINER.setAttribute("data-css-hidden", "");
        HSearchCointainer.CONTAINER.onscroll = null;
        HGroupView.CONTAINER.removeAttribute("data-css-hidden");
        HGroupView.render(text);
        return true;
    }
    HGroupView.CONTAINER.setAttribute("data-css-hidden", "");
    HSearchCointainer.CONTAINER.removeAttribute("data-css-hidden");
    return false;
}
```

`HSearchForm.ontimeout` 改为在开头分流（替换 `const text = ...` 到 `if (InitSearchQuery.text !== text) {` 之间）：

```js
    ontimeout() {
        searchTimeout = undefined;
        const text = HSearchForm.FORM["text"].value;
        if (updateResultsView()) {
            InitSearchQuery.text = text;
            return;
        }
        if (InitSearchQuery.text !== text) {
```

（`updateResultsView` 返回 false 时容器已换回 #m_container；`InitSearchQuery.text` 在新管线接管时被置为当前词，用户清空搜索后 `"" !== 上次词` 恒成立，原有重置+重拉逻辑照常触发。）

注意：`HError.set` 会卸载搜索表单监听器，`HGroupView.render` 的 catch 引用 `HError`——main.js 先于 groupview.js 加载，运行时可用。

- [ ] **Step 5: style.css 追加（文件末尾）**

```css
/*PHASE2: 新管线容器*/
#g_container .date .title {
    color: var(--color-secondary);
    font-weight: 500;
}
```

- [ ] **Step 6: 校验 + CDP 手动验证**

`node tools/check-i18n.mjs` → `i18n OK`。
CDP 验证：popup 种历史后输入 `gh`，断言 `#g_container` 可见且含 github 条目、`#m_container` 隐藏；清空搜索词后反转；`site:github.com` 只剩 github 条目。删除一条后再搜，条目不再出现（缓存已失效重拉）。

- [ ] **Step 7: Commit**

```bash
cd D:/projects/history-quick-view
git add src/groupview.js src/index.html src/main.js src/_locales src/style.css
git commit -m "feat: 客户端历史缓存+模糊搜索管线（site:过滤/打分排序/独立容器与删除逻辑）"
```

---

### Task 5: 「按网站」视图 + 切换按钮

**Files:**
- Modify: `src/groupview.js`（加分组渲染）、`src/index.html`（切换按钮 + template_group）、`src/main.js`（storage.view + 校验 + 按钮事件）、`src/_locales/*/messages.json`、`src/style.css`

**Interfaces:**
- Consumes: Task 4 的 `HGroupView`/`HistoryCache`/`updateResultsView`
- Produces: `storage.view: "t"|"s"`（常量 `VIEW_TIME="t"` `VIEW_SITE="s"`）；`HGroupView.render(rawQuery, view)` 第二参数（`"s"` 分组、否则平铺）；i18n keys `viewByTime`/`viewBySite`/`otherSites`

- [ ] **Step 1: storage 加 view 字段**

main.js 常量区（`STORAGE_THEME_AUTO` 之后）：

```js
const VIEW_TIME = "t";
const VIEW_SITE = "s";
```

`storage` 对象加 `view: VIEW_TIME,`。
`initStorage`（`showSearch` 校验块之后、`if (set)` 之前）加：

```js
    if (items.view === VIEW_TIME || items.view === VIEW_SITE) {
        storage.view = items.view;
    } else {
        set = true;
    }
```

- [ ] **Step 2: index.html 切换按钮 + 组模板**

搜索表单里 date 容器之后（`</div>` `</form>` 之间）加：

```html
                    <button
                        name="viewtoggle"
                        type="button"
                        class="shell"
                        title=""
                    >
                        <svg
                            class="icon icon-clock"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v6l4 2"/>
                        </svg>
                        <svg
                            class="icon icon-globe"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
                            <path d="M2 12h20"/>
                        </svg>
                    </button>
```

`</head>` 前（template_item 之后）加：

```html
        <template id="template_group">
            <details class="group">
                <summary class="group-head">
                    <img class="favicon" name="img" src="" alt="" width="16" height="16">
                    <p class="gtitle" name="gtitle"></p>
                    <p class="gcount" name="gcount"></p>
                </summary>
                <div class="group-items" name="items"></div>
            </details>
        </template>
```

- [ ] **Step 3: i18n keys**

zh_CN：`"viewByTime": { "message": "按时间浏览" }`、`"viewBySite": { "message": "按网站浏览" }`、`"otherSites": { "message": "其他" }`
en：`"viewByTime": { "message": "By time" }`、`"viewBySite": { "message": "By site" }`、`"otherSites": { "message": "Other" }`

- [ ] **Step 4: groupview.js 加分组渲染**

`HGroupView` 增加成员（`renderFlat` 之后）：

```js
    GROUP_TEMPLATE: (function () {
        const template = document.getElementById("template_group");
        if (template === null) {
            throw Error("ERROR: #template_group does not exist");
        }
        return template.content;
    }()),
    /**@type{(items: Array<chrome.history.HistoryItem>, terms: string) => undefined}*/
    renderGroups(items, terms) {
        let pool = items;
        if (terms.length !== 0) {
            pool = items.filter(function (it) {
                return fuzzyMatch(terms, it) >= 0;
            });
        }
        /**@type{Map<string, Array<chrome.history.HistoryItem>>}*/
        const groups = new Map();
        for (const it of pool) {
            let host;
            try {
                host = new URL(it.url).hostname.toLowerCase();
            } catch {
                host = "";
            }
            if (host === "") {
                host = chrome.i18n.getMessage("otherSites");
            }
            const arr = groups.get(host);
            if (arr === undefined) {
                groups.set(host, [it]);
            } else {
                arr.push(it);
            }
        }
        const sorted = [...groups.entries()].sort(function (a, b) {
            return b[1][0].lastVisitTime - a[1][0].lastVisitTime;
        });
        const frag = document.createDocumentFragment();
        for (const [host, arr] of sorted) {
            const g = HGroupView.GROUP_TEMPLATE.cloneNode(true);
            const details = g.firstElementChild;
            details.querySelector('[name="img"]').setAttribute("src", getFavicon(arr[0].url));
            details.querySelector('[name="gtitle"]').insertAdjacentText("beforeend", host);
            details.querySelector('[name="gcount"]').insertAdjacentText("beforeend", String(arr.length));
            //懒渲染：展开时才填条目
            details.addEventListener("toggle", function () {
                if (details.open && details.filled !== true) {
                    details.filled = true;
                    const itemsDiv = details.querySelector('[name="items"]');
                    for (const it of arr) {
                        itemsDiv.appendChild(
                            HItem.create(it.url, it.title, it.id, it.lastVisitTime)
                        );
                    }
                }
            }, {once: false});
            frag.appendChild(g);
        }
        HGroupView.CONTAINER.replaceChildren(frag);
    },
```

`render(rawQuery)` 签名改为 `render(rawQuery, view)`，`renderFlat` 调用处改为：

```js
            if (view === VIEW_SITE) {
                HGroupView.renderGroups(filtered, q.terms);
            } else {
                HGroupView.renderFlat(filtered, q.terms);
            }
```

- [ ] **Step 5: main.js 接通视图态**

`updateResultsView` 改为：

```js
function updateResultsView() {
    const text = HSearchForm.FORM["text"].value;
    HMain.MAIN.setAttribute("data-view", storage.view);
    const toggleBtn = HSearchForm.FORM["viewtoggle"];
    toggleBtn.setAttribute("title", chrome.i18n.getMessage(
        storage.view === VIEW_SITE ? "viewByTime" : "viewBySite"
    ));
    if (storage.view === VIEW_SITE || text.length !== 0) {
        HSearchCointainer.CONTAINER.setAttribute("data-css-hidden", "");
        HSearchCointainer.CONTAINER.onscroll = null;
        HGroupView.CONTAINER.removeAttribute("data-css-hidden");
        HGroupView.render(text, storage.view);
        return true;
    }
    HGroupView.CONTAINER.setAttribute("data-css-hidden", "");
    HSearchCointainer.CONTAINER.removeAttribute("data-css-hidden");
    return false;
}
```

切换按钮处理（`HSearchForm` 加成员，与 clear 同级）：

```js
    onviewtoggle() {
        storage.view = (storage.view === VIEW_SITE) ? VIEW_TIME : VIEW_SITE;
        chrome.storage.local.set(storage, undefined);
        if (!updateResultsView()) {
            //回到时间浏览：走既有重置逻辑强制重拉
            InitSearchQuery.text = "\uFFFF";
            HSearchForm.ontimeout();
        }
    },
```

事件绑定：找到 main.js 底部绑定区（`HSearchForm.FORM["clear-text"].addEventListener("click", ...)` 附近），同一处加：

```js
        HSearchForm.FORM["viewtoggle"].addEventListener(
            "click",
            HSearchForm.onviewtoggle,
            false
        );
```

启动初始化：`HSectionMore.init(storage)` 调用之后（chrome.storage.local.get 回调里）加一行 `updateResultsView();`（视图态为 s 时启动即进分组视图；为 t 时是空操作恒 false，原启动流程照旧）。

- [ ] **Step 6: style.css 追加**

```css
/*PHASE2: 视图切换与分组*/
main[data-view="t"] .icon-clock {
    display: none;
}
main[data-view="s"] .icon-globe {
    display: none;
}
main[data-view="s"] form[name="search"] .container.date {
    display: none;
}
main[data-view="s"] form[name="search"] .container.text {
    width: 100%;
}

.group {
    border-radius: var(--border-radius);
}
.group summary {
    display: flex;
    align-items: center;
    gap: 8px;
    height: var(--item-height);
    padding: var(--padding);
    cursor: pointer;
    border-radius: var(--border-radius);
    list-style: none;
}
.group summary::-webkit-details-marker {
    display: none;
}
.group summary:hover {
    background: var(--color-hover);
}
.group .gtitle {
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    font-weight: 500;
}
.group .gcount {
    --font-size: 1.2rem;
    color: var(--color-secondary);
    min-width: 30px;
    text-align: right;
}
.group[open] summary {
    color: var(--color-primary);
}
.group .group-items {
    padding-left: 8px;
}
```

（按钮图标互斥依赖 `main[data-view]`——切时钟图标表示"点击切到按时间"，反之切地球，逻辑与 title 一致：显示的是**目标**视图图标。）

- [ ] **Step 7: 校验 + CDP 手动验证**

`node tools/check-i18n.mjs` → `i18n OK`。
CDP：点切换按钮 → `#main[data-view="s"]`、日期框隐藏、出现域名组（github.com ×N）；展开组见条目；组内删除生效；再点按钮回时间视图且列表正常重拉；关开 popup 视图态保持（storage 持久化）。

- [ ] **Step 8: Commit**

```bash
cd D:/projects/history-quick-view
git add src/groupview.js src/index.html src/main.js src/_locales src/style.css
git commit -m "feat: 按网站分组视图+时间/网站切换按钮（storage 持久化，懒展开渲染）"
```

---

### Task 6: 端到端回归固化 + 验收

**Files:**
- Create: `tools/e2e.mjs`（自包含：起 Chrome→CDP 装扩展→种数据→断言→截图→杀进程；一期 33 项断言全部移植 + 二期新增）
- Test: 即本体
- 产出: `docs/superpowers/plans/assets/phase2-flat-search.png`、`phase2-site-view.png`

**Interfaces:**
- Consumes: 前五个任务全部成果；一期 regress 脚本的断言清单（在一期计划文档 Task 6 与会话 scratchpad `regress.mjs`，如 scratchpad 已清理按一期计划文档重写）

- [ ] **Step 1: 写 `tools/e2e.mjs`**

结构（CDP 辅助函数与一期 cdp.mjs 相同：listTargets/connect/evalIn/screenshot；此处列关键差异，完整移植一期断言）：

```js
// 骨架
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = new URL("./e2e-profile/", import.meta.url).pathname.slice(1);
const EXT_PATH = "D:/projects/history-quick-view/src";
const PORT = 9224;
// 1. rmSync(PROFILE, {recursive:true, force:true}) 保证全新 profile（历史条目数确定）
// 2. spawn Chrome: --remote-debugging-port=9224 --user-data-dir=PROFILE
//    --enable-unsafe-extension-debugging --no-first-run --no-default-browser-check
//    --window-size=800,700 about:blank
// 3. 轮询 /json/version 就绪（最多 15s）
// 4. 浏览器级 WS: Extensions.loadUnpacked {path: EXT_PATH} → extId
// 5. 取 page target，Page.navigate 到 chrome-extension://extId/index.html
// 6. 种子: chrome.history.addUrl × 5（同一期清单，含 test-delete-me）+ Page.reload
// 7. 断言（check() 计数），最后杀 Chrome 进程、输出 N PASS / M FAIL、exit code
```

断言清单 = 一期 33 项全部（汉化 9 项、渲染 4 项、搜索过滤、删除 3 项、设置页 4 项、
主题 4 项、快捷键页 4 项、键盘 3 项、yesterday）——其中「搜索 mozilla 过滤」断言改为
新管线语义：`#g_container` 可见且含 developer.mozilla.org 条目、`#m_container` 隐藏——
再加二期新增：

```js
// —— 二期新增断言 ——
// 修重复渲染（全新 profile 保证确定性）
ok("无重复条目", await ev(`(function(){
    const h = [...document.querySelectorAll('#m_container [data-type="item"]')].map(a=>a.href);
    return h.length === new Set(h).size;
})()`));
// 模糊搜索
await type("gh");            // 设 input 值+dispatch input 事件，等 900ms
ok("gh 命中 github", await has("#g_container", "github.com/anthropics"));
ok("m_container 隐藏", await hidden("#m_container"));
await type("gogle");
ok("gogle 命中 google", await has("#g_container", "google.com/search"));
// site: 过滤与组合
await type("site:github.com");
ok("site: 只剩 github", await ev(`[...document.querySelectorAll('#g_container [data-type="item"]')].every(a=>new URL(a.href).hostname.endsWith("github.com"))`));
await type("site:github.com claude");
ok("site:+词组合", await has("#g_container", "claude-code"));
// 清空回时间视图
await type("");
ok("清空回 m_container", await hidden("#g_container") && !await hidden("#m_container"));
// 网站视图
await ev(`document.forms.namedItem("search")["viewtoggle"].click()`); await sleep(900);
ok("data-view=s", (await ev(`document.getElementById("main").getAttribute("data-view")`)) === "s");
ok("日期框隐藏", await ev(`getComputedStyle(document.querySelector('form[name="search"] .container.date')).display`) === "none");
ok("出现域名组", await ev(`document.querySelectorAll('#g_container details.group').length`) >= 3);
// 展开组 + 组内条目
await ev(`(function(){
    const g = [...document.querySelectorAll('#g_container details.group')].find(d=>d.querySelector('.gtitle').textContent.includes("github"));
    g.open = true; g.dispatchEvent(new Event("toggle"));
})()`); await sleep(300);
ok("组展开有条目", await ev(`(function(){
    const g = [...document.querySelectorAll('#g_container details.group')].find(d=>d.querySelector('.gtitle').textContent.includes("github"));
    return g.querySelectorAll('[data-type="item"]').length >= 1;
})()`));
// 视图持久化
ok("view 持久化", (await ev(`chrome.storage.local.get().then(s=>s.view)`, true)) === "s");
// 截图 site 视图 → 切回时间视图
await screenshot(wsUrl, "docs/superpowers/plans/assets/phase2-site-view.png");
await ev(`document.forms.namedItem("search")["viewtoggle"].click()`); await sleep(900);
// 中文日期（5 关键字均断言 date 框无 data-css-invalid）
for (const kw of ["今天", "昨天", "3天前", "周一", "7月5日"]) {
    await typeDate(kw);
    ok(`中文日期 ${kw} 合法`, !(await ev(`document.querySelector('input[name="date"]').hasAttribute("data-css-invalid")`)));
}
await typeDate("明天");
ok("非法中文日期标红", await ev(`document.querySelector('input[name="date"]').hasAttribute("data-css-invalid")`));
await typeDate("");
// 平铺搜索截图
await type("git"); // 有结果的搜索态
await screenshot(wsUrl, "docs/superpowers/plans/assets/phase2-flat-search.png");
```

辅助 `type(v)` / `typeDate(v)`：设 `input.value = v` 后 `dispatchEvent(new InputEvent("input", {bubbles:true}))`，`await sleep(900)`（防抖 500ms + 余量）；`has(sel, substr)`：容器内有 href 含 substr 的条目；`hidden(sel)`：元素有 `data-css-hidden`。

- [ ] **Step 2: 跑单测 + i18n 校验 + e2e**

```powershell
node D:/projects/history-quick-view/tools/test-fuzzy.mjs
node D:/projects/history-quick-view/tools/test-datecn.mjs
node D:/projects/history-quick-view/tools/check-i18n.mjs
node D:/projects/history-quick-view/tools/e2e.mjs
```

Expected: 四个全绿；e2e `N PASS / 0 FAIL`（N ≈ 33+20）。失败则修对应任务代码后重跑。

- [ ] **Step 3: 目检截图**

Read 两张截图：平铺搜索结果（标题「搜索结果（N 条）」、按分排序）、网站视图（域名组行 favicon+域名+条数、展开态）与 Material 风格一致。

- [ ] **Step 4: Commit**

```bash
cd D:/projects/history-quick-view
git add tools/e2e.mjs docs/superpowers/plans/assets
git commit -m "test: 端到端回归固化进仓库（一期33项+二期搜索/分组/中文日期/去重）含验收截图"
```

---

## 自查记录

- Spec 覆盖：模糊搜索（T2+T4）、site:+网站视图（T2 parseQuery+T4 过滤+T5 分组切换）、中文日期（T3）、重复渲染（T1）、错误处理（errFetchAll T4/非法日期标红 T3/空 site T2）、测试（T2/T3 单测+T6 e2e）✓
- 无占位符：各步骤均有完整代码/精确锚点 ✓
- 命名一致性：`HGroupView.render(rawQuery, view)`（T5 改签名，T4→T5 顺序执行无断档）、`updateResultsView`（T4 定义 T5 扩展）、`VIEW_TIME/VIEW_SITE`（T5 定义且仅 T5+ 使用）、`seenItemIds`（仅 T1）✓
- 风险注记：T5 `InitSearchQuery.text = "\uFFFF"` 是为强制原管线重拉的哨兵值（与真实输入必不相等，触发既有重置+重拉后即被覆盖）；HGroupView 的 catch 走 HError 会卸载搜索监听（原设计如此，属致命错误路径）
