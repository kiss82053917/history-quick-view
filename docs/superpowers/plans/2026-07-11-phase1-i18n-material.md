# 一期实施计划：汉化 + Chrome 原生 Material 美化

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 history-quick-view 扩展汉化（chrome.i18n 双语，中文默认）并把界面重塑为 Chrome 原生 Material 风格，功能行为零改动（唯一例外：主题选项新增"跟随系统"，已获用户认可）。

**Architecture:** 保持原有 MV3 零构建结构（`src/` 直接作为未打包扩展加载）。i18n 采用 `_locales/` + HTML `data-i18n*` 属性 + 独立 `i18n.js` 启动填充；样式改造只换 CSS 变量值和视觉规则，不动布局选择器结构。

**Tech Stack:** 原生 JS（无框架无构建）、chrome.i18n、CSS custom properties、Node 脚本做 i18n 一致性校验。

## Global Constraints

- 仓库：`D:\projects\history-quick-view`，分支 `feature/phase1-i18n-material`
- 功能零改动：搜索、日期解析、删除、快捷键、翻页逻辑一律不碰；日期搜索关键字（"today"/"yesterday"/"Oct" 等）保持英文
- 唯一功能增量：主题选项加"跟随系统"（value `"a"`），默认值仍为深色 `"d"`
- `extension/` 目录与 `build.sh` 一期不动；所有改动只发生在 `src/`、`tools/`、`docs/`
- main.js 现有 console.error/info 等开发者日志保持英文不翻
- 每个 Task 结束都要能以"加载已解压的扩展程序"方式正常打开 popup
- 提交信息用中文，结尾带 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

### Task 1: i18n 资源文件 + manifest 接入

**Files:**
- Create: `src/_locales/zh_CN/messages.json`
- Create: `src/_locales/en/messages.json`
- Modify: `src/manifest.json`
- Modify: `src/index.html:401`（footer 版本号）

**Interfaces:**
- Produces: 全部 i18n key（后续 Task 2/3/4 只能引用本表中已定义的 key，不得新造）

- [ ] **Step 1: 创建中文语言包**

`src/_locales/zh_CN/messages.json`：

```json
{
    "extName": { "message": "历史记录速览" },
    "extDesc": { "message": "快速查看、搜索和删除浏览历史记录" },
    "ttGoHistory": { "message": "打开历史记录页" },
    "ttClearData": { "message": "清除浏览数据" },
    "ttAbout": { "message": "关于" },
    "ttKeyboard": { "message": "键盘快捷键" },
    "ttMore": { "message": "设置" },
    "ttClose": { "message": "关闭" },
    "searchPlaceholder": { "message": "搜索历史记录" },
    "searchAria": { "message": "搜索浏览历史" },
    "noHistory": { "message": "暂无历史记录" },
    "errorTitle": { "message": "抱歉，出错了" },
    "errorReportPre": { "message": "请到 " },
    "errorReportPost": { "message": " 反馈此问题" },
    "configTitle": { "message": "设置" },
    "themeLabel": { "message": "主题：" },
    "themeDark": { "message": "深色" },
    "themeLight": { "message": "浅色" },
    "themeAuto": { "message": "跟随系统" },
    "showSearchLabel": { "message": "显示搜索栏：" },
    "openLinksLabel": { "message": "链接打开方式：" },
    "openLinksTitle": { "message": "设置链接在当前标签页还是新标签页中打开" },
    "openCurrent": { "message": "当前标签页" },
    "openNew": { "message": "新标签页" },
    "focusLabel": { "message": "自动切换到新标签页：" },
    "focusTitle": { "message": "打开新标签页时，是否自动跳转过去" },
    "createdBy": { "message": "作者" },
    "commandsTitle": { "message": "快捷键" },
    "kbdTab": { "message": "常规导航。" },
    "kbdS": { "message": "聚焦搜索框。" },
    "kbdCtrlQSearch": { "message": "在搜索框中，清空搜索文本。" },
    "kbdR": { "message": "删除一条链接。" },
    "kbdShiftR": { "message": "在链接上，删除该链接所在的整天记录。" },
    "kbdOpenContrary": { "message": "在条目上，以与「链接打开方式」设置相反的方式打开。" },
    "kbdOpenNewWindow": { "message": "在条目上，在新窗口中打开。" },
    "kbdCtrlQClose": { "message": "关闭任意页面。" },
    "kbdM": { "message": "打开或关闭「设置」页" },
    "kbdK": { "message": "打开或关闭「快捷键」页" },
    "removeItemTitle": { "message": "删除" },
    "removeRangeTitle": {
        "message": "删除 $DATE$ 的浏览记录",
        "placeholders": { "date": { "content": "$1" } }
    },
    "errCreateRange": { "message": "创建时间范围失败" },
    "errDomRange": { "message": "DOMRange 为空" }
}
```

