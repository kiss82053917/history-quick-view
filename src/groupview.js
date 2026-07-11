"use strict";
/*
 * 新管线：客户端缓存 + 模糊搜索平铺视图（分组视图见 renderGroups）。
 * 渲染进 #g_container，与原 #m_container 互斥显示（切换逻辑在 main.js updateResultsView）。
 */

const HistoryCache = {
    /**@type{Array<chrome.history.HistoryItem>|null}*/
    items: null,
    /**@type{Promise<Array<chrome.history.HistoryItem>>|null}*/
    loading: null,
    MAX: 20000,
    getAll() {
        if (HistoryCache.items !== null) {
            return Promise.resolve(HistoryCache.items);
        }
        if (HistoryCache.loading === null) {
            HistoryCache.loading = chrome.history.search({
                text: "",
                startTime: 0,
                endTime: Date.now() + DAY,
                maxResults: HistoryCache.MAX,
            }).then(function (items) {
                HistoryCache.items = items;
                HistoryCache.loading = null;
                return items;
            });
        }
        return HistoryCache.loading;
    },
    invalidate() {
        HistoryCache.items = null;
    },
};

const HGroupView = {
    CONTAINER: (function () {
        const el = document.getElementById("g_container");
        if (el === null) {
            throw Error("ERROR: #g_container does not exist");
        }
        return el;
    }()),
    MAX_RESULTS: 500,
    renderSeq: 0,
    /**@type{Array<chrome.history.HistoryItem>}*/
    lastResults: [],
    /**
     * hostname 后缀匹配 site 过滤值
     * @type{(url: string, site: string) => boolean}*/
    matchSite(url, site) {
        let host = "";
        try {
            host = new URL(url).hostname.toLowerCase();
        } catch {
            return false;
        }
        return host === site || host.endsWith("." + site);
    },
    /**@type{(rawQuery: string, view: string) => undefined}*/
    render(rawQuery, view) {
        const seq = HGroupView.renderSeq += 1;
        const q = parseQuery(rawQuery);
        HHeader.LOADING.removeAttribute("data-css-hidden");
        HistoryCache.getAll().then(function (items) {
            if (seq !== HGroupView.renderSeq) {
                return; //已被更新的渲染取代
            }
            let filtered = items;
            if (q.site !== null) {
                filtered = filtered.filter(function (it) {
                    return HGroupView.matchSite(it.url, q.site);
                });
            }
            if (view === VIEW_SITE) {
                HGroupView.renderGroups(filtered, q.terms);
            } else {
                HGroupView.renderFlat(filtered, q.terms);
            }
            HHeader.LOADING.setAttribute("data-css-hidden", "");
        }).catch(function (e) {
            console.error(e);
            HError.set(chrome.i18n.getMessage("errFetchAll"));
        });
    },
    /**@type{(items: Array<chrome.history.HistoryItem>, terms: string) => undefined}*/
    renderFlat(items, terms) {
        let results;
        if (terms.length === 0) {
            results = items.slice(0, HGroupView.MAX_RESULTS);
        } else {
            results = [];
            for (const it of items) {
                const s = fuzzyMatch(terms, it);
                if (s >= 0) {
                    results.push({it, s});
                }
            }
            results.sort(function (a, b) {
                return b.s - a.s || b.it.lastVisitTime - a.it.lastVisitTime;
            });
            results = results.slice(0, HGroupView.MAX_RESULTS).map(function (r) {
                return r.it;
            });
        }
        HGroupView.lastResults = results;
        const frag = HRange.TEMPLATE_SEARCH.cloneNode(true);
        const section = frag.firstElementChild;
        section.querySelector(".title").insertAdjacentText(
            "beforeend",
            chrome.i18n.getMessage("searchResults", [String(results.length)])
        );
        if (results.length > 0) {
            section.appendChild(HGroupView.makeExportBtn());
        }
        for (const it of results) {
            section.appendChild(
                HItem.create(it.url, it.title, it.id, it.lastVisitTime)
            );
        }
        HGroupView.CONTAINER.replaceChildren(frag);
    },
    GROUP_TEMPLATE: (function () {
        const template = document.getElementById("template_group");
        if (template === null) {
            throw Error("ERROR: #template_group does not exist");
        }
        return template.content;
    }()),
    /**@type{(items: Array<chrome.history.HistoryItem>, terms: string) => undefined}*/
    renderGroups(items, terms) {
        let pool = items;
        if (terms.length !== 0) {
            pool = items.filter(function (it) {
                return fuzzyMatch(terms, it) >= 0;
            });
        }
        /**@type{Map<string, Array<chrome.history.HistoryItem>>}*/
        const groups = new Map();
        for (const it of pool) {
            let host;
            try {
                host = new URL(it.url).hostname.toLowerCase();
            } catch {
                host = "";
            }
            if (host === "") {
                host = chrome.i18n.getMessage("otherSites");
            }
            const arr = groups.get(host);
            if (arr === undefined) {
                groups.set(host, [it]);
            } else {
                arr.push(it);
            }
        }
        const sorted = [...groups.entries()].sort(function (a, b) {
            return b[1][0].lastVisitTime - a[1][0].lastVisitTime;
        });
        HGroupView.lastResults = sorted.flatMap(function (entry) { return entry[1]; });
        const frag = document.createDocumentFragment();
        for (const entry of sorted) {
            const host = entry[0];
            const arr = entry[1];
            const g = HGroupView.GROUP_TEMPLATE.cloneNode(true);
            const details = g.firstElementChild;
            details.querySelector('[name="img"]').setAttribute("src", getFavicon(arr[0].url));
            details.querySelector('[name="gtitle"]').insertAdjacentText("beforeend", host);
            details.querySelector('[name="gcount"]').insertAdjacentText("beforeend", String(arr.length));
            //懒渲染：展开时才填条目
            details.addEventListener("toggle", function () {
                if (details.open && details.filled !== true) {
                    details.filled = true;
                    const itemsDiv = details.querySelector('[name="items"]');
                    for (const it of arr) {
                        itemsDiv.appendChild(
                            HItem.create(it.url, it.title, it.id, it.lastVisitTime)
                        );
                    }
                }
            }, false);
            frag.appendChild(g);
        }
        HGroupView.CONTAINER.replaceChildren(frag);
    },
    makeExportBtn() {
        const btn = document.createElement("button");
        btn.className = "shell export-btn";
        btn.type = "button";
        btn.title = chrome.i18n.getMessage("exportTitle");
        btn.setAttribute("data-export", "");
        btn.innerHTML = '<svg class="icon icon-download" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>';
        return btn;
    },
    /**@type{(kind: "csv"|"json") => undefined}*/
    exportResults(kind) {
        const items = HGroupView.lastResults;
        if (items.length === 0) {
            return;
        }
        const rows = items.map(function (it) {
            let host = "";
            try {
                host = new URL(it.url).hostname.toLowerCase();
            } catch { /* 保持空串 */ }
            return {
                title: it.title ?? "",
                host,
                url: it.url,
                lastVisit: new Date(it.lastVisitTime).toLocaleString(),
            };
        });
        const name = exportFilename("history-search", kind, Date.now());
        if (kind === "csv") {
            const cols = [
                {key: "title", header: chrome.i18n.getMessage("exportColTitle")},
                {key: "host", header: chrome.i18n.getMessage("exportColHost")},
                {key: "url", header: chrome.i18n.getMessage("exportColUrl")},
                {key: "lastVisit", header: chrome.i18n.getMessage("exportColLastVisit")},
            ];
            downloadText(name, "text/csv;charset=utf-8", toCSV(rows, cols));
        } else {
            downloadText(name, "application/json", toJSON(rows));
        }
    },
    /**@type{(e: MouseEvent) => undefined}*/
    onclick(e) {
        const target = e.target;
        if (target.closest("[data-export]") !== null) {
            e.preventDefault();
            //确定=CSV，取消=JSON（tooltip 已说明；轻量交互）
            const csv = window.confirm(chrome.i18n.getMessage("exportChoose"));
            HGroupView.exportResults(csv ? "csv" : "json");
            return;
        }
        const type = target.getAttribute("data-type");
        if (type === "remove") {
            e.preventDefault();
            const DOMItem = target.parentElement;
            const url = DOMItem.getAttribute("href");
            try {
                chrome.history.deleteUrl({url}, undefined);
            } catch (err) {
                console.error(err.message);
            }
            HistoryCache.invalidate();
            DOMItem.remove();
        } else if (type === "item") {
            if (!e.shiftKey) {
                e.preventDefault();
                TabsProperties.url = target.href;
                HItem.open(TabsProperties, storage.open, e.ctrlKey);
            }
        }
    },
    /**@type{(e: KeyboardEvent) => undefined}*/
    onkeyup(e) {
        if (e.code === KEYBOARD_CODE_REMOVE) {
            const target = e.target;
            if (target.getAttribute("data-type") === "item") {
                const next = target.nextElementSibling ?? target.previousElementSibling;
                const url = target.getAttribute("href");
                try {
                    chrome.history.deleteUrl({url}, undefined);
                } catch (err) {
                    console.error(err.message);
                }
                HistoryCache.invalidate();
                target.remove();
                next?.focus?.();
            }
        }
    },
};

HGroupView.CONTAINER.addEventListener("click", HGroupView.onclick, false);
HGroupView.CONTAINER.addEventListener("keyup", HGroupView.onkeyup, false);
