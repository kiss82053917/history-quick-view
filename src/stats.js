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

// ---------- 图表公共 ----------
const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) {
        el.setAttribute(k, attrs[k]);
    }
    return el;
}
function faviconUrl(src) {
    return chrome.runtime.getURL("/_favicon/") + "?pageUrl=" + src + "&size=16";
}
const Tooltip = {
    EL: document.getElementById("s_tooltip"),
    show(text, x, y) {
        Tooltip.EL.textContent = text;
        Tooltip.EL.removeAttribute("data-css-hidden");
        const w = Tooltip.EL.offsetWidth;
        Tooltip.EL.style.left = Math.min(x + 12, window.innerWidth - w - 8) + "px";
        Tooltip.EL.style.top = (y + 14) + "px";
    },
    hide() {
        Tooltip.EL.setAttribute("data-css-hidden", "");
    },
};
function visitsText(n) {
    return chrome.i18n.getMessage("statsVisitsUnit", [String(n)]);
}
function fillTable(section, headKeys, rows) {
    const table = section.querySelector(".chart-table table");
    table.replaceChildren();
    const tr = document.createElement("tr");
    for (const k of headKeys) {
        const th = document.createElement("th");
        th.textContent = chrome.i18n.getMessage(k);
        tr.appendChild(th);
    }
    table.appendChild(tr);
    for (const row of rows) {
        const trd = document.createElement("tr");
        for (const cell of row) {
            const td = document.createElement("td");
            td.textContent = String(cell);
            trd.appendChild(td);
        }
        table.appendChild(trd);
    }
}

// ---------- Top 榜（HTML 比例条） ----------
/**@type{(agg: ReturnType<typeof aggregate>) => undefined}*/
function renderTop(agg) {
    const body = document.querySelector("#chart_top .chart-body");
    body.replaceChildren();
    const max = agg.topSites.length > 0 ? agg.topSites[0].count : 1;
    for (const s of agg.topSites) {
        const row = document.createElement("div");
        row.className = "toprow";
        row.title = s.host;
        const img = document.createElement("img");
        img.src = faviconUrl(s.sampleUrl);
        img.alt = "";
        const host = document.createElement("p");
        host.className = "host";
        host.textContent = s.host;
        const track = document.createElement("div");
        track.className = "bar-track";
        const bar = document.createElement("div");
        bar.className = "bar";
        bar.style.width = Math.max(2, Math.round(s.count / max * 100)) + "%";
        track.appendChild(bar);
        const count = document.createElement("p");
        count.className = "count";
        count.textContent = s.count.toLocaleString();
        row.append(img, host, track, count);
        row.addEventListener("click", function () {
            chrome.tabs.create({url: s.sampleUrl, active: true}, undefined);
        });
        body.appendChild(row);
    }
    fillTable(
        document.getElementById("chart_top"),
        ["statsColSite", "statsColCount"],
        agg.topSites.map(function (s) { return [s.host, s.count]; })
    );
}

// ---------- 24 小时柱状（SVG） ----------
/**@type{(agg: ReturnType<typeof aggregate>) => undefined}*/
function renderHour(agg) {
    const body = document.querySelector("#chart_hour .chart-body");
    body.replaceChildren();
    const W = 720, H = 200, L = 32, R = 712, T = 8, B = 168;
    const svg = svgEl("svg", {viewBox: `0 0 ${W} ${H}`});
    const max = Math.max(1, ...agg.byHour);
    const yMax = Math.ceil(max / 4) * 4; //取整刻度
    for (let g = 0; g <= 2; g += 1) {
        const val = Math.round(yMax * g / 2);
        const y = B - (B - T) * g / 2;
        svg.appendChild(svgEl("line", {
            x1: L, x2: R, y1: y, y2: y,
            stroke: "var(--color-border)", "stroke-width": 1,
        }));
        const t = svgEl("text", {x: L - 6, y: y + 4, "text-anchor": "end"});
        t.textContent = String(val);
        svg.appendChild(t);
    }
    const slot = (R - L) / 24;
    const bw = Math.min(24, slot - 2);
    const peak = agg.byHour.indexOf(Math.max(...agg.byHour));
    for (let h = 0; h < 24; h += 1) {
        const v = agg.byHour[h];
        const bh = Math.round((B - T) * v / yMax);
        const x = L + h * slot + (slot - bw) / 2;
        const y = B - bh;
        const r = Math.min(4, bh); //数据端圆角、基线直角
        const bar = svgEl("path", {
            d: `M${x},${B} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + bw - r},${y} Q${x + bw},${y} ${x + bw},${y + r} L${x + bw},${B} Z`,
            fill: "var(--chart-color)",
        });
        bar.addEventListener("mousemove", function (e) {
            Tooltip.show(`${h}:00 – ${visitsText(v)}`, e.clientX, e.clientY);
        });
        bar.addEventListener("mouseleave", Tooltip.hide);
        svg.appendChild(bar);
        if (h === peak && v > 0) {
            const t = svgEl("text", {x: x + bw / 2, y: y - 5, "text-anchor": "middle"});
            t.textContent = String(v);
            svg.appendChild(t);
        }
        if (h % 6 === 0 || h === 23) {
            const t = svgEl("text", {x: x + bw / 2, y: B + 16, "text-anchor": "middle"});
            t.textContent = String(h);
            svg.appendChild(t);
        }
    }
    body.appendChild(svg);
    fillTable(
        document.getElementById("chart_hour"),
        ["statsColHour", "statsColCount"],
        agg.byHour.map(function (v, h) { return [`${h}:00`, v]; })
    );
}