- [ ] **Step 2: 创建英文语言包（key 集合与中文完全一致）**

`src/_locales/en/messages.json`：

```json
{
    "extName": { "message": "History Quick View" },
    "extDesc": { "message": "View, delete and search browsing history data" },
    "ttGoHistory": { "message": "Go to history" },
    "ttClearData": { "message": "Clear browsing history" },
    "ttAbout": { "message": "About" },
    "ttKeyboard": { "message": "Keyboard shortcuts" },
    "ttMore": { "message": "Settings" },
    "ttClose": { "message": "Close" },
    "searchPlaceholder": { "message": "Search history" },
    "searchAria": { "message": "on browsing history" },
    "noHistory": { "message": "No History" },
    "errorTitle": { "message": "Sorry, an ERROR occurs" },
    "errorReportPre": { "message": "please report to " },
    "errorReportPost": { "message": "" },
    "configTitle": { "message": "Settings" },
    "themeLabel": { "message": "Theme:" },
    "themeDark": { "message": "Dark" },
    "themeLight": { "message": "Light" },
    "themeAuto": { "message": "System" },
    "showSearchLabel": { "message": "Show Search bar:" },
    "openLinksLabel": { "message": "Open links at:" },
    "openLinksTitle": { "message": "Set if the url opens in the current or in a new tab" },
    "openCurrent": { "message": "Current Tab" },
    "openNew": { "message": "New Tab" },
    "focusLabel": { "message": "Focus opened tabs:" },
    "focusTitle": { "message": "When a new tab opens, go to it (focus it) or stay in your current tab" },
    "createdBy": { "message": "created by" },
    "commandsTitle": { "message": "Commands" },
    "kbdTab": { "message": "normal navigation." },
    "kbdS": { "message": "focus search input." },
    "kbdCtrlQSearch": { "message": "on search input, removes the search input text." },
    "kbdR": { "message": "removes a link" },
    "kbdShiftR": { "message": "on link, remove the complete day range." },
    "kbdOpenContrary": { "message": "on item, opens the item in a contrary way that the open behavior." },
    "kbdOpenNewWindow": { "message": "on item, opens the item in a new window." },
    "kbdCtrlQClose": { "message": "close any kind of section." },
    "kbdM": { "message": "open or close the \"more\" section" },
    "kbdK": { "message": "open or close the \"keyboard\" section" },
    "removeItemTitle": { "message": "remove" },
    "removeRangeTitle": {
        "message": "Remove $DATE$ browsing history",
        "placeholders": { "date": { "content": "$1" } }
    },
    "errCreateRange": { "message": "Creating Time Range fails" },
    "errDomRange": { "message": "DOMRange is null" }
}
```

注意：en 的 `errorReportPost` 是空串。`chrome.i18n.getMessage` 对空串消息返回 `""`，Task 2 的填充函数遇 `""` 保留原文案——因此 en 下该节点必须靠 HTML 里预置的原文兜底（见 Task 2 Step 2 的 HTML 改法：错误提示区保留英文原文文本作为初始内容）。

- [ ] **Step 3: manifest 接入 i18n 并升版本**

`src/manifest.json` 改为（整文件替换）：

```json
{
    "manifest_version": 3,
    "version": "0.5.0",
    "default_locale": "zh_CN",
    "name": "__MSG_extName__",
    "description": "__MSG_extDesc__",
    "author": "axarisar",
    "action": {
        "default_icon": {
            "16": "images/toolbar16.png",
            "32": "images/toolbar32.png"
        },
        "default_popup": "index.html",
        "default_title": "__MSG_extName__"
    },
    "icons": {
        "16": "images/icon16.png",
        "32": "images/icon32.png",
        "48": "images/icon48.png",
        "128": "images/icon128.png"
    },
    "permissions": ["favicon", "storage", "history"],
    "homepage_url": "https://github.com/kiss82053917/history-quick-view"
}
```

同时把 `src/index.html` 第 401 行 `<p class="version">v0.4.3</p>` 改为 `<p class="version">v0.5.0</p>`。

- [ ] **Step 4: 校验 JSON 合法 + 扩展可加载**

```powershell
node -e "['zh_CN','en'].forEach(l=>{JSON.parse(require('fs').readFileSync('D:/projects/history-quick-view/src/_locales/'+l+'/messages.json','utf8'));console.log(l+' OK')})"
```

Expected: `zh_CN OK` / `en OK`。
然后在 Chrome `chrome://extensions` 开发者模式加载 `D:\projects\history-quick-view\src`，扩展列表中名称显示为「历史记录速览」（中文系统语言下）。

