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

const attrRe = /data-i18n(?:-title|-placeholder|-arialabel)?="([^"]+)"/g;
let m;
let annotated = 0;
for (const hf of ["index.html", "stats.html"]) {
    const html = read(hf);
    while ((m = attrRe.exec(html)) !== null) {
        annotated += 1;
        if (!zhKeys.has(m[1])) errors.push(`${hf} 引用了不存在的 key: ${m[1]}`);
    }
}
if (annotated < 30) errors.push(`HTML 标注过少（${annotated} < 30），疑似漏标`);

for (const f of ["main.js", "i18n.js", "groupview.js", "stats.js", "stats-data.js"]) {
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
