/* OSCP Cheatsheet — getSH 風 UI（素の JS、外部通信なし、file:// で動く） */
(function () {
  "use strict";

  var D = window.CHEATSHEET_DATA;
  if (!D || !D.notes) {
    var showErr = function () {
      var c = document.getElementById("content");
      if (c) c.innerHTML = '<h1 class="page-title">data.js が読めません</h1><p class="page-desc">プロジェクトのディレクトリで <code>python3 build.py</code> を実行してから開いてください。</p>';
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showErr); else showErr();
    return;
  }
  var LS = { vars: "cs.vars.v1", recent: "cs.recent" };

  // ------------------------------------------------------------ 小道具
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function enc(s) { return encodeURIComponent(s); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode など */ } }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "text") e.textContent = v;
        else if (k === "html") e.innerHTML = v;
        else if (k === "class") e.className = v;
        else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
        else if (k === "dataset") Object.keys(v).forEach(function (d) { e.dataset[d] = v[d]; });
        else e.setAttribute(k, v === true ? "" : v);
      });
    }
    (children || []).forEach(function (c) { if (c === null || c === undefined) return; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function chevSvg(cls) {
    var w = document.createElement("span");
    w.innerHTML = '<svg class="' + (cls || "chev") + '" viewBox="0 -960 960 960" aria-hidden="true" focusable="false" width="18" height="18"><path fill="currentColor" d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/></svg>';
    return w.firstChild;
  }
  function dotsEl() { return el("span", { class: "dots" }, [el("i"), el("i"), el("i")]); }
  var toastTimer = null;
  function toast(msg, warn) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "toast" + (warn ? " warn" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, warn ? 3200 : 1600);
  }

  // ------------------------------------------------------------ データの索引
  var NOTES = D.notes;
  var CATS = D.categories || [];
  var CAT_BY_ID = {};
  CATS.forEach(function (c) { CAT_BY_ID[c.id] = c; });
  var NOTE_GROUP = {};   // note id → {cat, group}
  CATS.forEach(function (c) { c.groups.forEach(function (g) { g.notes.forEach(function (id) { NOTE_GROUP[id] = { cat: c, group: g }; }); }); });

  function noteHref(id, slug) { return "#/n/" + enc(id) + (slug ? "/" + enc(slug) : ""); }
  function catHref(id) { return "#/c/" + id; }
  function catSlug(c) { return (c.en || c.id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  // ------------------------------------------------------------ 変数
  var VARS = D.variables || [];
  var VKEYS = VARS.map(function (v) { return v.key; });
  var PRIMARY = ["ATTACKER_IP", "ATTACKER_PORT", "VICTIM_IP", "VICTIM_PORT", "DOMAIN", "USER"].filter(function (k) { return VKEYS.indexOf(k) >= 0; });
  function isObj(o) { return !!o && typeof o === "object" && !Array.isArray(o); }
  function lsArr(k) { var v = lsGet(k, []); return Array.isArray(v) ? v : []; }
  var V = lsGet(LS.vars, null);
  if (!isObj(V)) V = { values: {}, enabled: {}, extra: [], inlineApply: true };
  if (!isObj(V.values)) V.values = {};
  if (!isObj(V.enabled)) V.enabled = {};
  if (!Array.isArray(V.extra)) V.extra = [];
  if (V.inlineApply === undefined) V.inlineApply = true;
  VARS.forEach(function (v) {
    if (V.values[v.key] === undefined) V.values[v.key] = v["default"] || "";
    if (V.enabled[v.key] === undefined) V.enabled[v.key] = true;
  });
  var UI = { extraOpen: false };   // 「その他の変数」の開閉は保存しない（上部バーが膨らんだままにならないように）
  var UNDO = null;

  function varDef(key) { for (var i = 0; i < VARS.length; i++) if (VARS[i].key === key) return VARS[i]; return null; }
  function allKeys() { return VKEYS.concat(V.extra.filter(function (k) { return VKEYS.indexOf(k) < 0; })); }
  function deriveBaseDn(domain) { return domain.split(".").filter(Boolean).map(function (p) { return "DC=" + p; }).join(","); }
  function derivedValue(key) {
    var d = varDef(key);
    if (d && d.derive === "base_dn" && V.values.DOMAIN) return deriveBaseDn(V.values.DOMAIN.trim());
    return "";
  }
  function valueOf(key) { return (V.values[key] || "").trim() || derivedValue(key); }
  function isOn(key) { return V.enabled[key] !== false; }
  function active(key) { return !!valueOf(key) && isOn(key); }
  function saveVars() { lsSet(LS.vars, V); }
  function labelOf(key) { return key.replace(/_/g, " "); }

  function substitute(text) {
    return text.replace(/<([A-Z][A-Z0-9_]*)>/g, function (m, k) { return active(k) ? valueOf(k) : m; });
  }
  function unfilled(text) {
    var out = [];
    text.replace(/<([A-Z][A-Z0-9_]*)>/g, function (m, k) { if (!active(k) && out.indexOf(k) < 0) out.push(k); return m; });
    return out;
  }
  function phHtml(text) {
    return esc(text).replace(/&lt;([A-Z][A-Z0-9_]*)&gt;/g, function (m, k) { return '<span class="ph" data-ph="' + k + '">&lt;' + k + '&gt;</span>'; });
  }
  // キャプション（# コメント）: プレースホルダ + [[wikilink]] + `code`
  function captionHtml(text) {
    var h = phHtml(text);
    h = h.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, function (m, note, alias) {
      var id = note.trim();
      var label = alias ? alias.trim() : id;
      if (NOTES[id]) return '<a href="' + noteHref(id) + '">' + esc(label) + "</a>";
      return esc(label);
    });
    h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
    return h;
  }

  function applyVars(root) {
    $$(".ph", root || document).forEach(function (s) {
      var k = s.dataset.ph;
      var inlineOff = !V.inlineApply && s.closest(".note-body") && s.closest("code") && !s.closest("pre");
      if (active(k) && !inlineOff) {
        s.textContent = valueOf(k);
        s.className = "ph ph-set";
        s.title = "<" + k + ">";
      } else {
        s.textContent = "<" + k + ">";
        s.className = "ph ph-unset";
        var d = varDef(k);
        s.title = d ? d.label : k + "（上の「その他の変数」から追加できる）";
      }
    });
    syncVarCards();
  }

  function varCard(key, removable) {
    var d = varDef(key) || { key: key, label: key, example: "" };
    var card = el("div", { class: "var", dataset: { key: key } });
    var apply = el("input", { type: "checkbox", title: key + " を反映する" });
    apply.checked = isOn(key);
    apply.addEventListener("change", function () { V.enabled[key] = apply.checked; saveVars(); applyVars(); });
    var top = el("div", { class: "var-top" }, [
      el("span", { class: "var-key", text: labelOf(key), title: d.label || key }),
      el("label", { class: "var-apply" }, [apply, "反映"]),
    ]);
    var inp = el("input", { type: "text", placeholder: d.example || "", autocomplete: "off", spellcheck: "false", "aria-label": d.label || key });
    inp.value = V.values[key] || "";
    inp.addEventListener("input", function () { V.values[key] = inp.value; saveVars(); applyVars(); });
    var row = el("div", { class: "var-row" }, [inp]);
    if (removable) {
      row.appendChild(el("button", { class: "rm", type: "button", title: "この変数を外す", text: "×", onclick: function () {
        V.extra = V.extra.filter(function (x) { return x !== key; }); delete V.values[key]; saveVars(); renderVars(); applyVars();
      } }));
    }
    card.appendChild(top); card.appendChild(row);
    return card;
  }

  function renderVars() {
    var main = $("#vars"), extra = $("#vars-extra");
    main.textContent = ""; extra.textContent = "";
    PRIMARY.forEach(function (k) { main.appendChild(varCard(k, false)); });
    VKEYS.filter(function (k) { return PRIMARY.indexOf(k) < 0; }).forEach(function (k) { extra.appendChild(varCard(k, false)); });
    V.extra.forEach(function (k) { if (VKEYS.indexOf(k) < 0) extra.appendChild(varCard(k, true)); });
    // 追加・インライン反映
    var tools = el("div", { class: "vars-extra-tools" });
    var sel = el("select", { title: "ノートに現れる <X> を入力欄に追加する" });
    sel.appendChild(el("option", { value: "", text: "変数を追加…" }));
    var present = allKeys();
    Object.keys(D.placeholders || {}).forEach(function (k) {
      if (present.indexOf(k) >= 0) return;
      sel.appendChild(el("option", { value: k, text: k + "  (" + D.placeholders[k] + ")" }));
    });
    sel.addEventListener("change", function () {
      if (!sel.value) return;
      if (V.extra.indexOf(sel.value) < 0) V.extra.push(sel.value);
      saveVars(); renderVars(); applyVars();
      var card = $('.var[data-key="' + sel.value + '"] input[type=text]');
      if (card) card.focus();
    });
    var inl = el("input", { type: "checkbox" });
    inl.checked = !!V.inlineApply;
    inl.addEventListener("change", function () { V.inlineApply = inl.checked; saveVars(); applyVars(); });
    tools.appendChild(sel);
    tools.appendChild(el("label", { title: "OFF にすると詳細の本文中のインラインコードは置換しない" }, [inl, "本文のインラインコードにも反映"]));
    extra.appendChild(tools);
    extra.hidden = !UI.extraOpen;
    $("#vars-more").setAttribute("aria-expanded", UI.extraOpen ? "true" : "false");
    $("#vars-more").textContent = UI.extraOpen ? "その他の変数 ▴" : "その他の変数 ▾";
    syncVarCards();
  }

  function syncVarCards() {
    var filled = 0, total = 0;
    $$(".var").forEach(function (card) {
      var k = card.dataset.key;
      var raw = (V.values[k] || "").trim();
      var d = varDef(k);
      var isDefault = d && d["default"] && raw === d["default"];
      card.classList.toggle("filled", !!raw && !isDefault);
      card.classList.toggle("derived", !raw && !!derivedValue(k));
      card.classList.toggle("off", !isOn(k));
      var inp = $("input[type=text]", card);
      if (inp && !raw && derivedValue(k)) inp.placeholder = derivedValue(k);
      else if (inp && d) inp.placeholder = d.example || "";
      if (VKEYS.indexOf(k) >= 0) { total++; if (raw && !isDefault) filled++; }
    });
    var tg = $("#vars-toggle");
    if (tg) { tg.textContent = "変数 " + filled + "/" + total; tg.title = filled + "/" + total + " 入力済み"; }
    var sm = $("#vars-summary");
    if (sm) {
      var parts = allKeys().filter(function (k) { return active(k) && !(varDef(k) && varDef(k)["default"] === valueOf(k)); }).map(function (k) { return k + "=" + valueOf(k); });
      sm.textContent = parts.length ? parts.join(" · ") : "変数を入力する…";
      sm.title = "クリックで変数欄を開く";
    }
  }

  // ------------------------------------------------------------ コピー
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext !== false) {
      return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return copyFallback(t); });
    }
    return Promise.resolve(copyFallback(t));
  }
  function copyFallback(t) {
    try {
      var ta = document.createElement("textarea");
      ta.value = t; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  function copyCmd(rawText, btn) {
    var out = substitute(rawText).replace(/\s+$/, "");
    copyText(out).then(function (ok) {
      var miss = unfilled(rawText);
      if (!ok) toast("コピーできませんでした", true);
      else if (miss.length) toast("コピーしました（未入力: " + miss.join(", ") + "）", true);
      else toast("コピーしました");
      if (btn) { var old = btn.textContent; btn.textContent = ok ? (old === "Copy" ? "Copied" : "コピー済み") : (old === "Copy" ? "Error" : "失敗"); setTimeout(function () { btn.textContent = old; }, 1200); }
    });
  }

  // ------------------------------------------------------------ ターミナル部品
  function promptFor(lang) {
    if (/^(powershell|ps1|pwsh)$/.test(lang)) return "PS>";
    if (/^(cmd|bat|batch|dos)$/.test(lang)) return "C:\\>";
    if (/sql/.test(lang)) return "SQL>";
    if (lang === "python" || lang === "py") return ">>>";
    if (lang === "cypher") return "neo4j>";
    return "$";
  }
  var SHELL_LANGS = /^(bash|sh|zsh|shell|console|powershell|ps1|pwsh|cmd|bat|batch|dos|sql|mysql|psql|tsql|cypher)$/;
  function cmdHtml(c) {
    var h = phHtml(c.text);
    var rx = null;
    if (/^(bash|sh|zsh|shell|console|powershell|ps1|pwsh|python|py)$/.test(c.lang)) rx = /^(\s*#(?!!).*)$/gm;
    else if (/^(cmd|bat|batch|dos)$/.test(c.lang)) rx = /^(\s*(?:::|[Rr][Ee][Mm]\s).*)$/gm;
    else if (/sql/.test(c.lang)) rx = /^(\s*--.*)$/gm;
    return rx ? h.replace(rx, '<span class="c">$1</span>') : h;
  }
  function isFileContent(c) {
    if (c.text.indexOf("\n") < 0) return false;
    if (/^(#!|#include|<\?php|<!--|<script|import |using |package |function |def |class |\{|\[)/.test(c.text)) return true;
    return !SHELL_LANGS.test(c.lang);
  }
  function terminal(cmds, title) {
    var copyAll = el("button", { class: "t-copy", type: "button", text: "Copy", title: "このブロックのコマンドをすべてコピー" });
    copyAll.addEventListener("click", function () { copyCmd(cmds.map(function (c) { return c.text; }).join("\n"), copyAll); });
    var head = el("div", { class: "t-head" }, [dotsEl(), el("span", { class: "t-title", text: title || (D.meta.short || "oscp.sh") }), copyAll]);
    var body = el("div", { class: "t-body" });
    cmds.forEach(function (c) {
      if (c.caption) body.appendChild(el("div", { class: "t-cap", html: "# " + captionHtml(c.caption) }));
      var cp = el("button", { class: "cp", type: "button", title: "このコマンドをコピー", text: "⧉" });
      cp.addEventListener("click", function () { copyCmd(c.text); });
      var file = isFileContent(c);
      body.appendChild(el("div", { class: "t-line" + (file ? " t-file" : "") }, [
        el("span", { class: "prompt", text: file ? "" : promptFor(c.lang) }),
        el("code", { class: "cmd", html: cmdHtml(c) }),
        cp,
      ]));
    });
    return el("div", { class: "terminal" }, [head, body]);
  }

  // ------------------------------------------------------------ ルーティング
  function parseHash() {
    var h = location.hash || "#/";
    var parts = h.replace(/^#\/?/, "").split("/");
    var kind = parts[0] || "";
    if (!kind) return { kind: "home" };
    if (kind === "n") return { kind: "note", id: safeDecode(parts[1] || ""), slug: safeDecode(parts.slice(2).join("/")) };
    if (kind === "c") return { kind: "cat", id: parts[1] || "" };
    if (kind === "ext") return { kind: "ext" };
    return { kind: "home" };
  }
  function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  var CUR = { noteId: null, catId: null };

  function route() {
    var r = parseHash();
    closeSidebar(); closePalette();
    var main = $("#content");
    main.textContent = "";
    $("#topbar").classList.remove("pinned");
    window.scrollTo(0, 0);
    if (r.kind === "home") renderHome(main);
    else if (r.kind === "note") {
      var n = NOTES[r.id];
      if (!n) { renderNotFound(main, r.id); }
      else renderCategory(main, (NOTE_GROUP[n.id] || {}).cat || CATS[0], n.id, r.slug);
    }
    else if (r.kind === "cat") {
      var c = CAT_BY_ID[r.id];
      if (!c) { renderNotFound(main, r.id); }
      else {
        var first = (c.first && NOTES[c.first]) ? c.first : (c.groups.length && c.groups[0].notes.length ? c.groups[0].notes[0] : null);
        renderCategory(main, c, first, "");
      }
    }
    else if (r.kind === "ext") renderExt(main);
    else renderHome(main);
    setNavActive();
    applyVars(main);
  }

  function setWorkspace(path) { $("#ws-value").textContent = path; }

  // ------------------------------------------------------------ 左ナビ
  function renderNav() {
    var nav = $("#nav");
    nav.textContent = "";
    nav.appendChild(el("a", { href: "#/", dataset: { nav: "home" } }, [el("span", { class: "chev", text: "›" }), "ホーム"]));
    CATS.forEach(function (c) {
      nav.appendChild(el("a", { href: catHref(c.id), dataset: { nav: c.id }, title: c.desc }, [
        el("span", { class: "chev", text: "›" }), c.title, el("span", { class: "cnt", text: String(c.count) }),
      ]));
    });
    if (D.external && D.external.length) nav.appendChild(el("a", { href: "#/ext", class: "nav-ext", dataset: { nav: "ext" } }, [el("span", { class: "chev", text: "↗" }), "外部リファレンス"]));
    $("#side-meta").textContent = D.meta.note_count + " notes"; $("#side-meta").title = "最終ビルド " + (D.meta.built_at || "");
    $("#brand-name").textContent = D.meta.short || "oscp.sh";
    $("#foot-left").textContent = (D.meta.short || "oscp.sh").toUpperCase();
  }
  function setNavActive() {
    var key = CUR.catId || "";
    $$("#nav a").forEach(function (a) { a.classList.toggle("active", a.dataset.nav === key); });
  }
  function openSidebar() { $("#sidebar").classList.add("open"); $("#backdrop").hidden = false; $("#menu-btn").setAttribute("aria-expanded", "true"); }
  function closeSidebar() { $("#sidebar").classList.remove("open"); $("#backdrop").hidden = true; $("#menu-btn").setAttribute("aria-expanded", "false"); }

  // ------------------------------------------------------------ ホーム
  function pathEl(parts) {
    var p = el("div", { class: "path" }, [el("span", { class: "tilde", text: "~" }), "/" + (D.meta.short || "oscp.sh")]);
    parts.forEach(function (x) { p.appendChild(document.createTextNode("/")); p.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
    return p;
  }
  function renderHome(main) {
    CUR.noteId = null; CUR.catId = "home";
    document.title = D.meta.title;
    setWorkspace("/");
    var short = D.meta.short || "oscp.sh";
    var dot = short.indexOf(".");
    var h1 = el("h1", {}, dot > 0 ? [short.slice(0, dot), el("span", { text: short.slice(dot) })] : [short]);
    var cmdCount = 0;
    Object.keys(NOTES).forEach(function (id) { cmdCount += (NOTES[id].commands || []).length; });
    var adCat = CAT_BY_ID.ad, scanCat = CAT_BY_ID.scan;

    var heroTerm = el("div", { class: "terminal" }, [
      el("div", { class: "t-head" }, [dotsEl(), el("span", { class: "t-title", text: short })]),
      el("div", { class: "t-body" }, [
        el("span", { class: "m-line cmdline" }, [el("span", { class: "prompt", text: "$" }), "./" + short + " --objective"]),
        el("span", { class: "m-line" }, [el("span", { class: "i", text: "[+]" }), "足場を取る"]),
        el("span", { class: "m-line" }, [el("span", { class: "i", text: "[+]" }), "シェルを取る"]),
        el("span", { class: "m-line hi" }, [el("span", { class: "i", text: "[+]" }), "root を取る"]),
      ]),
    ]);
    main.appendChild(pathEl([]));
    main.appendChild(el("section", { class: "hero" }, [
      el("div", {}, [
        h1,
        el("p", { class: "tag", text: D.meta.tagline || "列挙から root まで。" }),
        el("p", { class: "sub", text: D.meta.subtitle || "" }),
        el("div", { class: "hero-actions" }, [
          adCat ? el("a", { class: "btn primary", href: catHref("ad"), text: "AD から始める" }) : null,
          scanCat ? el("a", { class: "btn", href: catHref("scan"), text: "スキャンの流れ" }) : null,
        ]),
      ]),
      heroTerm,
    ]));

    main.appendChild(el("div", { class: "kicker", text: "// OVERVIEW" }));
    main.appendChild(el("h2", { class: "sec", text: "これは何？" }));
    main.appendChild(el("p", { class: "page-desc", text: "Obsidian のチートシートをそのまま引けるようにしたもの。上の欄を埋めると、すべてのコマンドにその値が入る。" }));
    main.appendChild(el("div", { class: "stats" }, [
      el("div", { class: "stat" }, [el("b", { text: String(D.meta.note_count) }), el("span", { text: "ノート" })]),
      el("div", { class: "stat" }, [el("b", { text: String(cmdCount) }), el("span", { text: "コマンド" })]),
      el("div", { class: "stat" }, [el("b", { text: String(CATS.length) }), el("span", { text: "カテゴリ" })]),
      el("div", { class: "stat" }, [el("b", { text: String(CAT_BY_ID.cve ? CAT_BY_ID.cve.count : VARS.length) }), el("span", { text: CAT_BY_ID.cve ? "CVE" : "変数" })]),
    ]));

    var recent = lsArr(LS.recent).filter(function (id) { return NOTES[id]; });
    if (recent.length) {
      main.appendChild(el("div", { class: "kicker", text: "// RECENT" }));
      main.appendChild(el("h2", { class: "sec", text: "最近見たノート" }));
      main.appendChild(el("div", { class: "recent" }, recent.map(function (id) { return el("a", { href: noteHref(id), text: id }); })));
    }

    main.appendChild(el("div", { class: "kicker", text: "// KNOWLEDGE BASE" }));
    main.appendChild(el("h2", { class: "sec", text: "道筋を作る" }));
    main.appendChild(el("div", { class: "cards" }, CATS.map(function (c) {
      return el("a", { class: "card", href: catHref(c.id) }, [
        el("div", { class: "ic", text: c.icon || "›" }),
        el("h3", { text: c.title }),
        el("p", { text: c.desc }),
        el("span", { class: "cnt", text: c.count + " NOTES" }),
      ]);
    })));

    var pb = CAT_BY_ID.playbook;
    if (pb) {
      var lines = [el("span", { class: "m-line cmdline" }, [el("span", { class: "prompt", text: "$" }), "./" + short + " --methodology"])];
      var ids = [];
      pb.groups.forEach(function (g) { ids = ids.concat(g.notes); });
      ids.forEach(function (id, i) {
        var n = NOTES[id];
        var num = "[" + String(i + 1).padStart(2, "0") + "]";
        lines.push(el("span", { class: "m-line" + (i === ids.length - 1 ? " hi" : "") }, [
          el("span", { class: "i", text: num }),
          el("a", { href: noteHref(id), text: id, title: n.scene || "" }),
        ]));
      });
      main.appendChild(el("div", { class: "kicker", text: "// WORKFLOW" }));
      main.appendChild(el("h2", { class: "sec", text: "方法論" }));
      main.appendChild(el("div", { class: "terminal" }, [
        el("div", { class: "t-head" }, [dotsEl(), el("span", { class: "t-title", text: short })]),
        el("div", { class: "t-body" }, lines),
      ]));
    }
  }

  // ------------------------------------------------------------ カテゴリ（Browse + ツール詳細）
  function renderCategory(main, cat, noteId, slug) {
    CUR.catId = cat.id; CUR.noteId = noteId;
    var note = noteId ? NOTES[noteId] : null;
    document.title = (note ? note.title + " | " : cat.title + " | ") + D.meta.title;
    setWorkspace("/" + catSlug(cat) + (note ? "/" + note.title : ""));
    main.appendChild(pathEl([el("a", { href: catHref(cat.id), text: catSlug(cat) })].concat(note ? [note.title] : [])));
    main.appendChild(el("h1", { class: "page-title", text: cat.title }));
    main.appendChild(el("p", { class: "page-desc", text: cat.desc }));

    var browse = el("nav", { class: "browse", "aria-label": "Browse" }, [el("div", { class: "browse-label", text: "BROWSE" })]);
    var multi = cat.groups.length > 1;
    cat.groups.forEach(function (g) {
      if (multi) browse.appendChild(el("div", { class: "browse-group", text: g.title }));
      g.notes.forEach(function (id) {
        var n = NOTES[id];
        browse.appendChild(el("a", { href: noteHref(id), class: id === noteId ? "active" : "", title: n.scene || "", "aria-current": id === noteId ? "page" : null }, [
          el("span", { class: "chev", text: "›" }), n.title,
        ]));
      });
    });
    if (!cat.groups.length) browse.appendChild(el("p", { class: "acc-empty", text: "このカテゴリにはまだノートが無い" }));

    var detail = el("div", { class: "detail" });
    if (note) renderTool(detail, note);
    main.appendChild(el("div", { class: "ws" }, [browse, detail]));
    var act = browse.querySelector("a.active");
    if (act && browse.scrollHeight > browse.clientHeight) browse.scrollTop = Math.max(0, act.offsetTop - browse.clientHeight / 2);
    if (note) {
      pushRecent(note.id);
      if (slug) setTimeout(function () { jumpTo(detail, slug); }, 30);
    }
  }

  function pushRecent(id) {
    var r = lsArr(LS.recent).filter(function (x) { return x !== id; });
    r.unshift(id);
    lsSet(LS.recent, r.slice(0, 8));
  }

  function renderTool(box, n) {
    box.appendChild(el("h2", { class: "tool-title", text: n.title }));
    if (n.scene) box.appendChild(el("p", { class: "tool-desc", text: n.scene }));
    if (n.intro) box.appendChild(el("p", { class: "tool-intro", text: n.intro }));
    var meta = el("div", { class: "tool-meta" }, [
      el("span", { text: n.folder }),
      n.mtime ? el("span", { text: "更新 " + n.mtime }) : null,
      el("a", { href: "obsidian://open?vault=" + enc(D.meta.vault_name) + "&file=" + enc(n.path.replace(/\.md$/, "")), text: "Obsidian で開く" }),
    ]);
    if (n.keywords && n.keywords.length) meta.appendChild(el("span", { class: "kw", text: n.keywords.slice(0, 8).join(" / ") }));
    box.appendChild(meta);

    var stepSecs = (n.sections || []).filter(function (s) { return s.kind !== "syntax"; });
    var withCmd = stepSecs.filter(function (s) { return s.ncmd > 0; }).length;
    var standalone = n.kind === "playbook" || !stepSecs.length || withCmd / stepSecs.length < 0.5;

    if (standalone) {
      // プレイブック（チェックリスト）と、手順の半分以上にコマンドが無い分岐表・判断ノートは全文をそのまま表示
      var sb = el("div", { class: "note-body standalone", html: n.html });
      enhanceNoteBody(sb, n);
      box.appendChild(sb);
    } else {
      var tpl = document.createElement("template");
      tpl.innerHTML = n.html;
      (n.sections || []).filter(function (s) { return s.kind === "syntax"; }).forEach(function (s) {
        var cmds = [];
        s.subs.forEach(function (sub) { cmds = cmds.concat(sub.cmds); });
        if (cmds.length) box.appendChild(el("div", { class: "syntax" }, [terminal(cmds, "構文 — まずこれ")]));
      });
      var acc = el("div", { class: "acc" });
      var toggleAll = el("button", { class: "btn-ghost", type: "button", text: "すべて開く" });
      toggleAll.addEventListener("click", function () {
        var items = $$("details", acc);
        var allOpen = items.every(function (d) { return d.open; });
        items.forEach(function (d) { d.open = !allOpen; });
        toggleAll.textContent = allOpen ? "すべて開く" : "すべて閉じる";
      });
      box.appendChild(el("div", { class: "tool-tools" }, [toggleAll]));
      stepSecs.forEach(function (s, i) {
        var title = s.title || ("手順 " + (i + 1));
        var det = el("details", { id: "sec-" + s.slug, open: i === 0 });   // getSH と同じく先頭以外は閉じておく
        det.appendChild(el("summary", {}, [el("span", { text: title }), el("span", { class: "n", text: s.ncmd ? s.ncmd + " cmd" : "" }), chevSvg("chev")]));
        var body = el("div", { class: "acc-body" });
        var any = s.subs.some(function (sub) { return sub.cmds.length > 0; });
        if (any) {
          if (s.lead) body.appendChild(el("p", { class: "lead", html: captionHtml(s.lead) }));
          s.subs.forEach(function (sub) {
            if (sub.title) body.appendChild(el("h4", { class: "sub-title", text: sub.title }));
            if (sub.cmds.length) body.appendChild(terminal(sub.cmds, sub.title || ""));
          });
        } else {
          // コマンドが無い手順（判断表・ペイロード表など）は、その節の本文をそのまま埋め込む
          var frag = sectionFragment(tpl, s.slug);
          if (frag) {
            var nb2 = el("div", { class: "note-body embedded" });
            nb2.appendChild(frag);
            enhanceNoteBody(nb2, n);
            body.appendChild(nb2);
          } else {
            body.appendChild(el("p", { class: "acc-empty", text: "この手順にコマンドは無い（判断・確認のみ）。" }));
          }
        }
        det.appendChild(body);
        acc.appendChild(det);
      });
      box.appendChild(acc);

      // 詳細（元ノートの全文: 書き換える場所・オプション表・出力例・詰まったら・関連）
      var fd = el("details", { id: "full-detail" });
      fd.appendChild(el("summary", {}, [el("span", { text: "詳細 — 書き換える場所 / オプション / 出力例 / 詰まったら / 関連" }), chevSvg("chev")]));
      var nb = el("div", { class: "note-body", html: n.html });
      enhanceNoteBody(nb, n);
      fd.appendChild(nb);
      box.appendChild(el("div", { class: "full" }, [fd]));
    }
    if (n.backlinks && n.backlinks.length) {
      box.appendChild(el("p", { class: "muted backlinks" }, ["このノートへのリンク: "].concat(n.backlinks.slice(0, 12).map(function (id, i) {
        return el("span", {}, [i ? ", " : "", el("a", { href: noteHref(id), text: id })]);
      }))));
    }
  }

  // n.html のうち <h2 id="slug"> から次の h1/h2 までを複製して返す
  function sectionFragment(tpl, slug) {
    var heads = tpl.content.querySelectorAll("h1, h2"), h = null;
    for (var i = 0; i < heads.length; i++) if (heads[i].id === slug) { h = heads[i]; break; }
    if (!h) return null;
    var frag = document.createDocumentFragment(), node = h.nextSibling, count = 0;
    while (node && !(node.nodeType === 1 && /^H[12]$/.test(node.tagName))) { frag.appendChild(node.cloneNode(true)); node = node.nextSibling; count++; }
    return count ? frag : null;
  }

  function jumpTo(box, slug) {
    var t = document.getElementById("sec-" + slug);
    if (t) { t.open = true; t.scrollIntoView({ block: "start" }); return; }
    var inBody = $$(".note-body [id]", box).filter(function (e) { return e.id === slug; })[0] || document.getElementById(slug);
    if (inBody) {
      var fd = inBody.closest("details");
      while (fd) { fd.open = true; fd = fd.parentElement ? fd.parentElement.closest("details") : null; }
      inBody.scrollIntoView({ block: "start" });
    }
  }

  // 詳細の本文: コードブロックにコピー、タスクの保存
  function enhanceNoteBody(root, n) {
    if (root.classList.contains("standalone")) {
      var seg = [];
      var flush = function () {
        var hasCmd = seg.some(function (e) { return (e.matches && e.matches(".code:not(.code-out)")) || e.querySelector(".code:not(.code-out)"); });
        if (!hasCmd) seg.forEach(function (e) { if (e.matches && e.matches("details.callout")) e.open = true; $$("details.callout", e).forEach(function (d) { d.open = true; }); });
        seg = [];
      };
      Array.prototype.slice.call(root.children).forEach(function (e) { if (/^H[12]$/.test(e.tagName)) flush(); else seg.push(e); });
      flush();
    }
    $$(".code", root).forEach(function (c) {
      var pre = $("pre", c);
      if (!pre) return;
      var bar = el("div", { class: "code-bar" }, [el("span", { class: "lang", text: c.dataset.lang || "" })]);
      if (!c.classList.contains("code-out")) {
        var b = el("button", { class: "btn-ghost", type: "button", text: "コピー" });
        b.addEventListener("click", function () { copyCmd(pre.textContent.replace(/\s+$/, ""), b); });
        bar.appendChild(b);
      }
      c.insertBefore(bar, pre);
    });
    var boxes = $$(".task-box", root);
    if (boxes.length) {
      var key = "cs.tasks." + n.id;
      var saved = lsArr(key);
      boxes.forEach(function (b) { b.checked = saved.indexOf(parseInt(b.dataset.task, 10)) >= 0; });
      var counter = el("span");
      var update = function () {
        var done = boxes.filter(function (b) { return b.checked; }).map(function (b) { return parseInt(b.dataset.task, 10); });
        lsSet(key, done);
        counter.textContent = done.length + "/" + boxes.length + " 完了";
      };
      boxes.forEach(function (b) { b.addEventListener("change", update); });
      var reset = el("button", { class: "btn-ghost", type: "button", text: "チェックをリセット" });
      reset.addEventListener("click", function () { boxes.forEach(function (b) { b.checked = false; }); update(); });
      root.insertBefore(el("div", { class: "task-tools" }, [counter, reset]), root.firstChild);
      update();
    }
  }

  // ------------------------------------------------------------ 外部リファレンス / 404
  function renderExt(main) {
    CUR.noteId = null; CUR.catId = "ext";
    document.title = "外部リファレンス | " + D.meta.title;
    setWorkspace("/external");
    main.appendChild(pathEl(["external"]));
    main.appendChild(el("h1", { class: "page-title", text: "外部リファレンス" }));
    main.appendChild(el("p", { class: "page-desc", text: "Vault 内に手順が無い、思い出せない時に見る。" }));
    main.appendChild(el("div", { class: "ext-list" }, (D.external || []).map(function (x) {
      return el("a", { class: "card", href: x.url, target: "_blank", rel: "noopener noreferrer" }, [
        el("h3", { text: x.title }), el("span", { class: "cnt", text: "↗" }), el("p", { text: x.scene }), el("span", { class: "url", text: x.url }),
      ]);
    })));
  }
  function renderNotFound(main, id) {
    CUR.noteId = null; CUR.catId = "";
    document.title = "見つかりません | " + D.meta.title;
    setWorkspace("/404");
    main.appendChild(pathEl(["404"]));
    main.appendChild(el("h1", { class: "page-title", text: "ノートが見つかりません" }));
    main.appendChild(el("p", { class: "page-desc" }, [el("code", { text: id }), " は Vault に無いか、名前が変わった。", el("a", { href: "#/", text: "ホームへ戻る" })]));
  }

  // ------------------------------------------------------------ 検索
  var IDX = null;
  function buildIndex() {
    IDX = Object.keys(NOTES).map(function (id) {
      var n = NOTES[id];
      var g = NOTE_GROUP[id] || {};
      var secs = (n.sections || []).map(function (s) { return { t: s.title, tl: s.title.toLowerCase(), slug: s.slug }; });
      var cmds = (n.commands || []).map(function (c) { return { t: c.text, tl: c.text.toLowerCase(), c: c.comment || "", cl: (c.comment || "").toLowerCase() }; });
      var kw = (n.keywords || []).join(" / ");
      var cat = (g.cat ? g.cat.title + " / " : "") + (g.group ? g.group.title : "");
      return { id: id, title: n.title, tl: n.title.toLowerCase(), kw: kw, kwl: kw.toLowerCase(), scene: n.scene || "", scenel: (n.scene || "").toLowerCase(), cat: cat, catl: cat.toLowerCase(), secs: secs, cmds: cmds };
    });
  }
  function hasTerm(s, term) {
    if (term.length > 2 && term.charAt(0) !== "-") return s.indexOf(term) >= 0;
    var re = new RegExp("(^|[\\s/・(（,])" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[\\s/・)）,])");
    return re.test(s);
  }
  function search(q) {
    if (!IDX) buildIndex();
    var terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    var out = [];
    IDX.forEach(function (it) {
      var score = 0, hit = { sec: null, cmd: null, field: "" };
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t], w = 0;
        var weak = term.charAt(0) === "-" || term.length <= 2;   // オプション名や 2 文字語はノート名に含まれても弱い証拠
        if (hasTerm(it.tl, term)) { w = weak ? 4 : 10 + (it.tl.indexOf(term) === 0 ? 3 : 0); hit.field = hit.field || "title"; }
        if (hasTerm(it.kwl, term)) { w = Math.max(w, weak ? 3 : 6); hit.field = hit.field || "kw"; }
        if (hasTerm(it.scenel, term)) { w = Math.max(w, 5); hit.field = hit.field || "scene"; }
        if (it.catl.indexOf(term) >= 0) { w = Math.max(w, 4); hit.field = hit.field || "cat"; }
        for (var s = 0; s < it.secs.length; s++) if (it.secs[s].tl.indexOf(term) >= 0) { w = Math.max(w, 3); if (!hit.sec) hit.sec = it.secs[s]; break; }
        if (w < 6) for (var c = 0; c < it.cmds.length; c++) if (it.cmds[c].tl.indexOf(term) >= 0 || it.cmds[c].cl.indexOf(term) >= 0) { w = Math.max(w, 2); if (!hit.cmd) hit.cmd = it.cmds[c]; break; }
        if (!w) { score = 0; break; }
        score += w;
      }
      if (score) out.push({ it: it, score: score - Math.min(it.title.length, 60) / 100, hit: hit });
    });
    out.sort(function (a, b) { return b.score - a.score || (a.it.title < b.it.title ? -1 : 1); });
    return out.slice(0, 40);
  }
  function markText(text, terms, maxLen) {
    var frag = document.createDocumentFragment();
    var low = text.toLowerCase(), first = -1;
    terms.forEach(function (t) { var p = low.indexOf(t); if (p >= 0 && (first < 0 || p < first)) first = p; });
    var start = 0;
    if (maxLen && text.length > maxLen && first > maxLen * 0.4) start = Math.max(0, first - Math.floor(maxLen * 0.4));
    var end = maxLen ? Math.min(text.length, start + maxLen) : text.length;
    if (start > 0) frag.appendChild(document.createTextNode("…"));
    var pos = start;
    while (pos < end) {
      var best = -1, bestLen = 0;
      terms.forEach(function (t) { var p = low.indexOf(t, pos); if (p >= 0 && p < end && (best < 0 || p < best)) { best = p; bestLen = t.length; } });
      if (best < 0) { frag.appendChild(document.createTextNode(text.slice(pos, end))); break; }
      if (best > pos) frag.appendChild(document.createTextNode(text.slice(pos, best)));
      frag.appendChild(el("mark", { text: text.slice(best, best + bestLen) }));
      pos = best + bestLen;
    }
    if (end < text.length) frag.appendChild(document.createTextNode("…"));
    return frag;
  }
  var PAL = { open: false, sel: 0, items: [] };
  function openPalette() {
    var p = $("#palette"), inp = $("#pal-input");
    p.hidden = false; PAL.open = true;
    renderPalette(); inp.focus(); inp.select();
  }
  function closePalette() { var p = $("#palette"); if (!p.hidden) { p.hidden = true; PAL.open = false; } }
  function renderPalette() {
    var inp = $("#pal-input"), list = $("#pal-list");
    var q = inp.value, terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    list.textContent = "";
    PAL.items = search(q);
    if (PAL.sel >= PAL.items.length) PAL.sel = 0;
    if (!terms.length) { list.appendChild(el("li", { class: "pal-empty", text: "ノート名・検索語・手順名・コマンドで探す" })); return; }
    if (!PAL.items.length) { list.appendChild(el("li", { class: "pal-empty", text: "一致するノートがありません" })); return; }
    PAL.items.forEach(function (r, i) {
      var it = r.it, hit = r.hit;
      var showSec = hit.sec && hit.field !== "title";
      var href = noteHref(it.id, showSec ? hit.sec.slug : "");
      var li = el("li", { class: i === PAL.sel ? "sel" : "", role: "option", dataset: { href: href } });
      var pt = el("span", { class: "pt" }); pt.appendChild(markText(it.title, terms));
      if (showSec) { pt.appendChild(document.createTextNode(" › ")); pt.appendChild(markText(hit.sec.t, terms)); }
      li.appendChild(pt);
      li.appendChild(el("span", { class: "pc", text: it.cat }));
      var useCmd = hit.cmd && !showSec && hit.field !== "title" && hit.field !== "kw" && hit.field !== "scene";
      var ex = el("span", { class: "px" + (useCmd ? " mono" : "") });
      if (useCmd) ex.appendChild(markText((hit.cmd.c ? hit.cmd.c + "  $ " : "$ ") + hit.cmd.t, terms, 110));
      else ex.appendChild(markText(it.scene || it.kw, terms, 110));
      li.appendChild(ex);
      li.addEventListener("mousemove", function () { if (PAL.sel !== i) { PAL.sel = i; $$("li", list).forEach(function (x, k) { x.classList.toggle("sel", k === i); }); } });
      li.addEventListener("click", function () { go(href); });
      list.appendChild(li);
    });
  }
  function go(href) {
    closePalette();
    if (location.hash === href) route(); else location.hash = href;
  }

  // ------------------------------------------------------------ 起動
  function bind() {
    $("#menu-btn").addEventListener("click", function () { if ($("#sidebar").classList.contains("open")) closeSidebar(); else openSidebar(); });
    $("#backdrop").addEventListener("click", closeSidebar);
    $("#quick-search").addEventListener("click", openPalette);
    $("#vars-more").addEventListener("click", function () { UI.extraOpen = !UI.extraOpen; renderVars(); });
    $("#vars-toggle").addEventListener("click", function () {
      var tb = $("#topbar"); tb.classList.toggle("vars-open");
      $("#vars-toggle").setAttribute("aria-expanded", tb.classList.contains("vars-open") ? "true" : "false");
    });
    $("#vars-clear").addEventListener("click", function () {
      UNDO = JSON.parse(JSON.stringify(V.values));
      allKeys().forEach(function (k) { V.values[k] = ""; });
      saveVars(); renderVars(); applyVars();
      $("#vars-undo").hidden = false;
      toast("変数をすべて消した（元に戻すで復元できる）");
    });
    $("#vars-undo").addEventListener("click", function () {
      if (!UNDO) return;
      V.values = UNDO; UNDO = null; saveVars(); renderVars(); applyVars();
      $("#vars-undo").hidden = true;
    });
    var inp = $("#pal-input");
    inp.addEventListener("input", function () { PAL.sel = 0; renderPalette(); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); PAL.sel = Math.min(PAL.sel + 1, PAL.items.length - 1); renderPalette(); scrollSel(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); PAL.sel = Math.max(PAL.sel - 1, 0); renderPalette(); scrollSel(); }
      else if (e.key === "Enter") { e.preventDefault(); var li = $$("#pal-list li")[PAL.sel]; if (li && li.dataset.href) go(li.dataset.href); }
    });
    $("#palette").addEventListener("click", function (e) { if (e.target === $("#palette")) closePalette(); });
    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      var typing = tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); if (PAL.open) closePalette(); else openPalette(); return; }
      if (e.key === "Escape") { if (PAL.open) { closePalette(); return; } closeSidebar(); return; }
      if (e.key === "/" && !typing && !PAL.open) { e.preventDefault(); openPalette(); }
    });
    var sm = $("#vars-summary");
    if (sm) sm.addEventListener("click", function () { $("#topbar").classList.toggle("pinned"); if ($("#topbar").classList.contains("pinned")) { var f = $("#vars input[type=text]"); if (f) f.focus(); } });
    var onScroll = function () { document.body.classList.toggle("scrolled", window.scrollY > 140); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    window.addEventListener("hashchange", route);
    // 同じ hash へのクリック（Browse の現在項目など）でも再描画する
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href^='#/']");
      if (!a) return;
      if (a.getAttribute("href") === location.hash) { e.preventDefault(); route(); }
    });
  }
  function scrollSel() { var li = $$("#pal-list li")[PAL.sel]; if (li && li.scrollIntoView) li.scrollIntoView({ block: "nearest" }); }

  function boot() {
    renderNav();
    renderVars();
    bind();
    route();
    applyVars();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