- [ ] **Step 5: Commit**

```bash
cd D:/projects/history-quick-view
git add src/_locales src/manifest.json src/index.html
git commit -m "feat: 接入 chrome.i18n 双语资源，中文为默认语言，版本升至 0.5.0"
```

---

### Task 2: HTML 标注 + i18n.js 填充器 + 一致性校验脚本

**Files:**
- Create: `src/i18n.js`
- Create: `tools/check-i18n.mjs`
- Modify: `src/index.html`（全文文案元素加 `data-i18n*` 属性）

**Interfaces:**
- Consumes: Task 1 的全部 i18n key
- Produces: `data-i18n`（填 textContent）、`data-i18n-title`、`data-i18n-placeholder`、`data-i18n-arialabel` 四种属性约定；校验命令 `node tools/check-i18n.mjs`

- [ ] **Step 1: 写填充器 `src/i18n.js`**

```js
"use strict";
/*
 * 启动时把 data-i18n* 标注的元素文案替换为 chrome.i18n 消息。
 * getMessage 返回空串（key 缺失或消息为空）时保留 HTML 预置的原文案，
 * 因此界面永远不会出现空白文案。
 * <template> 的内容不在 document 查询范围内，需单独遍历 template.content。
 */
(function () {
    const RULES = [
        ["data-i18n", function (el, msg) { el.textContent = msg; }],
        ["data-i18n-title", function (el, msg) { el.setAttribute("title", msg); }],
        ["data-i18n-placeholder", function (el, msg) { el.setAttribute("placeholder", msg); }],
        ["data-i18n-arialabel", function (el, msg) { el.setAttribute("aria-label", msg); }],
    ];
    function apply(root) {
        for (const rule of RULES) {
            const attr = rule[0];
            const set = rule[1];
            const els = root.querySelectorAll("[" + attr + "]");
            for (const el of els) {
                const msg = chrome.i18n.getMessage(el.getAttribute(attr));
                if (msg !== "") {
                    set(el, msg);
                }
            }
        }
    }
    apply(document);
    const templates = document.querySelectorAll("template");
    for (const t of templates) {
        apply(t.content);
    }
    const name = chrome.i18n.getMessage("extName");
    if (name !== "") {
        document.title = name;
    }
    const locale = chrome.i18n.getMessage("@@ui_locale");
    if (locale !== "") {
        document.documentElement.lang = locale.replace("_", "-");
    }
}());
```

在 `src/index.html` 的 `<script src="/main.js" defer></script>` **之前**加一行：

```html
        <script src="/i18n.js" defer></script>
```

（defer 脚本按文档顺序执行，i18n.js 先跑完 main.js 才跑，模板克隆时文案已就位。）

- [ ] **Step 2: index.html 全量标注**

对照下表逐处修改（属性加在已有元素上，不动结构；唯一结构改动是错误提示区和快捷键页 m/k 两条，见后）：

| 位置（行号按原文件） | 元素 | 加的属性 |
|---|---|---|
| L6 `<title>` | title | 由 i18n.js 的 document.title 处理，不加属性 |
| L99 header h1 内 `<a>`（文本 History Quick View） | a | `data-i18n="extName"` |
| L127 `button[name=history]` | button | `data-i18n-title="ttGoHistory"` |
| L148 `button[name=clear]` | button | `data-i18n-title="ttClearData"` |
| L174 `button[name=about]` | button | `data-i18n-title="ttAbout"` |
| L195 `button[name=keyboard]` | button | `data-i18n-title="ttKeyboard"` |
| L220 `button[name=more]` | button | `data-i18n-title="ttMore"` |
| L242 `button[name=close]` | button | `data-i18n-title="ttClose"` |
| L267 `form[role=search]` aria-label | form | `data-i18n-arialabel="searchAria"` |
| L287 搜索输入 placeholder="Search history" | input | `data-i18n-placeholder="searchPlaceholder"` |
| L331 日期输入 placeholder="today" | 不翻（日期关键字语法） | — |
| L336 `#m_empty`（No History） | p | `data-i18n="noHistory"` |
| L340 error `<h3>` | h3 | `data-i18n="errorTitle"` |
| L342-346 error 第二个 span | 见下方结构改动 | |
| L354 more 页 `<h2>Configuration</h2>` | h2 | `data-i18n="configTitle"` |
| L374 `<p>Theme:</p>` | p | `data-i18n="themeLabel"` |
| L376 `<option value="d">Dark</option>` | option | `data-i18n="themeDark"` |
| L377 `<option value="l">Light</option>` | option | `data-i18n="themeLight"` |
| L381 `<p>Show Search bar:</p>` | p | `data-i18n="showSearchLabel"` |
| L385-387 `<p title="...">Open links at:</p>` | p | `data-i18n="openLinksLabel" data-i18n-title="openLinksTitle"` |
| L389 `<option value="c">` | option | `data-i18n="openCurrent"` |
| L390 `<option value="n">` | option | `data-i18n="openNew"` |
| L394-396 `<p title="...">Focus opened tabs:</p>` | p | `data-i18n="focusLabel" data-i18n-title="focusTitle"` |
| L403 `<p>created by <strong>...` | 见下方结构改动 | |
| L428 keyboard 页 `<h2>Commands</h2>` | h2 | `data-i18n="commandsTitle"` |
| L448 `<p>normal navigation.</p>` | p | `data-i18n="kbdTab"` |
| L453 `<p>focus search input.</p>` | p | `data-i18n="kbdS"` |
| L457 | p | `data-i18n="kbdCtrlQSearch"` |
| L462 | p | `data-i18n="kbdR"` |
| L466 | p | `data-i18n="kbdShiftR"` |
| L470 | p | `data-i18n="kbdOpenContrary"` |
| L474 | p | `data-i18n="kbdOpenContrary"` |
| L478 | p | `data-i18n="kbdOpenNewWindow"` |
| L482 | p | `data-i18n="kbdOpenNewWindow"` |
| L487 | p | `data-i18n="kbdCtrlQClose"` |
| L490-507 kbd m 条目 | 见下方结构改动 | |
| L508-532 kbd k 条目 | 见下方结构改动 | |
| L68 template_item 删除按钮 title="remove" | button | `data-i18n-title="removeItemTitle"` |

