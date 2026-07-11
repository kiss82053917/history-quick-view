/*
 * 端到端回归：自起 Chrome（全新 profile）→ CDP 装未打包扩展 → 种历史 → 全量断言 → 截图 → 收尾。
 * 依赖：Node ≥22（全局 fetch/WebSocket）、本机 Chrome ≥137（须 --enable-unsafe-extension-debugging）。
 * 运行：node tools/e2e.mjs
 */
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PROFILE = fileURLToPath(new URL("./e2e-profile/", import.meta.url));
const EXT_PATH = fileURLToPath(new URL("../src", import.meta.url));
const ASSETS = fileURLToPath(new URL("../docs/superpowers/plans/assets/", import.meta.url));
const PORT = 9224;

// ---------- CDP 基础 ----------
function connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener("message", (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id !== undefined && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
        }
    });
    const ready = new Promise((res, rej) => {
        ws.addEventListener("open", res);
        ws.addEventListener("error", rej);
    });
    return {
        ready,
        send(method, params = {}) {
            const id = nextId++;
            return new Promise((resolve, reject) => {
                pending.set(id, { resolve, reject });
                ws.send(JSON.stringify({ id, method, params }));
            });
        },
        close() { ws.close(); },
    };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 启动 ----------
rmSync(PROFILE, { recursive: true, force: true });
mkdirSync(ASSETS, { recursive: true });
const chrome = spawn(CHROME, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--enable-unsafe-extension-debugging",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=800,700",
    "about:blank",
], { stdio: "ignore" });

let version = null;
for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
        version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
        break;
    } catch { /* 未就绪 */ }
}
if (version === null) {
    console.error("Chrome CDP 未就绪");
    process.exit(2);
}

const browser = connect(version.webSocketDebuggerUrl);
await browser.ready;
const { id: EXT } = await browser.send("Extensions.loadUnpacked", { path: EXT_PATH });
browser.close();

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = targets.find((x) => x.type === "page");
const c = connect(page.webSocketDebuggerUrl);
await c.ready;
await c.send("Page.enable");
await c.send("Page.navigate", { url: `chrome-extension://${EXT}/index.html` });
await sleep(1500);

