"use strict";
/*
 * 启动时把 data-i18n* 标注的元素文案替换为 chrome.i18n 消息。
 * getMessage 返回空串（key 缺失或消息为空）时保留 HTML 预置的原文案，
 * 因此界面永远不会出现空白文案。
 * <template> 的内容不在 document 查询范围内，需单独遍历 template.content。
 */
(function () {
    const RULES = [
        ["data-i18n", function (el, msg) { el.textContent = msg; }],
        ["data-i18n-title", function (el, msg) { el.setAttribute("title", msg); }],
        ["data-i18n-placeholder", function (el, msg) { el.setAttribute("placeholder", msg); }],
        ["data-i18n-arialabel", function (el, msg) { el.setAttribute("aria-label", msg); }],
    ];
    function apply(root) {
        for (const rule of RULES) {
            const attr = rule[0];
            const set = rule[1];
            const els = root.querySelectorAll("[" + attr + "]");
            for (const el of els) {
                const msg = chrome.i18n.getMessage(el.getAttribute(attr));
                if (msg !== "") {
                    set(el, msg);
                }
            }
        }
    }
    apply(document);
    const templates = document.querySelectorAll("template");
    for (const t of templates) {
        apply(t.content);
    }
    const name = chrome.i18n.getMessage("extName");
    if (name !== "") {
        document.title = name;
    }
    const locale = chrome.i18n.getMessage("@@ui_locale");
    if (locale !== "") {
        document.documentElement.lang = locale.replace("_", "-");
    }
}());