结构改动一（错误提示区 L339-347，保留英文原文兜底）：

```html
                    <section id="m_error" class="error" data-css-hidden>
                        <h3 data-i18n="errorTitle">Sorry, an ERROR occurs</h3>
                        <span name="msg"></span>
                        <span><span data-i18n="errorReportPre">please report to </span><a
                            href="https://github.com/AxelArielSaravia/history-quick-view/issues"
                            target="_blank"
                            rel="noreferrer noopener"
                        >github</a><span data-i18n="errorReportPost"></span></span>
                    </section>
```

结构改动二（footer 作者行 L403）：

```html
                        <p><span data-i18n="createdBy">created by</span> <strong>Axel Ariel Saravia</strong></p>
```

结构改动三（快捷键页 m/k 两条，把「文字+行内 svg+句号」改为「span 文案 + svg」，svg 原样保留）：

```html
                <article>
                    <h3><kbd>m</kbd></h3>
                    <p>
                        <span data-i18n="kbdM">open or close the "more" section</span> <svg
                            class="icon icon-ellipsis"
                            ...（原 svg 原样保留）...
                        </svg>
                    </p>
                </article>
```

`k` 条目同理，`<span data-i18n="kbdK">open or close the "keyboard" section</span>` + 原 keyboard svg。

所有加了 `data-i18n` 的元素**保留原英文文本**作为 getMessage 失败时的兜底。

- [ ] **Step 3: 写校验脚本 `tools/check-i18n.mjs`**

```js
import { readFileSync } from "node:fs";

const root = new URL("../src/", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

const zh = JSON.parse(read("_locales/zh_CN/messages.json"));
const en = JSON.parse(read("_locales/en/messages.json"));
const errors = [];

const zhKeys = new Set(Object.keys(zh));
const enKeys = new Set(Object.keys(en));
for (const k of zhKeys) if (!enKeys.has(k)) errors.push(`en 缺少 key: ${k}`);
for (const k of enKeys) if (!zhKeys.has(k)) errors.push(`zh_CN 缺少 key: ${k}`);

const html = read("index.html");
const attrRe = /data-i18n(?:-title|-placeholder|-arialabel)?="([^"]+)"/g;
let m;
let annotated = 0;
while ((m = attrRe.exec(html)) !== null) {
    annotated += 1;
    if (!zhKeys.has(m[1])) errors.push(`index.html 引用了不存在的 key: ${m[1]}`);
}
if (annotated < 30) errors.push(`index.html 标注过少（${annotated} < 30），疑似漏标`);

for (const f of ["main.js", "i18n.js"]) {
    const js = read(f);
    const callRe = /getMessage\("([A-Za-z0-9_@]+)"/g;
    while ((m = callRe.exec(js)) !== null) {
        if (m[1].startsWith("@@")) continue;
        if (!zhKeys.has(m[1])) errors.push(`${f} 引用了不存在的 key: ${m[1]}`);
    }
}

if (errors.length > 0) {
    console.error("i18n 校验失败：");
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
}
console.log(`i18n OK（${zhKeys.size} keys，HTML 标注 ${annotated} 处）`);
```