// ---------- 断言工具 ----------
let pass = 0, fail = 0;
function check(name, cond, extra = "") {
    if (cond) { pass++; console.log(`PASS ${name}`); }
    else { fail++; console.log(`FAIL ${name} ${extra}`); }
}
async function ev(expr, awaitPromise = false) {
    const r = await c.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
}
async function type(v) {
    await ev(`(function(){
        const i = document.querySelector('input[name="text"]');
        i.value = ${JSON.stringify(v)};
        i.dispatchEvent(new InputEvent("input", {bubbles: true}));
    })()`);
    await sleep(900);
}
async function typeDate(v) {
    await ev(`(function(){
        const i = document.querySelector('input[name="date"]');
        i.value = ${JSON.stringify(v)};
        i.dispatchEvent(new InputEvent("input", {bubbles: true}));
    })()`);
    await sleep(900);
}
const hidden = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).hasAttribute("data-css-hidden")`);
const gHas = (substr) => ev(`[...document.querySelectorAll('#g_container [data-type="item"]')].some((a) => a.href.includes(${JSON.stringify(substr)}))`);
async function pressKey(key, code) {
    await c.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, text: key });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
    await sleep(300);
}
async function setTheme(v) {
    await ev(`(function(){
        const s = document.querySelector('select[name="theme"]');
        s.value = ${JSON.stringify(v)};
        s.dispatchEvent(new Event("change", {bubbles: true}));
    })()`);
    await sleep(300);
}
async function screenshot(path) {
    const r = await c.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path, Buffer.from(r.data, "base64"));
}

// ---------- 种子 ----------
await ev(`Promise.all([
    "https://github.com/anthropics/claude-code",
    "https://developer.mozilla.org/zh-CN/docs/Web",
    "https://www.google.com/search?q=chrome+extension",
    "https://news.ycombinator.com/",
    "https://example.com/test-delete-me",
].map((u) => chrome.history.addUrl({url: u})))`, true);
await c.send("Page.reload");
await sleep(1800);

// ---------- 一期回归：汉化 ----------
check("标题为中文", (await ev("document.title")) === "历史记录速览");
check("html lang=zh-CN", (await ev("document.documentElement.lang")) === "zh-CN");
check("h1 品牌名", (await ev(`document.querySelector(".header h1 a").textContent`)) === "历史记录速览");
check("历史按钮 tooltip", (await ev(`document.querySelector('button[name="history"]').title`)) === "打开历史记录页");
check("清除按钮 tooltip", (await ev(`document.querySelector('button[name="clear"]').title`)) === "清除浏览数据");
check("更多按钮 tooltip", (await ev(`document.querySelector('button[name="more"]').title`)) === "设置");
check("搜索占位符", (await ev(`document.querySelector('input[name="text"]').placeholder`)) === "搜索历史记录");
check("日期占位符中文", (await ev(`document.querySelector('input[name="date"]').placeholder`)) === "今天");
check("空态文案", (await ev(`document.getElementById("m_empty").textContent.trim()`)) === "暂无历史记录");

// ---------- 一期回归：渲染 + 二期去重 ----------
const hrefs = await ev(`[...document.querySelectorAll('#m_container [data-type="item"]')].map((a) => a.href)`);
check("无重复条目(二期修复)", hrefs.length === new Set(hrefs).size, `共 ${hrefs.length}`);
const seeded = ["github.com/anthropics", "developer.mozilla.org", "google.com/search", "ycombinator", "test-delete-me"];
check("5 个种子 URL 全部渲染", seeded.every((s) => hrefs.some((u) => u.includes(s))));
check("日期标题非空", (await ev(`document.querySelector('.date .title').textContent`)).length > 0);
const rmTitle = await ev(`document.querySelector('.date button[name="remove"]').title`);
check("范围删除 tooltip 中文", rmTitle.startsWith("删除 ") && rmTitle.endsWith(" 的浏览记录"), rmTitle);
check("条目删除 tooltip 中文", (await ev(`document.querySelector('[data-type="item"] button[name="remove"]').title`)) === "删除");

// ---------- 二期：模糊搜索 ----------
await type("gh");
check("gh 命中 github", await gHas("github.com"));
check("搜索态 m_container 隐藏", await hidden("#m_container"));
check("搜索态 g_container 可见", !(await hidden("#g_container")));
check("结果标题带条数", await ev(`document.querySelector('#g_container .title').textContent.includes("搜索结果")`));
await type("gogle");
check("gogle 错字命中 google", await gHas("google.com"));
await type("mozilla");
check("mozilla 子串命中", await gHas("mozilla.org"));

// ---------- 二期：site: ----------
await type("site:github.com");
check("site: 只剩 github", await ev(`(function(){
    const a = [...document.querySelectorAll('#g_container [data-type="item"]')];
    return a.length > 0 && a.every((x) => new URL(x.href).hostname.endsWith("github.com"));
})()`));
await type("site:github.com claude");
check("site:+词组合", await gHas("claude-code"));

// ---------- 二期：搜索态删除 ----------
await type("test-delete-me");
check("删除目标可搜到", await gHas("test-delete-me"));
await ev(`(function(){
    const a = [...document.querySelectorAll('#g_container [data-type="item"]')].find((x) => x.href.includes("test-delete-me"));
    a.querySelector('button[name="remove"]').click();
})()`);
await sleep(800);
check("删除后 DOM 移除", !(await gHas("test-delete-me")));
check("删除后历史库移除", (await ev(`chrome.history.search({text: "test-delete-me"}).then((r) => r.length)`, true)) === 0);
await type("test-delete-me");
check("缓存失效后重搜不出现", !(await gHas("test-delete-me")));

// ---------- 平铺搜索截图 ----------
await type("git");
await screenshot(ASSETS + "phase2-flat-search.png");

// ---------- 清空回时间视图 ----------
await type("");
check("清空回 m_container", !(await hidden("#m_container")) && (await hidden("#g_container")));
check("时间视图有条目", (await ev(`document.querySelectorAll('#m_container [data-type="item"]').length`)) > 0);

// ---------- 二期：网站视图 ----------
await ev(`document.forms.namedItem("search")["viewtoggle"].click()`);
await sleep(900);
check("data-view=s", (await ev(`document.getElementById("main").getAttribute("data-view")`)) === "s");
check("切换按钮 title", (await ev(`document.forms.namedItem("search")["viewtoggle"].title`)) === "按时间浏览");
check("日期框隐藏", (await ev(`getComputedStyle(document.querySelector('form[name="search"] .container.date')).display`)) === "none");
check("出现域名组", (await ev(`document.querySelectorAll('#g_container details.group').length`)) >= 3);
await ev(`(function(){
    const g = [...document.querySelectorAll('#g_container details.group')].find((d) => d.querySelector('.gtitle').textContent.includes("github"));
    g.open = true;
})()`);
await sleep(400);
check("组展开有条目", await ev(`(function(){
    const g = [...document.querySelectorAll('#g_container details.group')].find((d) => d.querySelector('.gtitle').textContent.includes("github"));
    return g.querySelectorAll('[data-type="item"]').length >= 1;
})()`));
check("view 持久化", (await ev(`chrome.storage.local.get().then((s) => s.view)`, true)) === "s");
await screenshot(ASSETS + "phase2-site-view.png");
// 切回
await ev(`document.forms.namedItem("search")["viewtoggle"].click()`);
await sleep(1200);
check("切回时间视图", (await ev(`document.getElementById("main").getAttribute("data-view")`)) === "t");

// ---------- 二期：中文日期 ----------
for (const kw of ["今天", "昨天", "3天前", "周一", "7月5日"]) {
    await typeDate(kw);
    check(`中文日期 ${kw} 合法`, !(await ev(`document.querySelector('input[name="date"]').hasAttribute("data-css-invalid")`)));
}
await typeDate("明天");
check("非法中文日期标红", await ev(`document.querySelector('input[name="date"]').hasAttribute("data-css-invalid")`));
await typeDate("yesterday");
check("英文关键字仍合法", !(await ev(`document.querySelector('input[name="date"]').hasAttribute("data-css-invalid")`)));
await typeDate("");

// ---------- 一期回归：设置页 ----------
await ev(`document.querySelector('button[name="more"]').click()`);
await sleep(300);
check("设置页打开", (await ev(`document.getElementById("main").getAttribute("data-show")`)) === "more");
check("设置页标题", (await ev(`document.querySelector('#section_more h2').textContent`)) === "设置");
check("主题选项文案", (await ev(`[...document.querySelectorAll('select[name="theme"] option')].map((o) => o.textContent).join(",")`)) === "深色,浅色,跟随系统");
check("打开方式选项", (await ev(`[...document.querySelectorAll('select[name="open"] option')].map((o) => o.textContent).join(",")`)) === "当前标签页,新标签页");

// ---------- 一期回归：主题 ----------
await setTheme("l");
check("浅色类生效", (await ev(`document.documentElement.className`)) === "l");
await setTheme("a");
check("跟随系统类生效", (await ev(`document.documentElement.className`)) === "a");
check("主题持久化为 a", (await ev(`chrome.storage.local.get().then((s) => s.theme)`, true)) === "a");
await setTheme("d");
check("深色类生效", (await ev(`document.documentElement.className`)) === "d");

// ---------- 一期回归：快捷键页 ----------
await ev(`document.querySelector('button[name="keyboard"]').click()`);
await sleep(300);
check("快捷键页打开", (await ev(`document.getElementById("main").getAttribute("data-show")`)) === "keyboard");
check("快捷键页标题", (await ev(`document.querySelector('#section_keyboard h2').textContent`)) === "快捷键");
check("kbd 文案中文", (await ev(`document.querySelector('#section_keyboard article p').textContent.trim()`)) === "常规导航。");
await ev(`document.querySelector('#section_keyboard button[data-action="close"]').click()`);
await sleep(300);
check("返回搜索页", (await ev(`document.getElementById("main").getAttribute("data-show")`)) === "search");

// ---------- 一期回归：键盘快捷键 ----------
await ev(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
await pressKey("m", "KeyM");
check("快捷键 m 开设置页", (await ev(`document.getElementById("main").getAttribute("data-show")`)) === "more");
await pressKey("m", "KeyM");
check("快捷键 m 关设置页", (await ev(`document.getElementById("main").getAttribute("data-show")`)) === "search");
await pressKey("s", "KeyS");
check("快捷键 s 聚焦搜索", (await ev(`document.activeElement.name`)) === "text");

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

// ---------- 收尾 ----------
console.log(`\ne2e: ${pass} PASS / ${fail} FAIL`);
c.close();
chrome.kill();
await sleep(500);
process.exit(fail > 0 ? 1 : 0);
