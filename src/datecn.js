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

const CN_NUM_PATTERN = "([0-9]+|[一二两三四五六七八九十]+)";

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
    let m = new RegExp("^" + CN_NUM_PATTERN + "\\s*天前$").exec(s);
    if (m !== null) {
        const n = cnNumToInt(m[1]);
        return n > 0 ? "-" + n + " d" : expr;
    }
    m = new RegExp("^" + CN_NUM_PATTERN + "\\s*(?:个)?(?:周|星期)前$").exec(s);
    if (m !== null) {
        const n = cnNumToInt(m[1]);
        return n > 0 ? "-" + n + " w" : expr;
    }
    m = new RegExp("^" + CN_NUM_PATTERN + "\\s*(?:个)?月前$").exec(s);
    if (m !== null) {
        const n = cnNumToInt(m[1]);
        return n > 0 ? "-" + n + " m" : expr;
    }
    m = /^(?:周|星期|礼拜)([一二三四五六日天])$/.exec(s);
    if (m !== null) {
        return CN_WDAY_SHORT[m[1]];
    }
    m = new RegExp("^" + CN_NUM_PATTERN + "月" + CN_NUM_PATTERN + "[日号]$").exec(s);
    if (m !== null) {
        const mo = cnNumToInt(m[1]);
        const day = cnNumToInt(m[2]);
        if (1 <= mo && mo <= 12 && 1 <= day && day <= 31) {
            return CN_MONTH_SHORT[mo - 1] + " " + day;
        }
        return expr;
    }
    m = new RegExp("^" + CN_NUM_PATTERN + "月$").exec(s);
    if (m !== null) {
        const mo = cnNumToInt(m[1]);
        if (1 <= mo && mo <= 12) {
            return CN_MONTH_SHORT[mo - 1];
        }
        return expr;
    }
    return expr;
}
