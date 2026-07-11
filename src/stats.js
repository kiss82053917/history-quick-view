"use strict";
/*
 * 统计页：主题初始化 + 90 天数据拉取（一次）+ 范围切换（内存重聚合）。
 * 三图渲染函数 renderTop/renderHour/renderDay 在文件后半，
 * S.rerender 按存在性调用。
 */

const S = {
    /**@type{{visits: Array<{url: string, host: string, time: number}>, capped: boolean, now: number}|null}*/
    data: null,
    range: 30,
    el(id) { return document.getElementById(id); },
    /**@type{(n: number) => string} 1284→1,284 / 12900→12.9K*/
    fmt(n) {
        if (n >= 10000) {
            return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
        }
        return n.toLocaleString();
    },
    setRangeButtons() {
        for (const b of document.querySelectorAll(".range button")) {
            if (Number(b.getAttribute("data-range")) === S.range) {
                b.setAttribute("data-active", "");
            } else {
                b.removeAttribute("data-active");
            }
        }
    },
    rerender() {
        const agg = aggregate(S.data.visits, S.range, S.data.now);
        S.el("v_total").textContent = S.fmt(agg.total);
        S.el("v_sites").textContent = S.fmt(agg.uniqueSites);
        if (agg.total === 0) {
            S.el("s_empty").removeAttribute("data-css-hidden");
            S.el("s_content").setAttribute("data-css-hidden", "");
            return;
        }
        S.el("s_empty").setAttribute("data-css-hidden", "");
        S.el("s_content").removeAttribute("data-css-hidden");
        if (typeof renderTop === "function") {
            renderTop(agg);
            renderHour(agg);
            renderDay(agg);
        }
    },
};

chrome.storage.local.get(undefined, function (items) {
    //主题与 popup 同一存储键；非法值回退深色
    const theme = (items.theme === "l" || items.theme === "a") ? items.theme : "d";
    document.documentElement.setAttribute("class", theme);
    const r = Number(items.statsRange);
    S.range = (r === 7 || r === 30 || r === 90) ? r : 30;
    S.setRangeButtons();

    fetchVisits(90).then(function (data) {
        S.data = data;
        S.el("s_loading").setAttribute("data-css-hidden", "");
        if (data.capped) {
            S.el("s_cap").removeAttribute("data-css-hidden");
        }
        S.rerender();
    }).catch(function (e) {
        console.error(e);
        S.el("s_loading").setAttribute("data-css-hidden", "");
        S.el("s_error").removeAttribute("data-css-hidden");
    });
});

document.querySelector(".range").addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-range]");
    if (btn === null || S.data === null) {
        return;
    }
    S.range = Number(btn.getAttribute("data-range"));
    S.setRangeButtons();
    chrome.storage.local.set({statsRange: S.range}, undefined);
    S.rerender();
});
