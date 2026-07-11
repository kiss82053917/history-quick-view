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
