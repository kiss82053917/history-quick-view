// src/package.json 是上游的 "type":"module"，src/*.js 会被 Node 当 ESM，
// 而扩展里它们是经典脚本（全局函数）。这里按文本加载求值，两头都不用改。
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/fuzzy.js", import.meta.url), "utf8");
const { fuzzyScore, fuzzyMatch, parseQuery } = new Function(
    src + "\nreturn {fuzzyScore, fuzzyMatch, parseQuery};"
)();

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