- [ ] **Step 4: 跑校验**

```powershell
node D:/projects/history-quick-view/tools/check-i18n.mjs
```

Expected: `i18n OK（43 keys，HTML 标注 3x 处）`（标注数 ≥30）。若报缺 key/漏标，回 Step 2 修。

- [ ] **Step 5: 浏览器实测**

重新加载扩展，打开 popup：标题、六个头部按钮 tooltip、搜索框占位符、设置页、快捷键页全部显示中文；`#m_empty`（清空搜索到无结果时）显示「暂无历史记录」。

- [ ] **Step 6: Commit**

```bash
cd D:/projects/history-quick-view
git add src/index.html src/i18n.js tools/check-i18n.mjs
git commit -m "feat: HTML 全量 i18n 标注 + 启动填充器 + 一致性校验脚本"
```

---

### Task 3: main.js 动态文案汉化（3 处）

**Files:**
- Modify: `src/main.js:711-714`（范围删除按钮 tooltip）
- Modify: `src/main.js:1429`、`src/main.js:1470`（errCreateRange 两处）
- Modify: `src/main.js:1451`（errDomRange）

**Interfaces:**
- Consumes: Task 1 的 `removeRangeTitle` / `errCreateRange` / `errDomRange`

- [ ] **Step 1: 范围删除 tooltip**

`src/main.js` 711-714 行，把

```js
        DOMDelete?.setAttribute(
            "title",
            `Remove ${dateFormat} browsing history`
        );
```

改为

```js
        DOMDelete?.setAttribute(
            "title",
            chrome.i18n.getMessage("removeRangeTitle", [dateFormat])
        );
```

- [ ] **Step 2: 错误消息**

把两处 `HError.set("Creating Time Range fails");`（1429、1470 行附近）全部改为：

```js
        HError.set(chrome.i18n.getMessage("errCreateRange"));
```

把 `HError.set("DOMRange is null");`（1451 行附近）改为：

```js
        HError.set(chrome.i18n.getMessage("errDomRange"));
```

（console.error/console.info 保持英文不动。）

- [ ] **Step 3: 校验 + 实测**

```powershell
node D:/projects/history-quick-view/tools/check-i18n.mjs
```

Expected: `i18n OK`。
重载扩展打开 popup，鼠标悬停某个日期行的删除按钮，tooltip 显示「删除 2026年7月11日星期六 的浏览记录」（日期部分由 Intl 按浏览器语言输出）。

- [ ] **Step 4: Commit**

```bash
cd D:/projects/history-quick-view
git add src/main.js
git commit -m "feat: 动态文案接入 i18n（范围删除提示与错误消息）"
```

---

### Task 4: 主题新增「跟随系统」选项

**Files:**
- Modify: `src/main.js:52`（常量）、`src/main.js:662`（启动校验）、`src/main.js:1231-1245`（onchange 校验）
- Modify: `src/index.html:375-378`（theme select）

**Interfaces:**
- Produces: 主题合法值 `"d" | "l" | "a"`；`<html>` 的 class 为其中之一。Task 5 的 CSS 必须为 `html.a` 提供 prefers-color-scheme 双套变量。

- [ ] **Step 1: 加常量**

`src/main.js` 52 行 `const STORAGE_THEME_LIGHT = "l";` 之后加：

```js
const STORAGE_THEME_AUTO = "a";
```

- [ ] **Step 2: 启动校验放行 "a"**

662 行改为：

```js
    if (theme === STORAGE_THEME_DARK
        || theme === STORAGE_THEME_LIGHT
        || theme === STORAGE_THEME_AUTO
    ) {
```

- [ ] **Step 3: onchange 校验放行 "a"**

1231-1235 行的条件改为：

```js
            if (
                target.value === STORAGE_THEME_DARK
                    || target.value === STORAGE_THEME_LIGHT
                    || target.value === STORAGE_THEME_AUTO
            ) {
```

（else 分支回退默认 `"d"` 的逻辑不动。）

- [ ] **Step 4: select 加选项**

`src/index.html` theme select 改为：

```html
                        <select name="theme">
                            <option value="d" data-i18n="themeDark">Dark</option>
                            <option value="l" data-i18n="themeLight">Light</option>
                            <option value="a" data-i18n="themeAuto">System</option>
                        </select>
```

- [ ] **Step 5: 实测**

重载扩展：设置页主题下拉出现「深色/浅色/跟随系统」；选「跟随系统」后关开 popup 仍保持该选项（storage 持久化生效）。此时视觉上还没有 auto 样式（Task 5 补 CSS），`<html class="a">` 下页面暂时无主题变量、样子发白——属预期中间态。

