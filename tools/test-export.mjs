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