// ---------- 每日趋势（SVG 折线+面积渍） ----------
/**@type{(agg: ReturnType<typeof aggregate>) => undefined}*/
function renderDay(agg) {
    const body = document.querySelector("#chart_day .chart-body");
    body.replaceChildren();
    const W = 720, H = 220, L = 32, R = 712, T = 8, B = 184;
    const svg = svgEl("svg", {viewBox: `0 0 ${W} ${H}`});
    const days = agg.byDay;
    const max = Math.max(1, ...days.map(function (d) { return d.count; }));
    const yMax = Math.ceil(max / 4) * 4;
    for (let g = 0; g <= 2; g += 1) {
        const y = B - (B - T) * g / 2;
        svg.appendChild(svgEl("line", {
            x1: L, x2: R, y1: y, y2: y,
            stroke: "var(--color-border)", "stroke-width": 1,
        }));
        const t = svgEl("text", {x: L - 6, y: y + 4, "text-anchor": "end"});
        t.textContent = String(Math.round(yMax * g / 2));
        svg.appendChild(t);
    }
    const px = function (i) {
        return days.length === 1 ? (L + R) / 2 : L + (R - L) * i / (days.length - 1);
    };
    const py = function (v) { return B - (B - T) * v / yMax; };
    const fmtDate = new Intl.DateTimeFormat(undefined, {month: "numeric", day: "numeric"});
    let line = "";
    for (let i = 0; i < days.length; i += 1) {
        line += (i === 0 ? "M" : "L") + px(i) + "," + py(days[i].count);
    }
    svg.appendChild(svgEl("path", {
        d: line + `L${px(days.length - 1)},${B} L${px(0)},${B} Z`,
        fill: "var(--chart-color)", opacity: 0.1, stroke: "none",
    }));
    svg.appendChild(svgEl("path", {
        d: line, fill: "none", stroke: "var(--chart-color)",
        "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
    const last = days.length - 1;
    svg.appendChild(svgEl("circle", {
        cx: px(last), cy: py(days[last].count), r: 4,
        fill: "var(--chart-color)", stroke: "var(--color-bg)", "stroke-width": 2,
    }));
    const step = Math.max(1, Math.round(days.length / 6));
    for (let i = 0; i < days.length; i += step) {
        const t = svgEl("text", {x: px(i), y: B + 16, "text-anchor": "middle"});
        t.textContent = fmtDate.format(days[i].dayStart);
        svg.appendChild(t);
    }
    const cross = svgEl("line", {
        x1: 0, x2: 0, y1: T, y2: B,
        stroke: "var(--color-border)", "stroke-width": 1, visibility: "hidden",
    });
    svg.appendChild(cross);
    svg.addEventListener("mousemove", function (e) {
        const rect = svg.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * W / rect.width;
        const i = Math.max(0, Math.min(days.length - 1,
            Math.round((mx - L) / ((R - L) / Math.max(1, days.length - 1)))));
        cross.setAttribute("x1", px(i));
        cross.setAttribute("x2", px(i));
        cross.setAttribute("visibility", "visible");
        Tooltip.show(`${fmtDate.format(days[i].dayStart)} – ${visitsText(days[i].count)}`, e.clientX, e.clientY);
    });
    svg.addEventListener("mouseleave", function () {
        cross.setAttribute("visibility", "hidden");
        Tooltip.hide();
    });
    body.appendChild(svg);
    fillTable(
        document.getElementById("chart_day"),
        ["statsColDate", "statsColCount"],
        days.map(function (d) { return [fmtDate.format(d.dayStart), d.count]; })
    );
}

// ---------- 导出（访问明细） ----------
/**@type{() => Array<object>} 按当前窗口过滤 visits，映射导出列*/
S.exportedRows = function () {
    const windowStart = new Date(S.data.now);
    windowStart.setHours(0, 0, 0, 0);
    const start = windowStart.getTime() - (S.range - 1) * STATS_DAY;
    const rows = [];
    for (const v of S.data.visits) {
        if (v.time >= start && v.time <= S.data.now) {
            rows.push({
                time: new Date(v.time).toLocaleString(),
                host: v.host,
                title: v.title ?? "",
                url: v.url,
            });
        }
    }
    rows.sort(function (a, b) { return a.time < b.time ? 1 : -1; });
    return rows;
};

const STATS_EXPORT_COLUMNS = [
    {key: "time", headerKey: "exportColTime"},
    {key: "host", headerKey: "exportColHost"},
    {key: "title", headerKey: "exportColTitle"},
    {key: "url", headerKey: "exportColUrl"},
];

/**@type{(kind: "csv"|"json") => undefined}*/
S.doExport = function (kind) {
    if (S.data === null) {
        return;
    }
    const rows = S.exportedRows();
    if (rows.length === 0) {
        return;
    }
    const name = exportFilename("history-" + S.range + "d", kind, Date.now());
    if (kind === "csv") {
        const cols = STATS_EXPORT_COLUMNS.map(function (c) {
            return {key: c.key, header: chrome.i18n.getMessage(c.headerKey)};
        });
        downloadText(name, "text/csv;charset=utf-8", toCSV(rows, cols));
    } else {
        downloadText(name, "application/json", toJSON(rows));
    }
};

document.getElementById("exp_csv").addEventListener("click", function () { S.doExport("csv"); });
document.getElementById("exp_json").addEventListener("click", function () { S.doExport("json"); });