- [ ] **Step 6: Commit**

```bash
cd D:/projects/history-quick-view
git add src/main.js src/index.html
git commit -m "feat: 主题新增「跟随系统」选项（d/l/a）"
```

---

### Task 5: style.css Material 化重写

**Files:**
- Modify: `src/style.css`（整文件替换）

**Interfaces:**
- Consumes: Task 4 的 `html.a` 约定；原 HTML 的全部结构选择器（`.shell`、`[data-css-hidden]`、`.search-container`、`.page` 等——一个都不能少，main.js 和布局依赖它们）

- [ ] **Step 1: 整文件替换为以下内容**

设计要点：Google Material 色板（深色 `#202124/#e8eaed/#8ab4f8`，浅色 `#ffffff/#202124/#1a73e8`）；`html.a` 用两段 `@media (prefers-color-scheme)` 提供同套变量；图标按钮圆形 hover（Chrome 工具栏样式）；输入框填充式圆角；`:focus-visible` 主色描边；所有原有布局规则原样保留。

```css
:root {
    --font: "Roboto","Segoe UI",system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;

    --icon-size: 20px;

    --font-size: 1.4rem;

    --z-index-mid: 2;
    --z-index-high: 3;

    --item-height: 35px;

    --border-radius: 8px;
    --search-height: 476px;
    --page-height: 531px;
}

html {
    background: var(--color-bg, #202124);
    font-size: 10px;
    box-sizing: border-box;
}

*,
*::before,
*::after {
    box-sizing: inherit;
}

html.d {
    --color: #e8eaed;
    --color-secondary: #9aa0a6;
    --color-bg: #202124;
    --color-bg-d: #292a2d;

    --color-hover: #2d2e31;
    --color-hover-l: #3c4043;
    --color-border: #3c4043;
    --color-primary: #8ab4f8;
    --color-danger: #f28b82;
    accent-color: #8ab4f8;
    color-scheme: dark;
}

html.l {
    --color: #202124;
    --color-secondary: #5f6368;
    --color-bg: #ffffff;
    --color-bg-d: #f1f3f4;

    --color-hover: #f1f3f4;
    --color-hover-l: #e8eaed;
    --color-border: #dadce0;
    --color-primary: #1a73e8;
    --color-danger: #d93025;
    accent-color: #1a73e8;
    color-scheme: light;
}

@media (prefers-color-scheme: dark) {
    html.a {
        --color: #e8eaed;
        --color-secondary: #9aa0a6;
        --color-bg: #202124;
        --color-bg-d: #292a2d;

        --color-hover: #2d2e31;
        --color-hover-l: #3c4043;
        --color-border: #3c4043;
        --color-primary: #8ab4f8;
        --color-danger: #f28b82;
        accent-color: #8ab4f8;
        color-scheme: dark;
    }
}

@media (prefers-color-scheme: light) {
    html.a {
        --color: #202124;
        --color-secondary: #5f6368;
        --color-bg: #ffffff;
        --color-bg-d: #f1f3f4;

        --color-hover: #f1f3f4;
        --color-hover-l: #e8eaed;
        --color-border: #dadce0;
        --color-primary: #1a73e8;
        --color-danger: #d93025;
        accent-color: #1a73e8;
        color-scheme: light;
    }
}

body {
    position: relative;
    width: 380px;
    margin: 0;
    padding: 0;
    font-family: var(--font);
    background: var(--color-bg);
    color: var(--color);
}

[data-css-hidden] {
    display: none;
}

[data-css-invalid] {
    color: var(--color-danger);
    text-decoration-line: line-through;
}

.shell::after {
    content: "";
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
}

:is(h1, h2, h3, p, select) {
    font-size: var(--font-size);
    margin: 0;
}

select {
    padding: 4px 8px;
    background: var(--color-bg-d);
    color: var(--color);
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius);
    font-family: var(--font);
}

a {
    color: var(--color);
    border-radius: var(--border-radius);
}
a:hover {
    background: var(--color-hover);
    border-radius: var(--border-radius);
}

input {
    border-radius: var(--border-radius);
}
:is(button, select, input[type="checkbox"]) {
    cursor: pointer;
}

button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    padding: 6px;
    color: var(--color);
    font-family: var(--font);
    border-radius: 50%;
}

button:hover {
    background: var(--color-hover-l);
}

button:not(:hover) {
    background: transparent;
}

:is(a, button, input, select):focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: -1px;
}

kbd {
    font-family: monospace;
    background: var(--color-bg-d);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 2px 5px;
}

.icon {
    width: var(--icon-size);
}


/*HEADER*/
.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px;
}

.header .left {
    display: flex;
    align-items: center;
}

.header .right {
    display: flex;
    align-items: center;
    gap: 2px;
}

.header h1 {
    font-weight: 500;
    padding: 5px;
}
.header h1 a {
    text-decoration: none;
}
.header h1 span {
    font-size: 1ch;
    font-weight: normal;
}

.header .loading {
    animation: 2s ease-in-out 0s infinite spin;
    color: var(--color-primary);
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}


form[name="search"]:not([data-css-hidden]) {
    --icon-size: 15px;
    display: flex;
    align-items: center;
    position: relative;
    padding: 0 15px 16px;
    gap: 8px;
}

form[name="search"] .container {
    display: flex;
    align-items: center;
    position: relative;
}
form[name="search"] .container.text {
    width: 65%;
}
form[name="search"] .container.date {
    --font-size: 1.2rem;
    width: 35%;
}

form[name="search"] :where(.icon-search, .icon-calendar) {
    position: absolute;
    transform: translateX(7px);
    color: var(--color-secondary);
}

form[name="search"] input {
    width: 100%;
    min-height: var(--item-height);
    background: var(--color-bg-d);
    color: var(--color);
    font-family: var(--font);
    border: none;
    border-radius: 18px;
    line-height: 2;
    padding-right: 1ch;
    padding-left: calc(7px * 2 + var(--icon-size));
    font-size: var(--font-size);
}

form[name="search"] input::placeholder {
    color: var(--color-secondary);
}

form[name="search"] .text input {
    padding-right: 30px;
}

form[name="search"] span {
    position: absolute;
    font-size: var(--font-size);
}

form[name="search"] button {
    position: absolute;
    right: 0;
    transform: translateX(-5px);
}

.search-container {
    --padding: 0px 8px;
    --icon-size: 15px;
    --height: var(--search-height);

    position: relative;

    padding-block: 5px;
    border-top: 1px solid var(--color-border);
    line-height: 2;
}
form[name="search"][data-css-hidden]~.search-container {
    --height: var(--page-height);
}

.search-container :is(.empty,.error):not([data-css-hidden]) {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    opacity: 60%;
    height: 100%;
    width: 100%;
    font-size: 2rem;
    color: var(--color-secondary);
}
.search-container .error h3 {
    font-size: 2.2rem;
    color: var(--color-danger);
}

.search-container .error a {
    color: var(--color-danger);
}

.search-container .container {
    overflow: auto;
    height: var(--height);
    padding-inline: 5px;
}

.search-container .container::-webkit-scrollbar {
    width: 8px;
}
.search-container .container::-webkit-scrollbar-thumb {
    background-color: var(--color-border);
    border-radius: 4px;
}

.search-container :is(.date, .item) [name="remove"] {
    position: absolute;
    top: 5px;
    right: 5px;
    z-index: var(--z-index-mid);
}

.search-container :is(.item, .date):not(:hover) {
    background: var(--color-bg);
}

.search-container :is(.item, .date):hover {
    background: var(--color-hover);
}

.search-container .date {
    position: sticky;
    top: 0;
    z-index: var(--z-index-high);
    display: flex;
    align-items: center;
    padding: var(--padding);
    height: var(--item-height);
    border-radius: var(--border-radius);
}

.search-container .date .title {
    font-weight: 500;
    color: var(--color-primary);
}

.search-container .item {
    position: relative;
    display: flex;
    align-items: center;
    height: var(--item-height);
    padding: var(--padding);
    text-decoration: none;
    outline-offset: -2px;
    border-radius: var(--border-radius);
}
.search-container .item::before {
    content: "";
    position: absolute;
    width: 30px;
    height: 70%;
    right: 60px;
}
.search-container .item:not(:hover)::before {
    background: linear-gradient(to left, var(--color-bg), transparent);
}
.search-container .item:hover::before {
    background: linear-gradient(to left, var(--color-hover), transparent);
}

.search-container .item [name="title"] {
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    padding-left: 10px;
}

.search-container .item [name="time"] {
    --font-size: 1.2rem;
    position: relative;
    text-align: right;
    min-width: 60px;
    color: var(--color-secondary);
}

.search-container .item:hover [name="time"] {
    visibility: hidden;
}

.search-container .item:not(:hover) [name="remove"] {
    display: none;
}


.page {
    overflow: auto;
    width: 100%;
    height: var(--page-height);
    padding: 0 10px 10px;
}

.page::-webkit-scrollbar-thumb {
    background-color: var(--color-border);
    border-radius: 4px;
}
.page::-webkit-scrollbar {
    width: 8px;
}

.page>header {
    position: sticky;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0 20px;
    background: var(--color-bg);
}
.page>header::after {
    content: "";
    position: absolute;
    bottom: 10px;
    display: block;
    width: 100%;
    height: 1px;
    background: var(--color-border);
}

.page[name="more"] form {
    padding-block: 10px;
}

.page[name="more"] form .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 10px;
}

.page[name="more"] form input[type="checkbox"] {
    width: 18px;
    height: 18px;
}

.page[name="keyboard"] article {
    padding: 10px 0;
    display: flex;
}
.page[name="keyboard"] article h3 {
    --font-size: 1.2rem;
    flex-shrink: 0;
    line-height: 2;
}

.page[name="keyboard"] article p {
    padding-left: 10px;
}

.page[name="keyboard"] hr {
    margin: 10px 0;
    border: none;
    border-top: 1px solid var(--color-border);
}

:is(
    main[data-show="search"]>:not([name="search"]),
    main[data-show="more"]>:not([name="more"]),
    main[data-show="keyboard"]>:not([name="keyboard"])
) {
    display: none;
}
.page footer {
    padding-top: 20px;
    border-top: 1px solid var(--color-border);
}
.page footer .version {
    color: var(--color-secondary);
}
.page footer div {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.page footer a {
    padding: 5px
}

.page footer a:hover {
    background: var(--color-hover);
}
```

