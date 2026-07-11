// 加载方式说明见 test-fuzzy.mjs：src 是上游 "type":"module"，按文本求值加载经典脚本
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/datecn.js", import.meta.url), "utf8");
const { translateChineseDateExpr } = new Function(
    src + "\nreturn {translateChineseDateExpr};"
)();

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
