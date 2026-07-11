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
