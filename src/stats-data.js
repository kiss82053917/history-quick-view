"use strict";
/*
 * 统计数据层：fetchVisits 拉真实访问时间点（分批 getVisits），
 * aggregate 纯函数聚合（Node 可单测，不碰 chrome API）。
 */

const STATS_DAY = 86400000;
const STATS_MAX_URLS = 20000;
const STATS_BATCH = 500;

/**@type{(t: number) => number} 本地自然日零点*/
function startOfLocalDay(t) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/**
 * @type{(
 *  visits: Array<{url: string, host: string, time: number}>,
 *  rangeDays: number,
 *  now: number
 * ) => {
 *  topSites: Array<{host: string, count: number, sampleUrl: string}>,
 *  byHour: Array<number>,
 *  byDay: Array<{dayStart: number, count: number}>,
 *  total: number,
 *  uniqueSites: number,
 * }}*/
function aggregate(visits, rangeDays, now) {
    const windowStart = startOfLocalDay(now) - (rangeDays - 1) * STATS_DAY;
    const byHour = new Array(24).fill(0);
    const byDay = [];
    for (let i = 0; i < rangeDays; i += 1) {
        byDay.push({dayStart: windowStart + i * STATS_DAY, count: 0});
    }
    /**@type{Map<string, {count: number, sampleUrl: string, lastTime: number}>}*/
    const hosts = new Map();
    let total = 0;
    for (const v of visits) {
        if (v.time < windowStart || v.time > now) {
            continue;
        }
        total += 1;
        const d = new Date(v.time);
        byHour[d.getHours()] += 1;
        const di = Math.floor((startOfLocalDay(v.time) - windowStart) / STATS_DAY);
        if (0 <= di && di < byDay.length) {
            byDay[di].count += 1;
        }
        if (v.host !== "") {
            const h = hosts.get(v.host);
            if (h === undefined) {
                hosts.set(v.host, {count: 1, sampleUrl: v.url, lastTime: v.time});
            } else {
                h.count += 1;
                if (v.time > h.lastTime) {
                    h.lastTime = v.time;
                    h.sampleUrl = v.url;
                }
            }
        }
    }
    const topSites = [...hosts.entries()]
        .sort(function (a, b) {
            return b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1);
        })
        .slice(0, 10)
        .map(function (e) {
            return {host: e[0], count: e[1].count, sampleUrl: e[1].sampleUrl};
        });
    return {topSites, byHour, byDay, total, uniqueSites: hosts.size};
}

/**@type{(days: number) => Promise<{visits: Array<{url: string, host: string, time: number}>, capped: boolean, now: number}>}*/
async function fetchVisits(days) {
    const now = Date.now();
    const startTime = now - days * STATS_DAY;
    const items = await chrome.history.search({
        text: "",
        startTime,
        maxResults: STATS_MAX_URLS,
    });
    const capped = items.length >= STATS_MAX_URLS;
    const visits = [];
    for (let i = 0; i < items.length; i += STATS_BATCH) {
        const batch = items.slice(i, i + STATS_BATCH);
        await Promise.all(batch.map(async function (it) {
            let host = "";
            try {
                host = new URL(it.url).hostname.toLowerCase();
            } catch { /* host 留空串，聚合时不进榜 */ }
            try {
                const vs = await chrome.history.getVisits({url: it.url});
                for (const x of vs) {
                    if (x.visitTime >= startTime && x.visitTime <= now) {
                        visits.push({url: it.url, host, time: x.visitTime, title: it.title ?? ""});
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }));
    }
    return {visits, capped, now};
}