- [ ] **Step 2: 三主题实测**

重载扩展，依次把主题切到 深色 / 浅色 / 跟随系统：
- 深色：背景 `#202124`，主色浅蓝，行 hover 变亮
- 浅色：白底，Google 蓝
- 跟随系统：跟随 Windows 深浅色设置变化（可在系统设置里切一次验证）
- 检查项：搜索框圆角填充式、头部按钮圆形 hover、日期标题主色加粗、时间列次要色、错误页红色为 Material 红

- [ ] **Step 3: Commit**

```bash
cd D:/projects/history-quick-view
git add src/style.css
git commit -m "style: Material 化配色与控件样式，支持 d/l/a 三主题"
```

---

### Task 6: 功能回归 + 双色截图验收

**Files:** 无代码改动；产出验收截图存 `docs/superpowers/plans/assets/`（如目录不存在则创建）

**Interfaces:**
- Consumes: 前五个 Task 的全部成果

- [ ] **Step 1: 跑校验脚本终验**

```powershell
node D:/projects/history-quick-view/tools/check-i18n.mjs
```

Expected: `i18n OK`。

- [ ] **Step 2: 功能回归清单（用 chrome-devtools-mcp 或人工过一遍）**

popup 无法直接被 devtools MCP 打开时，可直接导航到 `chrome-extension://<扩展ID>/index.html` 页面式验证：

