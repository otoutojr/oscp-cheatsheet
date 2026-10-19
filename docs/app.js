/* OSCP Cheatsheet — app.js（案 A: 試験本番の速さ最優先）
   素の JavaScript（classic script）。data.js の window.CHEATSHEET_DATA を読み、
   ルータ → 変数 → ノート描画 → ナビ → 検索 → ホーム/一覧 の順に組み立てる。 */
(function () {
  "use strict";

  var LS = {
    vars: "cs.vars.v1",
    tasks: "cs.tasks.",
    recent: "cs.recent",
    nav: "cs.nav",
    theme: "cs.theme",
    ui: "cs.ui.v1"
  };
  var SITE = "OSCP Cheatsheet";
  var D = null;          // window.CHEATSHEET_DATA
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---------------------------------------------------------------- utils
  function lsGet(key, def) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? def : JSON.parse(v);
    } catch (e) { return def; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 容量超過などは無視 */ }
  }
  function lsDel(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }

  // DOM ビルダ。文字列は必ず textNode（innerHTML には入れない）
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") node.className = v;
        else if (k === "text") node.textContent = v;
        else if (k === "dataset") Object.keys(v).forEach(function (dk) { node.dataset[dk] = v[dk]; });
        else if (k === "on") Object.keys(v).forEach(function (ev) { node.addEventListener(ev, v[ev]); });
        else if (k === "checked" || k === "hidden" || k === "disabled" || k === "open") node[k] = !!v;
        else if (k === "value") node.value = v;
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(node, arguments[i]);
    return node;
  }
  function append(node, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(node, c); }); return; }
    if (typeof child === "string" || typeof child === "number") node.appendChild(document.createTextNode(String(child)));
    else node.appendChild(child);
  }
  function enc(s) { return encodeURIComponent(s); }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function noteHref(id, slug) { return "#/n/" + enc(id) + (slug ? "/" + enc(slug) : ""); }
  function secHref(g, s) { return "#/s/" + enc(g) + "/" + enc(s); }
  function noteTitle(id) { return (D && D.notes[id]) ? D.notes[id].title : id; }
  function uniq(arr) { var seen = {}; return arr.filter(function (x) { if (seen[x]) return false; seen[x] = true; return true; }); }

  var toastTimer = null;
  function toast(msg, warn) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "toast" + (warn ? " warn" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, warn ? 2600 : 1600);
  }

  function updateTopH() {
    var top = $("#top");
    if (top) document.documentElement.style.setProperty("--top-h", top.offsetHeight + "px");
  }

  // ---------------------------------------------------------------- theme
  function currentTheme() { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  function setTheme(t, save) {
    document.documentElement.setAttribute("data-theme", t);
    if (save) lsSet(LS.theme, t);
    $$(".theme-btn").forEach(function (b) {
      var full = !b.closest(".nav-brand");
      b.textContent = "";
      b.appendChild(document.createTextNode(t === "dark" ? "☀" : "☾"));
      if (full) b.appendChild(el("span", { class: "t", text: " " + (t === "dark" ? "ライト" : "ダーク") }));
      b.title = t === "dark" ? "ライトに切替" : "ダークに切替";
      b.setAttribute("aria-label", b.title);
    });
  }
  function initTheme() {
    var saved = lsGet(LS.theme, null);
    var t = (saved === "light" || saved === "dark") ? saved
      : ((window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark");
    setTheme(t, false);
    $$(".theme-btn").forEach(function (b) { b.addEventListener("click", function () { setTheme(currentTheme() === "dark" ? "light" : "dark", true); }); });
  }

  // ---------------------------------------------------------------- variables
  var V = {
    defs: [],            // D.variables
    byKey: {},
    state: { values: {}, enabled: {}, extra: [], inlineApply: true },
    undo: null,
    masked: {},          // secret の伏せ字状態（セッション内）
    groups: ["attacker", "victim", "cred", "other"]
  };

  function loadVars() {
    V.defs = D.variables || [];
    V.byKey = {};
    V.defs.forEach(function (d) { V.byKey[d.key] = d; });
    var saved = lsGet(LS.vars, null) || {};
    var sv = saved.values || {}, se = saved.enabled || {};
    var st = { values: {}, enabled: {}, extra: [], inlineApply: saved.inlineApply !== false };
    V.defs.forEach(function (d) {
      st.values[d.key] = (typeof sv[d.key] === "string") ? sv[d.key] : (d.default || "");
      st.enabled[d.key] = se[d.key] !== false;
    });
    (Array.isArray(saved.extra) ? saved.extra : []).forEach(function (k) {
      if (typeof k !== "string" || V.byKey[k] || st.extra.indexOf(k) >= 0) return;
      st.extra.push(k);
      st.values[k] = (typeof sv[k] === "string") ? sv[k] : "";
      st.enabled[k] = se[k] !== false;
    });
    V.state = st;
    V.defs.forEach(function (d) { if (d.secret) V.masked[d.key] = false; });
  }
  function saveVars() { lsSet(LS.vars, V.state); }
  function allKeys() { return V.defs.map(function (d) { return d.key; }).concat(V.state.extra); }
  function isKnownKey(k) { return !!V.byKey[k] || V.state.extra.indexOf(k) >= 0; }
  function isOn(k) { return V.state.enabled[k] !== false; }
  function deriveBaseDn(domain) {
    var parts = String(domain || "").trim().split(".").filter(Boolean);
    return parts.length ? parts.map(function (p) { return "DC=" + p; }).join(",") : "";
  }
  // 有効値。derive: base_dn は未入力時のみ DOMAIN から導出
  function effVal(k) {
    var v = V.state.values[k];
    if (typeof v !== "string") v = "";
    var d = V.byKey[k];
    if (v === "" && d && d.derive === "base_dn") {
      var dn = deriveBaseDn(V.state.values.DOMAIN);
      if (dn) return { v: dn, derived: true };
    }
    return { v: v, derived: false };
  }
  function isFilled(k) { return isOn(k) && effVal(k).v !== ""; }
  // config の default と同じ値のまま（= 自分では何も入れていない）
  function isDefaultVal(k) {
    var d = V.byKey[k];
    return !!d && (d.default || "") !== "" && (V.state.values[k] || "") === d.default;
  }
  // 「n/total 入力済み」は default のままのものを数えない
  function filledCount() {
    var keys = allKeys(), n = 0;
    keys.forEach(function (k) { if (isFilled(k) && !isDefaultVal(k)) n++; });
    return { n: n, total: keys.length };
  }

  // §4.3「インラインコード（<code> 直下）」= pre の外の code。.code-cap や本文テキストは inline ではない
  function isInlinePh(ph) {
    var code = ph.closest("code");
    return !!code && !code.closest("pre");
  }
  // root 以下の .ph を現在の状態で書き換える。
  // .ph-key（「書き換える場所」表の 1 列目）は対応表なので <KEY> の表示を保ち、class だけ切り替える
  function applyPh(root) {
    if (!root) return;
    var inlineOk = V.state.inlineApply;
    var phs = root.querySelectorAll(".ph");
    for (var i = 0; i < phs.length; i++) {
      var ph = phs[i], k = ph.dataset.ph;
      if (!k) continue;
      var e = effVal(k), on = isOn(k);
      var inline = isInlinePh(ph);
      var isKey = ph.classList.contains("ph-key");
      var cls, text = "<" + k + ">", title;
      if (on && e.v !== "" && (inlineOk || !inline)) {
        cls = "ph ph-set";
        if (!isKey) text = e.v;
        title = (isKey ? "入力済み: " + e.v : "<" + k + ">") + (e.derived ? "（DOMAIN から自動）" : "");
      } else if (inline && !inlineOk && e.v !== "" && on) {
        cls = "ph ph-unset ph-off";
        title = "インラインには反映しない設定";
      } else {
        cls = "ph ph-unset";
        title = on ? "未入力: 上の欄に入れると置き換わる" : "反映オフ";
      }
      if (isKey) cls += " ph-key";
      if (ph.textContent !== text) ph.textContent = text;
      if (ph.className !== cls) ph.className = cls;
      if (ph.title !== title) ph.title = title;
    }
  }
  function applyAll() {
    applyPh($("#main"));
    refreshVarChips();
    updateVarsToggle();
  }

  function updateVarsToggle() {
    var c = filledCount();
    var b = $("#vars-toggle");
    if (b) b.textContent = "変数 (" + c.n + "/" + c.total + " 入力済み)";
  }

  // 変数チップ 1 つ。compact=true はノート内「このノートで使う変数」用
  function makeVarChip(k, opts) {
    opts = opts || {};
    var d = V.byKey[k];
    var isExtra = !d;
    var chip = el("div", { class: "var", dataset: { key: k, group: d ? d.group : "extra" } });
    var on = el("input", { type: "checkbox", class: "var-on", title: "反映", "aria-label": k + " を反映", checked: isOn(k) });
    on.addEventListener("change", function () {
      V.state.enabled[k] = on.checked;
      saveVars();
      applyAll();
    });
    var label = d ? (d.label + (d.example ? "（例: " + d.example + "）" : "")) : ("<" + k + ">（ノート内の穴埋め）");
    var key = el("span", { class: "var-key", text: k, title: label });
    chip.appendChild(on);
    chip.appendChild(key);
    if (d && d.secret) {
      var eye = el("button", { type: "button", class: "var-eye", title: "伏せ字にする / 見せる", "aria-label": k + " を伏せ字にする", text: V.masked[k] ? "●" : "👁" });
      eye.addEventListener("click", function () {
        V.masked[k] = !V.masked[k];
        $$('.var[data-key="' + CSS.escape(k) + '"]').forEach(function (c) {
          var i = $(".var-in", c), e2 = $(".var-eye", c);
          if (i) i.type = V.masked[k] ? "password" : "text";
          if (e2) e2.textContent = V.masked[k] ? "●" : "👁";
        });
      });
      chip.appendChild(eye);
    } else if (isExtra && !opts.compact) {
      var x = el("button", { type: "button", class: "var-x", title: "この変数を外す", "aria-label": k + " を外す", text: "✕" });
      x.addEventListener("click", function () { removeExtra(k); });
      chip.appendChild(x);
    }
    if (d && (d.example || "").length > 20) chip.classList.add("var-wide");
    var e = effVal(k);
    var inp = el("input", {
      type: (d && d.secret && V.masked[k]) ? "password" : "text",
      class: "var-in" + (e.derived ? " derived" : ""),
      value: V.state.values[k] || "",
      placeholder: e.derived ? e.v : (d ? d.example : "<" + k + ">"),
      autocomplete: "off", spellcheck: "false", autocapitalize: "off",
      "aria-label": d ? d.label : k
    });
    inp.addEventListener("input", function () {
      V.state.values[k] = inp.value;
      saveVars();
      syncInputs(k, inp);
      applyAll();
    });
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { inp.blur(); ev.stopPropagation(); }
      if (ev.key === "Enter") { inp.blur(); }
    });
    chip.appendChild(inp);
    refreshChip(chip);
    return chip;
  }
  function refreshChip(chip) {
    var k = chip.dataset.key;
    var e = effVal(k);
    chip.classList.toggle("filled", isOn(k) && e.v !== "");
    chip.classList.toggle("dflt", isDefaultVal(k));
    chip.classList.toggle("off", !isOn(k));
    var inp = $(".var-in", chip);
    if (inp) {
      inp.classList.toggle("derived", e.derived);
      var d = V.byKey[k];
      inp.placeholder = e.derived ? e.v : (d ? d.example : "<" + k + ">");
    }
    var on = $(".var-on", chip);
    if (on && on.checked !== isOn(k)) on.checked = isOn(k);
  }
  function refreshVarChips() { $$(".var").forEach(refreshChip); }
  function syncInputs(k, except) {
    $$('.var[data-key="' + CSS.escape(k) + '"] .var-in').forEach(function (i) {
      if (i !== except && i.value !== V.state.values[k]) i.value = V.state.values[k] || "";
    });
  }

  function renderVarbar() {
    var primary = $("#vb-primary"), other = $("#vb-other-chips");
    primary.textContent = "";
    other.textContent = "";
    var gl = D.variable_groups || {};
    var order = ["attacker", "victim", "cred"];
    var first = true;
    order.forEach(function (g) {
      var defs = V.defs.filter(function (d) { return d.group === g; });
      if (!defs.length) return;
      if (!first) primary.appendChild(el("span", { class: "vg-sep", title: gl[g] || g }));
      first = false;
      defs.forEach(function (d) { var c = makeVarChip(d.key); c.title = gl[g] || g; primary.appendChild(c); });
    });
    var others = V.defs.filter(function (d) { return order.indexOf(d.group) < 0; });
    if (others.length) {
      other.appendChild(el("span", { class: "vg-label", text: gl.other || "その他", title: gl.other || "その他" }));
      others.forEach(function (d) { other.appendChild(makeVarChip(d.key)); });
    }
    if (V.state.extra.length) {
      other.appendChild(el("span", { class: "vg-label", text: "追加した変数", title: "ノートの穴埋めから追加した変数（✕ で外す）" }));
      V.state.extra.forEach(function (k) { other.appendChild(makeVarChip(k)); });
    }
    renderAddSelect();
    $("#vb-inline").checked = V.state.inlineApply;
    $("#vb-undo").hidden = !V.undo;
    updateVarsToggle();
    // 2 段目の開閉: 手で閉じた／開いた状態（cs.ui.v1）があればそれを優先。無ければ値や追加変数があるときだけ自動で開く
    var ui = lsGet(LS.ui, null) || {};
    if (typeof ui.otherOpen === "boolean") {
      setOtherOpen(ui.otherOpen);
    } else {
      var hasOtherValue = others.concat(V.state.extra.map(function (k) { return { key: k }; }))
        .some(function (d) { return (V.state.values[d.key] || "") !== "" && (!V.byKey[d.key] || V.state.values[d.key] !== V.byKey[d.key].default); });
      setOtherOpen(hasOtherValue || V.state.extra.length > 0);
    }
    updateTopH();
  }
  // save=true はユーザー操作（記憶する）。プログラムからの開閉は記憶しない
  function setOtherOpen(open, save) {
    var o = $("#vb-other"), b = $("#vb-more");
    o.hidden = !open;
    b.setAttribute("aria-expanded", open ? "true" : "false");
    b.textContent = "その他の変数 " + (open ? "▴" : "▾");
    if (save) {
      var ui = lsGet(LS.ui, null) || {};
      ui.otherOpen = !!open;
      lsSet(LS.ui, ui);
    }
    updateTopH();
  }
  function closeVarbar() {
    var vb = $("#varbar");
    if (!vb.classList.contains("open")) return;
    vb.classList.remove("open");
    $("#vars-toggle").setAttribute("aria-expanded", "false");
    updateTopH();
  }
  function renderAddSelect() {
    var sel = $("#vb-add");
    sel.textContent = "";
    sel.appendChild(el("option", { value: "", text: "変数を追加…" }));
    var ph = D.placeholders || {};
    Object.keys(ph)
      .filter(function (k) { return !isKnownKey(k); })
      .sort(function (a, b) { return (ph[b] - ph[a]) || (a < b ? -1 : 1); })
      .forEach(function (k) { sel.appendChild(el("option", { value: k, text: k + " (" + ph[k] + ")" })); });
  }
  function addExtra(k, focus) {
    if (!k || isKnownKey(k)) return;
    V.state.extra.push(k);
    V.state.values[k] = "";
    V.state.enabled[k] = true;
    saveVars();
    renderVarbar();
    setOtherOpen(true);
    rerenderNoteVars();
    applyAll();
    if (focus) {
      var inp = $('#vb-other-chips .var[data-key="' + CSS.escape(k) + '"] .var-in');
      if (inp) inp.focus();
    }
    toast("変数 <" + k + "> を追加しました");
  }
  function removeExtra(k) {
    var i = V.state.extra.indexOf(k);
    if (i < 0) return;
    V.state.extra.splice(i, 1);
    delete V.state.values[k];
    delete V.state.enabled[k];
    saveVars();
    renderVarbar();
    rerenderNoteVars();
    applyAll();
  }
  function clearVars() {
    var snapshot = {};
    allKeys().forEach(function (k) { snapshot[k] = V.state.values[k] || ""; });
    V.undo = snapshot;
    allKeys().forEach(function (k) { V.state.values[k] = ""; });
    saveVars();
    $$(".var-in").forEach(function (i) { i.value = ""; });
    $("#vb-undo").hidden = false;
    applyAll();
    toast("すべてクリアしました（「元に戻す」で復元）");
  }
  function undoClear() {
    if (!V.undo) return;
    Object.keys(V.undo).forEach(function (k) { if (isKnownKey(k)) V.state.values[k] = V.undo[k]; });
    V.undo = null;
    saveVars();
    $$(".var").forEach(function (c) { var i = $(".var-in", c); if (i) i.value = V.state.values[c.dataset.key] || ""; });
    $("#vb-undo").hidden = true;
    applyAll();
    toast("元に戻しました");
  }
  function initVarbar() {
    loadVars();
    renderVarbar();
    $("#vb-more").addEventListener("click", function () { setOtherOpen($("#vb-other").hidden, true); });
    $("#vb-inline").addEventListener("change", function (ev) {
      V.state.inlineApply = ev.target.checked;
      saveVars();
      applyAll();
    });
    $("#vb-add").addEventListener("change", function (ev) {
      var k = ev.target.value;
      ev.target.value = "";
      addExtra(k, true);
    });
    $("#vb-clear").addEventListener("click", clearVars);
    $("#vb-undo").addEventListener("click", undoClear);
    var VB = { openY: 0 };   // モバイルで開いた時のスクロール位置
    $("#vars-toggle").addEventListener("click", function () {
      var vb = $("#varbar");
      var open = !vb.classList.contains("open");
      vb.classList.toggle("open", open);
      this.setAttribute("aria-expanded", open ? "true" : "false");
      updateTopH();
      if (open) {
        VB.openY = window.scrollY;
        var f = $(".var-in", vb); if (f && window.innerWidth >= 480) f.focus();
      }
    });
    // 入力欄から抜けた位置を基準にし直す（入力中のキーボード表示によるスクロールで閉じない）
    $("#varbar").addEventListener("focusout", function () { VB.openY = window.scrollY; });
    // モバイル: 入力し終えて本文をスクロールし始めたら自動で閉じる（sticky ヘッダが画面を占有し続けない）
    window.addEventListener("scroll", function () {
      if (window.innerWidth >= 1024) return;
      var vb = $("#varbar");
      if (!vb.classList.contains("open")) return;
      if (vb.contains(document.activeElement)) return;
      if (Math.abs(window.scrollY - VB.openY) > 80) closeVarbar();
    }, { passive: true });
  }

  // ---------------------------------------------------------------- recent
  function getRecent() {
    var r = lsGet(LS.recent, []);
    return Array.isArray(r) ? r.filter(function (id) { return D.notes[id]; }) : [];
  }
  function pushRecent(id) {
    var r = getRecent().filter(function (x) { return x !== id; });
    r.unshift(id);
    r = r.slice(0, 8);
    lsSet(LS.recent, r);
    renderNavRecent();
  }
  function renderNavRecent() {
    var wrap = $("#nav-recent"), list = $("#nav-recent-list");
    var r = getRecent();
    list.textContent = "";
    wrap.hidden = r.length === 0;
    r.forEach(function (id) {
      list.appendChild(el("li", null, el("a", { href: noteHref(id), text: noteTitle(id), title: D.notes[id].scene || "", dataset: { note: id } })));
    });
  }

  // ---------------------------------------------------------------- nav
  var NAV = { state: { g: {}, s: {} }, defaultsG: { playbook: true, port: true, situation: true, cve: false, folder: false } };
  function navOpenG(gid) { var v = NAV.state.g[gid]; return typeof v === "boolean" ? v : (NAV.defaultsG[gid] !== undefined ? NAV.defaultsG[gid] : false); }
  function navOpenS(gid, sid) { var v = NAV.state.s[gid + "/" + sid]; return typeof v === "boolean" ? v : (gid === "playbook" || gid === "cve"); }
  function saveNav() { lsSet(LS.nav, NAV.state); }

  function buildNav() {
    var saved = lsGet(LS.nav, null);
    if (saved && typeof saved === "object") NAV.state = { g: saved.g || {}, s: saved.s || {} };
    var tree = $("#nav-tree");
    tree.textContent = "";
    D.nav.forEach(function (g) {
      var count = g.sections.reduce(function (a, s) { return a + s.entries.length; }, 0);
      var grp = el("div", { class: "ng" + (navOpenG(g.id) ? " open" : ""), dataset: { g: g.id } });
      var hd = el("button", { type: "button", class: "ng-h", title: g.desc || "", "aria-expanded": navOpenG(g.id) ? "true" : "false" },
        el("span", { class: "caret", text: "▶" }), el("span", { text: g.title }), el("span", { class: "cnt", text: String(count) }));
      hd.addEventListener("click", function () {
        var open = !grp.classList.contains("open");
        grp.classList.toggle("open", open);
        hd.setAttribute("aria-expanded", open ? "true" : "false");
        NAV.state.g[g.id] = open;
        saveNav();
      });
      grp.appendChild(hd);
      var body = el("div", { class: "ng-body" });
      g.sections.forEach(function (s) {
        var sec = el("div", { class: "ns" + (navOpenS(g.id, s.id) ? " open" : ""), dataset: { g: g.id, s: s.id } });
        var caret = el("button", { type: "button", class: "caret", title: "開閉", "aria-label": s.title + " を開閉" });
        caret.addEventListener("click", function () {
          var open = !sec.classList.contains("open");
          sec.classList.toggle("open", open);
          NAV.state.s[g.id + "/" + s.id] = open;
          saveNav();
        });
        var t = el("a", { class: "ns-t", href: secHref(g.id, s.id), text: s.title, title: s.desc || s.title, dataset: { g: g.id, s: s.id } });
        var sh = el("div", { class: "ns-h" }, caret, t, el("span", { class: "cnt", text: String(s.entries.length) }));
        sec.appendChild(sh);
        var ul = el("ul", { class: "ns-body" });
        var lastSub = null;
        s.entries.forEach(function (e) {
          if (e.sub && e.sub !== lastSub) {
            ul.appendChild(el("li", { class: "ne-sub", text: e.sub, title: e.sub }));
          }
          lastSub = e.sub || lastSub;
          var ids = [e.note].concat(e.also || []);
          ids.forEach(function (id, idx) {
            var n = D.notes[id];
            var li = el("li", { class: "ne", dataset: { q: (noteTitle(id) + " " + (e.scene || "") + " " + (e.keywords || "") + " " + (n ? n.keywords.join(" ") : "")).toLowerCase() } });
            li.appendChild(el("a", { href: noteHref(id), text: (idx ? "└ " : "") + noteTitle(id), title: (e.scene || (n && n.scene) || ""), dataset: { note: id } }));
            ul.appendChild(li);
          });
        });
        sec.appendChild(ul);
        body.appendChild(sec);
      });
      grp.appendChild(body);
      tree.appendChild(grp);
    });
    $("#nav-meta").textContent = "ノート " + Object.keys(D.notes).length + " 本 · " + (D.meta.built_at || "");

    // 絞り込み
    var filt = $("#nav-filter");
    filt.addEventListener("input", function () { filterNav(filt.value); });
    filt.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") { filt.value = ""; filterNav(""); filt.blur(); ev.stopPropagation(); }
      if (ev.key === "Enter") {
        var first = $("#nav-tree .ne:not(.nav-hidden) a");
        if (first) { location.hash = first.getAttribute("href"); closeDrawer(); }
      }
    });

    // ドロワー: リンクを踏んだら閉じる
    $("#nav").addEventListener("click", function (ev) {
      var a = ev.target.closest("a[href^='#/']");
      if (a) closeDrawer();
    });
    $("#nav-toggle").addEventListener("click", function () { setDrawer(!$("#nav").classList.contains("open")); });
    $("#backdrop").addEventListener("click", function () { closeDrawer(); });
  }
  function filterNav(q) {
    var nav = $("#nav");
    var terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    nav.classList.toggle("filtering", terms.length > 0);
    var groups = $$("#nav-tree .ng");
    if (!terms.length) {
      $$(".nav-hidden", nav).forEach(function (x) { x.classList.remove("nav-hidden"); });
      var old = $("#nav-tree .nav-empty"); if (old) old.remove();
      return;
    }
    var any = false;
    groups.forEach(function (g) {
      var gAny = false;
      $$(".ns", g).forEach(function (s) {
        var st = ($(".ns-t", s).textContent || "").toLowerCase();
        var secMatch = terms.every(function (t) { return st.indexOf(t) >= 0; });
        var sAny = false;
        $$(".ne", s).forEach(function (li) {
          var hit = secMatch || terms.every(function (t) { return li.dataset.q.indexOf(t) >= 0; });
          li.classList.toggle("nav-hidden", !hit);
          if (hit) sAny = true;
        });
        $$(".ne-sub", s).forEach(function (li) { li.classList.add("nav-hidden"); });
        s.classList.toggle("nav-hidden", !sAny);
        if (sAny) gAny = true;
      });
      g.classList.toggle("nav-hidden", !gAny);
      if (gAny) any = true;
    });
    var oldE = $("#nav-tree .nav-empty"); if (oldE) oldE.remove();
    if (!any) $("#nav-tree").appendChild(el("div", { class: "nav-empty", text: "一致するノートがありません" }));
  }
  function setDrawer(open) {
    $("#nav").classList.toggle("open", open);
    $("#backdrop").hidden = !open;
    $("#nav-toggle").setAttribute("aria-expanded", open ? "true" : "false");
    if (open && window.innerWidth >= 480) $("#nav-filter").focus();
  }
  function closeDrawer() { if ($("#nav").classList.contains("open")) setDrawer(false); }
  function setNavActive(noteId, gid, sid) {
    $$("#nav .active").forEach(function (a) { a.classList.remove("active"); });
    var target = null;
    if (noteId) {
      var links = $$('#nav-tree .ne a[data-note="' + CSS.escape(noteId) + '"]');
      links.forEach(function (a) { a.classList.add("active"); });
      // 開いているセクションにあればそれを、無ければ最初のものを開く
      target = links.filter(function (a) { var s = a.closest(".ns"), g = a.closest(".ng"); return s && g && s.classList.contains("open") && g.classList.contains("open"); })[0] || links[0];
      if (target) {
        var s = target.closest(".ns"), g = target.closest(".ng");
        if (s) s.classList.add("open");
        if (g) g.classList.add("open");
      }
    } else if (gid && sid) {
      var t = $('#nav-tree .ns-t[data-g="' + CSS.escape(gid) + '"][data-s="' + CSS.escape(sid) + '"]');
      if (t) {
        t.classList.add("active");
        target = t;
        var g2 = t.closest(".ng"); if (g2) g2.classList.add("open");
        var s2 = t.closest(".ns"); if (s2) s2.classList.add("open");
      }
    }
    if (target && typeof target.scrollIntoView === "function") {
      var navEl = $("#nav");
      var r = target.getBoundingClientRect(), nr = navEl.getBoundingClientRect();
      if (r.top < nr.top + 40 || r.bottom > nr.bottom - 10) target.scrollIntoView({ block: "center" });
    }
  }

  // ---------------------------------------------------------------- copy
  function copyFallback(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-2000px";
    ta.style.left = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { ta.setSelectionRange(0, text.length); } catch (e) { /* ignore */ }
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function copyText(text) {
    return new Promise(function (resolve) {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(text).then(function () { resolve(true); }, function () { resolve(copyFallback(text)); });
      } else {
        resolve(copyFallback(text));
      }
    });
  }
  function selectNode(node) {
    try {
      var sel = window.getSelection(), range = document.createRange();
      range.selectNodeContents(node);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) { /* ignore */ }
  }
  function doCopyBlock(btn) {
    var block = btn.closest(".code");
    var pre = block && block.querySelector("pre");
    if (!pre) return;
    var text = pre.textContent.replace(/\n+$/, "");
    // 残っている <X> は全部警告する（反映オフのものも <X> のまま貼られるので別枠で併記）
    var keys = uniq($$(".ph-unset", pre).map(function (p) { return p.dataset.ph; }).filter(Boolean));
    var unset = keys.filter(function (k) { return isOn(k); });
    var off = keys.filter(function (k) { return !isOn(k); });
    copyText(text).then(function (ok) {
      if (ok) {
        var old = btn.textContent;
        btn.textContent = "コピーしました";
        btn.classList.add(keys.length ? "warn" : "ok");
        setTimeout(function () { btn.textContent = old; btn.classList.remove("ok", "warn"); }, 1500);
        if (keys.length) {
          var msg = [];
          if (unset.length) msg.push("未入力: " + unset.join(", "));
          if (off.length) msg.push("反映オフ: " + off.join(", "));
          toast(msg.join(" · "), true);
        }
      } else {
        selectNode(pre);
        toast("コピーできませんでした。選択したので Ctrl+C で", true);
      }
    });
  }

  // ---------------------------------------------------------------- tasks
  function taskKey(id) { return LS.tasks + id; }
  function loadTasks(id) { var v = lsGet(taskKey(id), []); return Array.isArray(v) ? v : []; }
  function saveTasks(id, body) {
    var done = $$(".task-box", body).filter(function (b) { return b.checked; }).map(function (b) { return parseInt(b.dataset.task, 10); });
    if (done.length) lsSet(taskKey(id), done); else lsDel(taskKey(id));
    updateTaskProgress(body);
  }
  function updateTaskProgress(body) {
    var boxes = $$(".task-box", body);
    var p = $("#task-progress");
    if (p) p.textContent = boxes.filter(function (b) { return b.checked; }).length + "/" + boxes.length + " 完了";
  }

  // ---------------------------------------------------------------- note
  var CUR = { noteId: null, body: null };

  function enhanceBody(body, id) {
    // 「構文」セクション（h2.sec-syntax から次の h2 まで）の言語無しブロックは出力例ではなく構文
    var inSyntax = false;
    for (var ci = 0; ci < body.children.length; ci++) {
      var ch = body.children[ci];
      if (ch.tagName === "H2") inSyntax = ch.classList.contains("sec-syntax");
      else if (inSyntax && ch.classList.contains("code-out")) ch.classList.add("code-syntax");
    }
    // コードブロックのツールバー
    $$(".code", body).forEach(function (c) {
      var lang = c.dataset.lang || "";
      var out = c.classList.contains("code-out");
      var syn = c.classList.contains("code-syntax");
      var label = syn ? "構文" : (out ? (lang || (c.closest(".callout-example") ? "出力" : "")) : lang);
      var title = syn ? "構文をコピー" : (out ? "出力例をコピー" : "置換後のコマンドをコピー");
      var bar = el("div", { class: "code-bar" },
        el("span", { class: "lang", text: label }),
        el("button", { type: "button", class: "copy", text: "コピー", title: title }));
      c.appendChild(bar);
      if (!out) { var pre = $("pre", c); if (pre) pre.title = "クリックでコピー"; }
    });
    // 「書き換える場所」表の 1 列目はキー名の対応表なので、置換後も <KEY> 表示を保つ（applyPh が .ph-key を見る）
    $$("h2.sec-vars + .tbl td:first-child .ph", body).forEach(function (ph) { ph.classList.add("ph-key"); });
    // 3 列以上の表はモバイルでカード化できるよう、各セルに見出しを持たせる
    $$(".tbl", body).forEach(function (t) {
      var ths = $$("thead th", t);
      if (ths.length < 3) return;
      t.classList.add("tbl-cards");
      var labels = ths.map(function (th) { return th.textContent.trim(); });
      $$("tbody tr", t).forEach(function (tr) {
        var tds = tr.children;
        for (var i = 0; i < tds.length && i < labels.length; i++) {
          if (labels[i]) tds[i].dataset.label = labels[i];
        }
      });
    });
    // タスク
    var boxes = $$(".task-box", body);
    if (boxes.length) {
      var done = loadTasks(id);
      boxes.forEach(function (b) {
        var n = parseInt(b.dataset.task, 10);
        b.checked = done.indexOf(n) >= 0;
        b.disabled = false;
        var li = b.closest("li");
        if (li) li.classList.toggle("done", b.checked);
        b.addEventListener("change", function () {
          if (li) li.classList.toggle("done", b.checked);
          saveTasks(id, body);
        });
      });
    }
    // 画像（attempts では img/ が無いので壊れたら隠す）
    $$("img.img", body).forEach(function (img) {
      img.addEventListener("error", function () { img.classList.add("broken"); });
      if (img.complete && img.naturalWidth === 0 && img.src) img.classList.add("broken");
    });
    // 見出しクリックで URL を更新（履歴は増やさない）
    $$("h2[id], h3[id]", body).forEach(function (h) {
      h.style.cursor = "pointer";
      h.title = "クリックでこの見出しの URL にする";
      h.addEventListener("click", function (ev) {
        if (ev.target.closest("a")) return;
        try { history.replaceState(null, "", noteHref(id, h.id)); } catch (e) { /* ignore */ }
      });
    });
    applyPh(body);
  }

  function folderSection(folder) {
    var g = D.nav.filter(function (x) { return x.id === "folder"; })[0];
    if (!g) return null;
    var want = folder.replace(/\//g, " / ");
    var s = g.sections.filter(function (x) { return x.title === want; })[0];
    return s ? { g: "folder", s: s.id } : null;
  }

  var NV = { moreOpen: false };   // 「+ 他 N 個」の開閉（ノート内で追加操作を続けられるよう再描画をまたいで保持）
  function noteVarsRow(n) {
    var row = el("div", { class: "note-vars" }, el("span", { class: "lbl", text: "このノートで使う変数" }));
    var known = [], extra = [];
    (n.placeholders || []).forEach(function (k) { (isKnownKey(k) ? known : extra).push(k); });
    known.forEach(function (k) { row.appendChild(makeVarChip(k, { compact: true })); });
    if (extra.length) {
      // 入力欄に無い <X> は 1 つのボタンに畳む（10〜20 個並んで本文を押し下げないように）
      var wrap = el("span", { class: "nv-extra", hidden: !NV.moreOpen });
      extra.forEach(function (k) {
        var b = el("button", { type: "button", class: "chip", text: "+ " + k, title: "<" + k + "> を入力欄に追加する" });
        b.addEventListener("click", function () { addExtra(k, true); });
        wrap.appendChild(b);
      });
      var moreText = function (open) { return (known.length ? "他 " : "穴埋め ") + extra.length + " 個 " + (open ? "▴" : "▾"); };
      var more = el("button", { type: "button", class: "chip nv-more", text: moreText(NV.moreOpen), "aria-expanded": NV.moreOpen ? "true" : "false",
        title: "入力欄に無い穴埋め。開いて押すと入力欄に追加できる" });
      more.addEventListener("click", function () {
        NV.moreOpen = wrap.hidden;
        wrap.hidden = !NV.moreOpen;
        more.setAttribute("aria-expanded", NV.moreOpen ? "true" : "false");
        more.textContent = moreText(NV.moreOpen);
      });
      row.appendChild(more);
      row.appendChild(wrap);
    }
    if (!known.length && !extra.length) row.appendChild(el("span", { class: "muted small", text: "穴埋めなし" }));
    return row;
  }
  function rerenderNoteVars() {
    var old = $("#main .note-vars");
    if (!old || !CUR.noteId || !D.notes[CUR.noteId]) return;
    old.replaceWith(noteVarsRow(D.notes[CUR.noteId]));
  }

  function renderNote(id, slug) {
    var n = D.notes[id];
    var main = $("#main");
    if (!n) { renderNotFound(id); return; }
    var sameNote = CUR.noteId === id && CUR.body && main.contains(CUR.body);
    if (!sameNote) {
      main.textContent = "";
      var frag = document.createDocumentFragment();

      // パンくず
      var crumbs = el("div", { class: "crumbs" }, el("a", { href: "#/", text: SITE }), el("span", { text: "/" }));
      var fs = folderSection(n.folder);
      var parts = n.folder.split("/");
      parts.forEach(function (p, i) {
        var last = i === parts.length - 1;
        if (last && fs) crumbs.appendChild(el("a", { href: secHref(fs.g, fs.s), text: p }));
        else crumbs.appendChild(el("a", { href: "#/all", text: p }));
        if (!last) crumbs.appendChild(el("span", { text: "/" }));
      });
      frag.appendChild(crumbs);

      // タイトル行
      var kindLabel = { tool: "ツール", cve: "CVE", playbook: "プレイブック" }[n.kind] || n.kind;
      var obs = "obsidian://open?vault=" + enc(D.meta.vault_name || "") + "&file=" + enc(n.path.replace(/\.md$/, ""));
      var head = el("div", { class: "note-head" },
        el("h1", { text: n.title }),
        el("span", { class: "badge" + (n.kind === "playbook" ? " badge-accent" : ""), text: kindLabel }),
        el("div", { class: "tools" },
          el("a", { class: "btn btn-sm", href: obs, text: "Obsidian で開く", title: n.path })));
      frag.appendChild(head);

      // パスはパンくずと重複するので出さない（「Obsidian で開く」の title に残す）
      if (n.checked || n.mtime) {
        var meta = el("div", { class: "note-meta" });
        if (n.checked) meta.appendChild(el("span", { class: "badge badge-accent", text: "確認日 " + n.checked }));
        if (n.mtime) meta.appendChild(el("span", { text: "更新 " + n.mtime }));
        frag.appendChild(meta);
      }

      if (n.scene) frag.appendChild(el("p", { class: "note-scene", text: n.scene }));
      if (n.keywords && n.keywords.length) {
        var kw = el("div", { class: "kw-row" }, el("span", { class: "lbl", text: "検索語" }));
        n.keywords.forEach(function (k) {
          var b = el("button", { type: "button", class: "chip", text: k, title: "この語で検索" });
          b.addEventListener("click", function () { openPalette(k); });
          kw.appendChild(b);
        });
        frag.appendChild(kw);
      }

      NV.moreOpen = false;
      frag.appendChild(noteVarsRow(n));

      // 本文（ビルド出力なので innerHTML でよい）。目次・タスク操作より先に作り、本文の実態から判定する
      var body = el("div", { class: "note-body" });
      body.innerHTML = n.html;
      enhanceBody(body, id);

      // 目次
      if (n.headings && n.headings.length) {
        var toc = el("div", { class: "toc" }, el("span", { class: "lbl", text: "目次" }));
        n.headings.forEach(function (h) {
          var special = /^(書き換える場所|詰まったら|関連)$/.test(h.text);
          toc.appendChild(el("a", { href: noteHref(id, h.slug), text: h.text, title: h.text, class: (h.level === 3 ? "toc-h3" : "") + (special ? " toc-sec" : "") }));
        });
        frag.appendChild(toc);
      }
      // タスク操作（本文に .task-box があるノートだけ。目次の有無とは独立）
      if ($(".task-box", body)) {
        var rb = el("button", { type: "button", class: "btn btn-sm", text: "チェックをリセット" });
        rb.addEventListener("click", function () {
          lsDel(taskKey(id));
          $$(".task-box", CUR.body).forEach(function (b) { b.checked = false; var li = b.closest("li"); if (li) li.classList.remove("done"); });
          updateTaskProgress(CUR.body);
          toast("チェックをリセットしました");
        });
        frag.appendChild(el("div", { class: "task-tools" }, el("span", { id: "task-progress", text: "" }), rb));
      }
      frag.appendChild(body);

      // 被リンク
      if (n.backlinks && n.backlinks.length) {
        var bl = el("div", { class: "backlinks" }, el("h2", { text: "このノートへのリンク（" + n.backlinks.length + "）" }));
        var cloud = el("div", { class: "link-cloud" });
        n.backlinks.forEach(function (b) { cloud.appendChild(el("a", { class: "chip", href: noteHref(b), text: noteTitle(b), title: D.notes[b] ? D.notes[b].scene || "" : "" })); });
        bl.appendChild(cloud);
        frag.appendChild(bl);
      }

      main.appendChild(frag);
      CUR.noteId = id;
      CUR.body = body;
      updateTaskProgress(body);
      pushRecent(id);
    }
    document.title = n.title + " | " + SITE;
    setNavActive(id);
    if (slug) scrollToHeading(slug); else if (!sameNote) window.scrollTo(0, 0); else window.scrollTo({ top: 0 });
  }
  function scrollToHeading(slug) {
    var body = CUR.body;
    if (!body) return;
    var target = document.getElementById(slug);
    if (!target || !body.contains(target)) {
      target = $$("h2[id], h3[id]", body).filter(function (h) { return h.id === slug; })[0] || null;
    }
    if (!target) {
      // 「1.-x」のような表記ゆれ（空白/ハイフン）を吸収
      var norm = function (s) { return s.replace(/[\s\-]+/g, "").toLowerCase(); };
      var want = norm(slug);
      target = $$("h2[id], h3[id]", body).filter(function (h) { return norm(h.id) === want; })[0] || null;
    }
    if (target) {
      target.scrollIntoView({ block: "start" });
      target.classList.add("ph-cur");
      setTimeout(function () { target.classList.remove("ph-cur"); }, 1200);
    }
  }

  // ---------------------------------------------------------------- other pages
  // ノート以外の画面に共通の前後処理
  function beginPage(cls) {
    $("#main").textContent = "";
    CUR.noteId = null; CUR.body = null;
    return el("div", { class: "page" + (cls ? " " + cls : "") });
  }
  function endPage(page, title, gid, sid) {
    $("#main").appendChild(page);
    document.title = title;
    setNavActive(null, gid, sid);
    window.scrollTo(0, 0);
  }

  function renderNotFound(id) {
    var page = beginPage("notfound");
    page.appendChild(el("h1", { text: "ノートが見つかりません" }));
    page.appendChild(el("p", { class: "lead" }, "「", el("span", { class: "mono", text: id || "" }), "」というノートは無い。Vault 側で改名・削除された可能性がある。"));
    // 近い名前を提案
    var q = (id || "").toLowerCase();
    var cands = q ? Object.keys(D.notes).filter(function (k) { return k.toLowerCase().indexOf(q) >= 0 || q.indexOf(k.toLowerCase()) >= 0; }).slice(0, 8) : [];
    if (cands.length) {
      page.appendChild(el("p", { class: "muted small", text: "近い名前のノート:" }));
      var ul = el("ul", { class: "list" });
      cands.forEach(function (k) { ul.appendChild(el("li", null, el("a", { class: "t", href: noteHref(k), text: noteTitle(k) }), el("span", { class: "s", text: D.notes[k].scene || "" }))); });
      page.appendChild(ul);
    }
    var actions = el("div", { class: "quick" }, el("a", { class: "btn btn-accent", href: "#/", text: "ホームへ" }));
    var sb = el("button", { type: "button", class: "btn", text: "検索 (Ctrl+K)" });
    sb.addEventListener("click", function () { openPalette(id || ""); });
    actions.appendChild(sb);
    page.appendChild(actions);
    endPage(page, "ノートが見つかりません | " + SITE);
  }

  function entryList(entries, withScene) {
    var ul = el("ul", { class: "list" });
    entries.forEach(function (e) {
      var id = e.note || e.id || e;
      var n = D.notes[id];
      ul.appendChild(el("li", null,
        el("a", { class: "t", href: noteHref(id), text: noteTitle(id) }),
        withScene !== false ? el("span", { class: "s", text: e.scene || (n && n.scene) || "", title: e.scene || (n && n.scene) || "" }) : null));
    });
    return ul;
  }
  function sectionChips(g) {
    var wrap = el("div", { class: "chips" });
    g.sections.forEach(function (s) {
      wrap.appendChild(el("a", { href: secHref(g.id, s.id), title: s.desc || s.title }, s.title, el("span", { class: "n", text: String(s.entries.length) })));
    });
    return wrap;
  }

  function renderHome() {
    var page = beginPage("home");
    page.appendChild(el("h1", { text: D.meta.title || SITE }));
    page.appendChild(el("p", { class: "lead", text: D.meta.subtitle || "" }));

    var quick = el("div", { class: "quick" });
    var sb = el("button", { type: "button", class: "btn btn-accent", text: "検索 (Ctrl+K)" });
    sb.addEventListener("click", function () { openPalette(""); });
    quick.appendChild(sb);
    quick.appendChild(el("span", { class: "muted small" }, el("span", { class: "kbd", text: "/" }), " でも開く · 左のナビは絞り込み可"));
    page.appendChild(quick);

    var grid = el("div", { class: "home-grid" });
    var byId = {};
    D.nav.forEach(function (g) { byId[g.id] = g; });

    // プレイブック
    if (byId.playbook) {
      var pb = el("div", { class: "home-box" }, el("h2", null, "プレイブック", el("span", { class: "cnt", text: String(byId.playbook.sections.reduce(function (a, s) { return a + s.entries.length; }, 0)) })));
      pb.appendChild(el("p", { class: "muted small", text: byId.playbook.desc || "" }));
      byId.playbook.sections.forEach(function (s) { pb.appendChild(entryList(s.entries)); });
      grid.appendChild(pb);
    }
    // 最近
    var recent = getRecent();
    var rb = el("div", { class: "home-box" }, el("h2", null, "最近見たノート", el("span", { class: "cnt", text: String(recent.length) })));
    if (recent.length) rb.appendChild(entryList(recent.map(function (id) { return { note: id }; })));
    else rb.appendChild(el("p", { class: "muted small", text: "まだありません。開いたノートがここに並ぶ。" }));
    grid.appendChild(rb);
    // ポート
    if (byId.port) {
      var pt = el("div", { class: "home-box" }, el("h2", null, byId.port.title, el("span", { class: "cnt", text: String(byId.port.sections.length) })));
      pt.appendChild(el("p", { class: "muted small", text: byId.port.desc || "" }));
      pt.appendChild(sectionChips(byId.port));
      grid.appendChild(pt);
    }
    // 状況
    if (byId.situation) {
      var st = el("div", { class: "home-box" }, el("h2", null, byId.situation.title, el("span", { class: "cnt", text: String(byId.situation.sections.length) })));
      st.appendChild(el("p", { class: "muted small", text: byId.situation.desc || "" }));
      st.appendChild(sectionChips(byId.situation));
      grid.appendChild(st);
    }
    // CVE
    if (byId.cve) {
      var cv = el("div", { class: "home-box" }, el("h2", null, byId.cve.title, el("span", { class: "cnt", text: String(byId.cve.sections.reduce(function (a, s) { return a + s.entries.length; }, 0)) })));
      cv.appendChild(el("p", { class: "muted small", text: byId.cve.desc || "" }));
      byId.cve.sections.forEach(function (s) { cv.appendChild(entryList(s.entries)); });
      grid.appendChild(cv);
    }
    // 外部
    if (D.external && D.external.length) {
      var ex = el("div", { class: "home-box" }, el("h2", null, "外部リファレンス", el("span", { class: "cnt", text: String(D.external.length) })));
      var ul = el("ul", { class: "list" });
      D.external.forEach(function (e) {
        ul.appendChild(el("li", null, el("a", { class: "t ext", href: e.url, target: "_blank", rel: "noopener noreferrer", text: e.title }), el("span", { class: "s", text: e.scene || "" })));
      });
      ex.appendChild(ul);
      ex.appendChild(el("p", { class: "small" }, el("a", { href: "#/ext", text: "一覧 →" })));
      grid.appendChild(ex);
    }
    page.appendChild(grid);

    var c = filledCount();
    page.appendChild(el("div", { class: "home-meta", text: "ノート " + Object.keys(D.notes).length + " 本 · 生成 " + (D.meta.built_at || "?") + " · " + (D.meta.generator || "") + " · 変数 " + c.n + "/" + c.total + " 入力済み" + (D.orphans && D.orphans.length ? " · MOC 未掲載 " + D.orphans.length : "") }));
    endPage(page, SITE);
  }

  function renderSection(gid, sid) {
    var g = D.nav.filter(function (x) { return x.id === gid; })[0];
    var s = g && g.sections.filter(function (x) { return x.id === sid; })[0];
    if (!s) { renderNotFound(gid + "/" + sid); return; }
    var page = beginPage("sec-table");
    page.appendChild(el("div", { class: "crumbs" }, el("a", { href: "#/", text: SITE }), el("span", { text: "/" }), el("span", { text: g.title })));
    page.appendChild(el("h1", null, s.title, el("span", { class: "cnt badge", text: s.entries.length + " 本" })));
    if (s.desc) page.appendChild(el("p", { class: "lead", text: s.desc }));
    var tbl = el("div", { class: "tbl" });
    var table = el("table", null, el("thead", null, el("tr", null, el("th", { text: "引きたい状況" }), el("th", { text: "ノート" }), el("th", { text: "検索語" }))));
    var tb = el("tbody");
    var lastSub = null;
    s.entries.forEach(function (e) {
      if (e.sub && e.sub !== lastSub) {
        tb.appendChild(el("tr", { class: "sub-row" }, el("td", { colspan: "3", text: e.sub })));
        lastSub = e.sub;
      }
      var noteCell = el("td", null, el("a", { href: noteHref(e.note), text: noteTitle(e.note) }));
      (e.also || []).forEach(function (a) { noteCell.appendChild(el("span", { class: "also" }, " / ", el("a", { href: noteHref(a), text: noteTitle(a) }))); });
      tb.appendChild(el("tr", null, el("td", { text: e.scene || "" }), noteCell, el("td", { class: "kw", text: e.keywords || "" })));
    });
    table.appendChild(tb);
    tbl.appendChild(table);
    page.appendChild(tbl);
    // 同じグループ内の他セクション
    var others = el("div", { class: "chips" });
    g.sections.forEach(function (x) { if (x.id !== s.id) others.appendChild(el("a", { href: secHref(g.id, x.id), text: x.title })); });
    if (others.childNodes.length) {
      page.appendChild(el("h2", { text: g.title + " の他のセクション" }));
      page.appendChild(others);
    }
    endPage(page, s.title + " | " + SITE, gid, sid);
  }

  function renderAll() {
    var page = beginPage("");
    page.appendChild(el("h1", null, "全ノート（フォルダ順）", el("span", { class: "cnt badge", text: Object.keys(D.notes).length + " 本" })));
    var g = D.nav.filter(function (x) { return x.id === "folder"; })[0];
    if (g) {
      var jump = el("div", { class: "chips" });
      g.sections.forEach(function (s) { jump.appendChild(el("a", { href: "#/all", dataset: { jump: "f-" + s.id } }, s.title, el("span", { class: "n", text: String(s.entries.length) }))); });
      jump.addEventListener("click", function (ev) {
        var a = ev.target.closest("a[data-jump]");
        if (!a) return;
        ev.preventDefault();
        var t = document.getElementById(a.dataset.jump);
        if (t) t.scrollIntoView({ block: "start" });
      });
      page.appendChild(jump);
      g.sections.forEach(function (s) {
        page.appendChild(el("h2", { id: "f-" + s.id, style: "scroll-margin-top: calc(var(--top-h, 42px) + 8px)" }, s.title, el("span", { class: "cnt", text: String(s.entries.length) })));
        page.appendChild(entryList(s.entries));
      });
    } else {
      page.appendChild(entryList(Object.keys(D.notes).sort().map(function (id) { return { note: id }; })));
    }
    endPage(page, "全ノート | " + SITE);
  }

  function renderExt() {
    var page = beginPage("");
    page.appendChild(el("h1", { text: "外部リファレンス" }));
    page.appendChild(el("p", { class: "lead", text: "Vault に無いものを引く先。別タブで開く（試験 VM では通信不可の場合あり）。" }));
    var ul = el("ul", { class: "list ext-list" });
    (D.external || []).forEach(function (e) {
      ul.appendChild(el("li", null,
        el("a", { class: "ext", href: e.url, target: "_blank", rel: "noopener noreferrer", text: e.title }),
        e.scene ? el("span", { class: "muted", text: " — " + e.scene }) : null,
        el("span", { class: "u", text: e.url })));
    });
    page.appendChild(ul);
    endPage(page, "外部リファレンス | " + SITE);
  }

  function renderNoData() {
    var main = $("#main");
    main.textContent = "";
    main.appendChild(el("div", { class: "page" },
      el("h1", { text: SITE }),
      el("div", { class: "setup" },
        el("p", null, el("strong", { text: "data.js が読み込めていません。" })),
        el("p", null, "リポジトリ直下で ", el("code", { text: "python3 build.py" }), " を実行して docs/data.js を生成してください。"),
        el("p", { class: "muted small", text: "Vault のノートを直したら ./update.sh（build → commit → push）。" }))));
    document.title = SITE;
  }

  // ---------------------------------------------------------------- router
  function parseRoute() {
    var h = location.hash || "#/";
    if (h.charAt(0) === "#") h = h.slice(1);
    if (h.charAt(0) !== "/") h = "/" + h;
    var parts = h.split("/").slice(1);
    var kind = dec(parts[0] || "");
    if (kind === "") return { kind: "home" };
    if (kind === "n" && parts.length >= 2) return { kind: "note", id: dec(parts[1]), slug: parts.length > 2 ? parts.slice(2).map(dec).join("/") : "" };
    if (kind === "s" && parts.length >= 3) return { kind: "section", g: dec(parts[1]), s: dec(parts[2]) };
    if (kind === "all") return { kind: "all" };
    if (kind === "ext") return { kind: "ext" };
    return { kind: "notfound", id: parts.map(dec).join("/") };
  }
  function route() {
    var r = parseRoute();
    closePalette();
    closeDrawer();
    if (window.innerWidth < 1024) closeVarbar();   // モバイルでは別画面へ移ったら変数バーも畳む
    try {
      if (r.kind === "home") renderHome();
      else if (r.kind === "note") renderNote(r.id, r.slug);
      else if (r.kind === "section") renderSection(r.g, r.s);
      else if (r.kind === "all") renderAll();
      else if (r.kind === "ext") renderExt();
      else renderNotFound(r.id);
    } catch (e) {
      renderNotFound(r.id || "");
      throw e;
    }
    updateTopH();
  }

  // ---------------------------------------------------------------- search
  var IDX = null;
  function buildIndex() {
    var moc = {}, sec = {};
    D.nav.forEach(function (g) {
      g.sections.forEach(function (s) {
        s.entries.forEach(function (e) {
          [e.note].concat(e.also || []).forEach(function (id) {
            if (!moc[id]) moc[id] = [];
            if (e.scene && moc[id].indexOf(e.scene) < 0) moc[id].push(e.scene);
            if (!sec[id]) sec[id] = [];
            if (g.id !== "folder" && sec[id].indexOf(s.title) < 0) sec[id].push(s.title);  // セクション名（例: 1433 - ms-sql-s）も検索対象
          });
        });
      });
    });
    IDX = Object.keys(D.notes).map(function (id) {
      var n = D.notes[id];
      var kw = (n.keywords || []).join(" / ");
      var mocS = (moc[id] || []).filter(function (s) { return s !== n.scene; }).join(" / ");
      var secS = (sec[id] || []).join(" / ");
      return {
        id: id, title: n.title, tl: n.title.toLowerCase(), folder: n.folder,
        kw: kw, kwl: kw.toLowerCase(),
        sec: secS, secl: secS.toLowerCase(),
        moc: mocS, mocl: mocS.toLowerCase(),
        scene: n.scene || "", scenel: (n.scene || "").toLowerCase(),
        heads: (n.headings || []).map(function (h) { return { t: h.text, tl: h.text.toLowerCase(), slug: h.slug }; }),
        cmds: (n.commands || []).map(function (c) { return { t: c.text, tl: c.text.toLowerCase(), c: c.comment || "", cl: (c.comment || "").toLowerCase() }; })
      };
    });
  }
  function search(q) {
    if (!IDX) buildIndex();
    var terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    var out = [];
    for (var i = 0; i < IDX.length; i++) {
      var it = IDX[i], score = 0, ok = true;
      var hit = { head: null, cmd: null, kw: false, moc: false, scene: false, sec: false, title: false };
      for (var t = 0; t < terms.length; t++) {
        var term = terms[t], w = 0;
        if (it.tl.indexOf(term) >= 0) { w = 10 + (it.tl.indexOf(term) === 0 ? 3 : 0); hit.title = true; }
        if (it.kwl.indexOf(term) >= 0) { w = Math.max(w, 6); hit.kw = true; }
        if (it.mocl.indexOf(term) >= 0) { w = Math.max(w, 5); hit.moc = true; }
        if (it.scenel.indexOf(term) >= 0) { w = Math.max(w, 5); hit.scene = true; }
        if (it.secl.indexOf(term) >= 0) { w = Math.max(w, 5); hit.sec = true; }
        {
          for (var h = 0; h < it.heads.length; h++) {
            if (it.heads[h].tl.indexOf(term) >= 0) { w = Math.max(w, 3); if (!hit.head) hit.head = it.heads[h]; break; }
          }
        }
        if (w < 6) {
          for (var c = 0; c < it.cmds.length; c++) {
            if (it.cmds[c].tl.indexOf(term) >= 0 || it.cmds[c].cl.indexOf(term) >= 0) { w = Math.max(w, 2); if (!hit.cmd) hit.cmd = it.cmds[c]; break; }
          }
        }
        if (!w) { ok = false; break; }
        score += w;
      }
      if (!ok) continue;
      score -= Math.min(it.title.length, 60) / 100;
      out.push({ it: it, score: score, hit: hit });
    }
    out.sort(function (a, b) { return b.score - a.score || (a.it.title < b.it.title ? -1 : 1); });
    return out.slice(0, 40);
  }
  // text の中の terms を <mark> で囲んだ断片を返す（textContent のみ使用）
  function markText(text, terms, maxLen) {
    var frag = document.createDocumentFragment();
    var low = text.toLowerCase();
    var first = -1;
    terms.forEach(function (t) { var p = low.indexOf(t); if (p >= 0 && (first < 0 || p < first)) first = p; });
    var start = 0;
    if (maxLen && text.length > maxLen && first > maxLen * 0.4) {
      start = Math.max(0, first - Math.floor(maxLen * 0.4));
    }
    var end = maxLen ? Math.min(text.length, start + maxLen) : text.length;
    if (start > 0) frag.appendChild(document.createTextNode("…"));
    var pos = start;
    while (pos < end) {
      var best = -1, bestLen = 0;
      terms.forEach(function (t) {
        var p = low.indexOf(t, pos);
        if (p >= 0 && p < end && (best < 0 || p < best)) { best = p; bestLen = t.length; }
      });
      if (best < 0) { frag.appendChild(document.createTextNode(text.slice(pos, end))); break; }
      if (best > pos) frag.appendChild(document.createTextNode(text.slice(pos, best)));
      frag.appendChild(el("mark", { text: text.slice(best, best + bestLen) }));
      pos = best + bestLen;
    }
    if (end < text.length) frag.appendChild(document.createTextNode("…"));
    return frag;
  }
  var PAL = { open: false, sel: 0, items: [] };
  function openPalette(preset) {
    var p = $("#palette"), inp = $("#pal-input");
    p.hidden = false;
    PAL.open = true;
    if (typeof preset === "string") inp.value = preset;
    renderPalette();
    inp.focus();
    inp.select();
  }
  function closePalette() {
    if (!PAL.open) return;
    $("#palette").hidden = true;
    PAL.open = false;
  }
  function renderPalette() {
    var inp = $("#pal-input"), list = $("#pal-list");
    var q = inp.value;
    list.textContent = "";
    PAL.items = [];
    PAL.sel = 0;
    var terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      var recent = getRecent();
      list.appendChild(el("li", { class: "pal-sub", text: recent.length ? "最近見たノート" : "ノート名・検索語・コマンドで探す（スペース区切りで AND）" }));
      recent.forEach(function (id) {
        var n = D.notes[id];
        PAL.items.push({ href: noteHref(id) });
        list.appendChild(palItem(n.title, null, n.folder, n.scene || "", [], true));
      });
      refreshPalSel();
      return;
    }
    var res = search(q);
    if (!res.length) {
      list.appendChild(el("li", { class: "pal-empty", text: "一致するノートがありません" }));
      return;
    }
    res.forEach(function (r) {
      var it = r.it, hit = r.hit;
      var href = noteHref(it.id, hit.head && !hit.title ? hit.head.slug : "");  // 見出しを表示する時はその見出しへ飛ぶ
      var sub = null, ex = "", mono = false;
      if (hit.head && !hit.title) { sub = hit.head.t; }
      if (hit.kw) ex = it.kw;
      else if (hit.scene) ex = it.scene;
      else if (hit.moc) ex = it.moc;
      else if (hit.cmd) { ex = hit.cmd.c ? hit.cmd.c + "  $ " + hit.cmd.t : hit.cmd.t; mono = true; }
      else ex = it.scene || it.kw;
      PAL.items.push({ href: href });
      list.appendChild(palItem(it.title, sub, it.folder, ex, terms, !mono));
    });
    refreshPalSel();
  }
  function palItem(title, sub, folder, excerpt, terms, sans) {
    var idx = PAL.items.length - 1;
    var li = el("li", { role: "option", dataset: { i: String(idx) } });
    var r1 = el("div", { class: "r1" }, el("span", { class: "pt" }, terms.length ? markText(title, terms) : title));
    if (sub) r1.appendChild(el("span", { class: "ph2" }, "› ", markText(sub, terms)));
    r1.appendChild(el("span", { class: "pf", text: folder }));
    li.appendChild(r1);
    if (excerpt) li.appendChild(el("div", { class: "r2" + (sans ? " sans" : "") }, markText(excerpt, terms, 140)));
    li.addEventListener("mousemove", function () { if (PAL.sel !== idx) { PAL.sel = idx; refreshPalSel(false); } });
    li.addEventListener("click", function () { go(PAL.items[idx].href); });
    return li;
  }
  function refreshPalSel(scroll) {
    var lis = $$("#pal-list li[role='option']");
    lis.forEach(function (li, i) { li.classList.toggle("sel", i === PAL.sel); li.setAttribute("aria-selected", i === PAL.sel ? "true" : "false"); });
    if (scroll !== false && lis[PAL.sel]) lis[PAL.sel].scrollIntoView({ block: "nearest" });
  }
  function go(href) {
    closePalette();
    if (location.hash === href) route(); else location.hash = href;
  }
  function initPalette() {
    var inp = $("#pal-input");
    inp.addEventListener("input", renderPalette);
    inp.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") { ev.preventDefault(); if (PAL.items.length) { PAL.sel = (PAL.sel + 1) % PAL.items.length; refreshPalSel(); } }
      else if (ev.key === "ArrowUp") { ev.preventDefault(); if (PAL.items.length) { PAL.sel = (PAL.sel - 1 + PAL.items.length) % PAL.items.length; refreshPalSel(); } }
      else if (ev.key === "Enter") { ev.preventDefault(); if (PAL.items[PAL.sel]) go(PAL.items[PAL.sel].href); }
      else if (ev.key === "Escape") { ev.preventDefault(); closePalette(); }
    });
    $("#palette").addEventListener("click", function (ev) { if (ev.target === this) closePalette(); });
    $$(".search-btn").forEach(function (b) { b.addEventListener("click", function () { openPalette(""); }); });
  }
  function isTyping() {
    var a = document.activeElement;
    if (!a) return false;
    var tag = a.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || a.isContentEditable;
  }
  function initKeys() {
    document.addEventListener("keydown", function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && (ev.key === "k" || ev.key === "K")) {
        ev.preventDefault();
        if (PAL.open) closePalette(); else openPalette("");
        return;
      }
      if (ev.key === "Escape") {
        if (PAL.open) { closePalette(); return; }
        if ($("#nav").classList.contains("open")) { closeDrawer(); return; }
        return;
      }
      if (ev.key === "/" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !isTyping() && !PAL.open) {
        ev.preventDefault();
        openPalette("");
      }
    });
  }

  // ---------------------------------------------------------------- boot
  function boot() {
    D = window.CHEATSHEET_DATA || null;
    initTheme();
    if (!D || !D.notes || !D.nav) {
      renderNoData();
      $("#nav-tree").appendChild(el("div", { class: "nav-empty", text: "data.js がありません" }));
      $("#vars-toggle").hidden = true;
      $("#varbar").hidden = true;
      updateTopH();
      return;
    }
    SITE = D.meta.title || SITE;
    $$(".brand").forEach(function (b) { $(".brand-short", b).textContent = D.meta.short || "oscp.sh"; b.title = SITE; });
    initVarbar();
    buildNav();
    renderNavRecent();
    initPalette();
    initKeys();

    // クリック委譲: コピーボタン / 同一 hash のリンク / コード本体クリックでコピー
    $("#main").addEventListener("click", function (ev) {
      var btn = ev.target.closest("button.copy");
      if (btn) { ev.preventDefault(); doCopyBlock(btn); return; }
      var a = ev.target.closest("a[href^='#/']");
      if (a) {
        // hash が今と同じだと hashchange が起きないので、自前で route() して再スクロールする（パレットの go() と同じ扱い）
        if (ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
        if (dec(a.getAttribute("href")) === dec(location.hash)) { ev.preventDefault(); route(); }
        return;
      }
      var pre = ev.target.closest(".code:not(.code-out) > pre");
      if (pre) {
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;          // 範囲選択中はコピーしない
        var cb = $(".code-bar .copy", pre.parentNode);
        if (cb) doCopyBlock(cb);
      }
    });

    window.addEventListener("hashchange", route);
    window.addEventListener("resize", updateTopH);
    if (window.ResizeObserver) { new ResizeObserver(updateTopH).observe($("#top")); }
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: light)");
      var onScheme = function (e) { if (lsGet(LS.theme, null) === null) setTheme(e.matches ? "light" : "dark", false); };
      if (mq.addEventListener) mq.addEventListener("change", onScheme); else if (mq.addListener) mq.addListener(onScheme);
    }
    route();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
