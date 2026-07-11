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