| # | 操作 | 预期 |
|---|---|---|
| 1 | 打开 popup | 显示最近历史，按日期分组，日期标题中文（Intl 输出） |
| 2 | 搜索框输入关键词 | 结果实时过滤，无结果时显示「暂无历史记录」 |
| 3 | 日期框输入 `yesterday` | 跳到昨天的记录（英文关键字仍有效） |
| 4 | 悬停条目 → 点删除 | 该条消失；悬停日期行删除按钮 tooltip 为中文 |
| 5 | 头部 6 按钮逐个悬停 | tooltip 全中文 |
| 6 | 设置页：改主题/搜索栏显隐/打开方式/焦点开关，关开 popup | 设置持久化生效 |
| 7 | 快捷键：`s` 聚焦搜索、`m` 开设置、`k` 开快捷键页、`Ctrl+q` 关闭 | 行为与改造前一致 |
| 8 | 点击任一历史条目 | 按「链接打开方式」设置打开 |

- [ ] **Step 3: 双色截图**

深色与浅色主题各截一张 popup 全貌，存 `docs/superpowers/plans/assets/phase1-dark.png` / `phase1-light.png`，与 `chrome://history` 风格对照确认观感一致。

- [ ] **Step 4: 终验 Commit**

```bash
cd D:/projects/history-quick-view
git add docs/superpowers/plans/assets
git commit -m "docs: 一期验收截图（深/浅色）"
```

---

## 自查记录

- Spec 覆盖：i18n（Task 1-3）、Material 美化（Task 5）、深浅色（Task 4+5）、验证（Task 6）、"明确不做"清单全部未违反 ✓
- 类型/命名一致性：i18n key 只在 Task 1 定义，Task 2/3/4 引用均在表内；主题值 `"a"` 在 Task 4（JS/HTML）与 Task 5（CSS `html.a`）一致 ✓
- 设计偏差说明：设计文档写"深浅色 prefers-color-scheme 自动切换"，实探源码后发现原插件是手动主题选项——调和为"保留 d/l 手动 + 新增 a 跟随系统"，已在对话中向用户说明并获认可 ✓
