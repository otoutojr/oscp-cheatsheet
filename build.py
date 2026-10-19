#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build.py — Obsidian Vault のチートシート（10/11/12/13/14）を静的サイト docs/ に変換する。

使い方:
  python3 build.py                 # config.json を読んで docs/ を生成
  python3 build.py --check         # 生成せず、変換の健全性チェックだけを表示（問題があれば終了コード 1）
  python3 build.py --vault PATH    # Vault のパスを上書き
  python3 build.py --out DIR       # 出力先ディレクトリを上書き
  python3 build.py --no-single     # 単一ファイル版（oscp-cheatsheet.html）を作らない

依存: Python 3.8+ の標準ライブラリのみ。
データ契約と HTML 規約は DESIGN.md を参照。
"""
from __future__ import annotations

import argparse
import datetime as _dt
import html
import json
import os
import re
import shutil
import sys
import urllib.parse
from pathlib import Path

VERSION = "1.0"

# ---------------------------------------------------------------------------
# 正規表現
# ---------------------------------------------------------------------------
PH_RE = re.compile(r"<([A-Z][A-Z0-9_]*)>")                     # <VICTIM_IP> 形式のプレースホルダ（大文字のみ）
FENCE_RE = re.compile(r"^(\s*)(`{3,}|~{3,})\s*([^`\s]*)\s*(.*)$")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*$")
QUOTE_RE = re.compile(r"^\s{0,3}>(.*)$")
LIST_RE = re.compile(r"^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$")
TASK_RE = re.compile(r"^\[([ xX])\]\s+(.*)$")
TABLE_SEP_RE = re.compile(r"^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$")
HR_RE = re.compile(r"^\s{0,3}([-*_])(\s*\1){2,}\s*$")
CALLOUT_RE = re.compile(r"^\[!([A-Za-z0-9_-]+)\]([-+]?)\s*(.*)$")
CODE_SPAN_RE = re.compile(r"(`+)(.+?)\1", re.S)
WIKILINK_RE = re.compile(r"\[\[([^\]]+?)\]\]")
EMBED_RE = re.compile(r"!\[\[([^\]]+?)\]\]")
MDLINK_RE = re.compile(r"\[([^\]]+)\]\((https?://(?:[^()\s]|\([^()\s]*\))+)\)")
URL_RE = re.compile(r"(?<![\w\"'`=/])(https?://[^\s<>\"`\x00]+)")
ESCAPE_RE = re.compile(r"\\([\\`*_{}\[\]()#+\-.!|<>~=])")
META_RE = re.compile(r"^(?:>\s*)?\*{0,2}(?:日本語)?(検索語|引く場面|確認日)\s*[:：]\s*(.*?)\*{0,2}\s*$")

IMAGE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp")

# 言語ごとのコメント記法（先頭行キャプション抽出と、残ったコメント行の着色に使う）
COMMENT_PREFIX = {
    "bash": ("#",), "sh": ("#",), "zsh": ("#",), "shell": ("#",), "console": ("#",),
    "python": ("#",), "py": ("#",), "ruby": ("#",), "perl": ("#",), "yaml": ("#",), "toml": ("#",),
    "powershell": ("#",), "ps1": ("#",), "pwsh": ("#",),
    "cmd": ("::", "rem "), "bat": ("::", "rem "), "batch": ("::", "rem "), "dos": ("::", "rem "),
    "sql": ("--",), "mysql": ("--",), "postgresql": ("--",), "psql": ("--",), "tsql": ("--",),
    "cypher": ("//",), "groovy": ("//",), "c": ("//",), "cpp": ("//",), "java": ("//",),
    "javascript": ("//",), "js": ("//",), "php": ("//",), "go": ("//",), "rust": ("//",), "csharp": ("//",), "cs": ("//",),
}

CALLOUT_DEFAULT_TITLE = {
    "example": "出力例", "note": "メモ", "warning": "注意", "caution": "注意", "attention": "注意",
    "tip": "ヒント", "hint": "ヒント", "important": "重要", "info": "情報", "danger": "危険", "error": "危険",
    "bug": "不具合", "quote": "引用", "cite": "引用", "todo": "TODO", "success": "成功", "check": "成功", "done": "成功",
    "question": "疑問", "help": "疑問", "faq": "疑問", "failure": "失敗", "fail": "失敗", "missing": "失敗",
    "abstract": "要約", "summary": "要約", "tldr": "要約",
}

SECTION_CLASS = {
    "書き換える場所": "sec-vars",
    "詰まったら": "sec-stuck",
    "関連": "sec-related",
    "その他のオプション": "sec-options",
    "構文": "sec-syntax",
}

GROUP_ID_BY_NUMBER = {1: "port", 2: "situation", 3: "cve", 4: "external"}


# ---------------------------------------------------------------------------
# 小道具
# ---------------------------------------------------------------------------
def esc(s: str) -> str:
    return html.escape(s, quote=False)


def esc_attr(s: str) -> str:
    return html.escape(s, quote=True)


def enc(s: str) -> str:
    """JS の encodeURIComponent 相当（decodeURIComponent で元に戻る範囲で十分）。"""
    return urllib.parse.quote(s, safe="")


def make_slug(text: str) -> str:
    return re.sub(r"\s+", "-", text.strip())


def heading_plain(raw: str) -> str:
    """見出しの Markdown 装飾を剥がしてプレーンテキストにする（id / 目次 / [[#見出し]] 解決に使う）。"""
    t = re.sub(r"\s+#+\s*$", "", raw)
    t = re.sub(r"\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", lambda m: (m.group(2) or m.group(1) or ""), t)
    t = t.replace("`", "")
    t = re.sub(r"\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*", r"\1", t)
    t = re.sub(r"(?<!\*)\*\*(?=[^\s*])(.+?)(?<=[^\s*])\*\*(?!\*)", r"\1", t)
    t = re.sub(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])", r"\1", t)
    t = re.sub(r"(?<!\w)__(?=\S)(.+?)(?<=\S)__(?!\w)", r"\1", t)
    t = re.sub(r"(?<!\w)_(?=[^\s_])(.+?)(?<=[^\s_])_(?!\w)", r"\1", t)
    t = t.replace("==", "")
    return re.sub(r"\s+", " ", t).strip()


def dedent_cols(line: str, cols: int) -> str:
    """先頭の空白を cols 桁ぶんだけ落とす（タブは 4 桁刻み）。本文中のタブはそのまま残す。"""
    col, i = 0, 0
    while i < len(line) and col < cols and line[i] in " \t":
        col += (4 - col % 4) if line[i] == "\t" else 1
        i += 1
    return line[i:]


def strip_md(text: str) -> str:
    """MOC の説明文などを平文にする。"""
    t = text.strip()
    t = re.sub(r"\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", lambda m: (m.group(2) or m.group(1) or ""), t)
    t = t.replace("**", "").replace("==", "").replace("`", "")
    t = t.replace("\\|", "|")
    return t.strip()


def section_slug(title: str) -> str:
    s = title.strip().lower()
    s = re.sub(r"[^\w぀-ヿ㐀-鿿豈-﫿]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "section"


def comment_prefixes(lang: str):
    return COMMENT_PREFIX.get(lang, ())


def is_comment_line(lang: str, line: str) -> bool:
    s = line.lstrip()
    for p in comment_prefixes(lang):
        if p == "#":
            if s.startswith("#") and not s.startswith("#!"):
                return True
        elif p.endswith(" "):
            if s.lower().startswith(p):
                return True
        elif s.startswith(p):
            return True
    return False


def strip_comment_prefix(lang: str, line: str) -> str:
    s = line.strip()
    for p in comment_prefixes(lang):
        if p.endswith(" "):
            if s.lower().startswith(p):
                return s[len(p):].strip()
        elif s.startswith(p):
            return s[len(p):].strip()
    return s


def split_table_row(row: str):
    """GFM の表の 1 行をセルに分ける。インラインコード内の | と \\| は区切りにしない。"""
    s = row.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    cells, cur, in_code, i = [], [], False, 0
    while i < len(s):
        ch = s[i]
        if ch == "\\" and i + 1 < len(s) and s[i + 1] == "|":
            cur.append("|")
            i += 2
            continue
        if ch == "`":
            in_code = not in_code
            cur.append(ch)
            i += 1
            continue
        if ch == "|" and not in_code:
            cells.append("".join(cur).strip())
            cur = []
            i += 1
            continue
        cur.append(ch)
        i += 1
    cells.append("".join(cur).strip())
    return cells


def is_table_start(lines, i) -> bool:
    return "|" in lines[i] and i + 1 < len(lines) and "|" in lines[i + 1] and bool(TABLE_SEP_RE.match(lines[i + 1])) \
        and not FENCE_RE.match(lines[i]) and not HEADING_RE.match(lines[i]) and not QUOTE_RE.match(lines[i])


# ---------------------------------------------------------------------------
# Markdown（Obsidian 方言）→ HTML
# ---------------------------------------------------------------------------
class Converter:
    def __init__(self, self_id: str, resolve_note, resolve_image, warn):
        self.self_id = self_id
        self.resolve_note = resolve_note      # name -> id | None
        self.resolve_image = resolve_image    # name -> 'img/x.png' | None
        self.warn = warn                      # (kind, message) -> None
        self.headings = []                    # [{level, text, slug}]
        self.slug_seen = {}
        self.placeholders = []                # 出現順（重複あり）
        self.links = []                       # 解決できた id（重複あり）
        self.commands = []                    # [{lang, comment, text}]
        self.task_counter = 0

    # ---- ブロック ----------------------------------------------------------
    def convert(self, lines) -> str:
        return self.parse_blocks(list(lines))

    def parse_blocks(self, lines) -> str:
        out = []
        i, n = 0, len(lines)
        while i < n:
            line = lines[i]
            if not line.strip():
                i += 1
                continue

            m = FENCE_RE.match(line)
            if m:
                indent = len(m.group(1))
                fence = m.group(2)
                lang = m.group(3).lower()
                close_re = re.compile(r"^\s*" + re.escape(fence[0]) + "{" + str(len(fence)) + r",}\s*$")
                body, j, closed = [], i + 1, False
                while j < n:
                    if close_re.match(lines[j]):
                        closed = True
                        break
                    l = lines[j]
                    if indent and l[:indent].strip() == "":
                        l = l[indent:]
                    body.append(l)
                    j += 1
                if not closed:
                    self.warn("fence", "閉じていないコードブロック（``` が足りない）")
                out.append(self.render_code(lang, body))
                i = j + 1 if closed else j
                continue

            m = HEADING_RE.match(line)
            if m:
                out.append(self.render_heading(len(m.group(1)), m.group(2)))
                i += 1
                continue

            if HR_RE.match(line):
                out.append("<hr>")
                i += 1
                continue

            if QUOTE_RE.match(line):
                inner, j = [], i
                while j < n and QUOTE_RE.match(lines[j]):
                    rest = QUOTE_RE.match(lines[j]).group(1)
                    if rest.startswith(" "):
                        rest = rest[1:]
                    inner.append(rest)
                    j += 1
                out.append(self.render_quote(inner))
                i = j
                continue

            if is_table_start(lines, i):
                rows, j = [], i + 2
                while j < n and lines[j].strip() and "|" in lines[j] \
                        and not FENCE_RE.match(lines[j]) and not HEADING_RE.match(lines[j]) and not QUOTE_RE.match(lines[j]):
                    rows.append(lines[j])
                    j += 1
                out.append(self.render_table(lines[i], lines[i + 1], rows))
                i = j
                continue

            if LIST_RE.match(line):
                i, html_ = self.parse_list(lines, i)
                out.append(html_)
                continue

            # 段落
            para, j = [], i
            while j < n:
                l = lines[j]
                if not l.strip():
                    break
                if j > i and (FENCE_RE.match(l) or HEADING_RE.match(l) or QUOTE_RE.match(l) or LIST_RE.match(l) or HR_RE.match(l)):
                    break
                if j > i and is_table_start(lines, j):
                    break
                para.append(l)
                j += 1
            out.append("<p>" + self.inline("\n".join(x.strip() for x in para)) + "</p>")
            i = j
        return "\n".join(out)

    def parse_list(self, lines, i):
        n = len(lines)
        m = LIST_RE.match(lines[i])
        base_indent = len(m.group(1).expandtabs(4))
        ordered = m.group(2)[0].isdigit()
        start = int(m.group(2)[:-1]) if ordered else None
        items = []
        j = i

        def same_level(mm):
            return mm and len(mm.group(1).expandtabs(4)) == base_indent and (mm.group(2)[0].isdigit() == ordered)

        while j < n:
            mm = LIST_RE.match(lines[j])
            if not same_level(mm):
                break
            content_indent = len(mm.group(1).expandtabs(4)) + len(mm.group(2)) + 1
            item = [mm.group(3)]
            j += 1
            while j < n:
                l2 = lines[j]
                if not l2.strip():
                    k = j + 1
                    while k < n and not lines[k].strip():
                        k += 1
                    if k >= n:
                        j = k
                        break
                    nxt = lines[k].expandtabs(4)
                    ind = len(nxt) - len(nxt.lstrip(" "))
                    m3 = LIST_RE.match(nxt)
                    if same_level(m3):
                        j = k          # 空行を挟んだ兄弟項目（loose list）
                        break
                    if ind > base_indent:
                        item.append("")  # 項目内の段落区切り
                        j = k
                        continue
                    break              # リスト終了（空行は親に任せる）
                l2x = l2.expandtabs(4)
                ind = len(l2x) - len(l2x.lstrip(" "))
                m3 = LIST_RE.match(l2x)
                if same_level(m3):
                    break
                if m3 and len(m3.group(1).expandtabs(4)) < base_indent:
                    break
                if ind > base_indent:
                    cut = content_indent if ind >= content_indent else ind
                    item.append(dedent_cols(l2, cut))
                    j += 1
                    continue
                # 字下げ無しの継続行（lazy continuation）。ブロック開始なら終わり
                if FENCE_RE.match(l2) or HEADING_RE.match(l2) or QUOTE_RE.match(l2) or HR_RE.match(l2) or m3 or is_table_start(lines, j):
                    break
                item.append(l2.strip())
                j += 1
            items.append(item)

        tag = "ol" if ordered else "ul"
        attrs = f' start="{start}"' if ordered and start not in (None, 1) else ""
        parts = [f"<{tag}{attrs}>"]
        for item in items:
            first = item[0]
            rest = item[1:]
            cls = ""
            prefix = ""
            t = TASK_RE.match(first)
            if t:
                idx = self.task_counter
                self.task_counter += 1
                checked = " checked" if t.group(1).lower() == "x" else ""
                prefix = f'<input type="checkbox" class="task-box" data-task="{idx}"{checked}> '
                first = t.group(2)
                cls = ' class="task"'
            plain_rest = all(x.strip() and not (LIST_RE.match(x) or FENCE_RE.match(x) or QUOTE_RE.match(x) or HEADING_RE.match(x) or "|" in x) for x in rest)
            if not rest:
                body = self.inline(first)
            elif plain_rest:
                body = self.inline("\n".join([first] + [x.strip() for x in rest]))
            else:
                body = self.inline(first) + "\n" + self.parse_blocks(rest)
            parts.append(f"<li{cls}>{prefix}{body}</li>")
        parts.append(f"</{tag}>")
        return j, "\n".join(parts)

    # ---- 個別要素 -------------------------------------------------------------
    def render_heading(self, level: int, raw: str) -> str:
        raw = re.sub(r"\s+#+\s*$", "", raw)
        plain = heading_plain(raw)
        slug = make_slug(plain)
        base, k = slug, 2
        while slug in self.slug_seen:
            slug = f"{base}-{k}"
            k += 1
        self.slug_seen[slug] = True
        self.headings.append({"level": level, "text": plain, "slug": slug})
        cls = SECTION_CLASS.get(plain)
        cls_attr = f' class="{cls}"' if cls else ""
        return f'<h{level} id="{esc_attr(slug)}"{cls_attr}>{self.inline(raw)}</h{level}>'

    def code_text(self, s: str) -> str:
        out, pos = [], 0
        for m in PH_RE.finditer(s):
            out.append(esc(s[pos:m.start()]))
            key = m.group(1)
            self.placeholders.append(key)
            out.append(f'<span class="ph" data-ph="{key}">&lt;{key}&gt;</span>')
            pos = m.end()
        out.append(esc(s[pos:]))
        return "".join(out)

    def render_code(self, lang: str, body) -> str:
        lines = list(body)
        # 末尾の空行を落とす
        while lines and not lines[-1].strip():
            lines.pop()
        caption = None
        if lang and comment_prefixes(lang) and len(lines) >= 2 and is_comment_line(lang, lines[0]):
            caption = strip_comment_prefix(lang, lines[0])
            lines = lines[1:]
            while lines and not lines[0].strip():
                lines.pop(0)
        rendered = []
        for l in lines:
            if lang and comment_prefixes(lang) and is_comment_line(lang, l):
                rendered.append(f'<span class="c">{self.code_text(l)}</span>')
            else:
                rendered.append(self.code_text(l))
        code_html = "\n".join(rendered)
        text = "\n".join(lines)
        if lang:
            self.commands.append({"lang": lang, "comment": caption or "", "text": text[:4000]})
        cls = "code" if lang else "code code-out"
        cap_html = f'<div class="code-cap">{self.inline(caption)}</div>' if caption else ""
        return f'<div class="{cls}" data-lang="{esc_attr(lang)}">{cap_html}<pre><code>{code_html}</code></pre></div>'

    def render_quote(self, inner) -> str:
        idx = next((k for k, l in enumerate(inner) if l.strip()), None)
        if idx is not None:
            m = CALLOUT_RE.match(inner[idx].strip())
            if m:
                ctype = m.group(1).lower()
                fold = m.group(2)
                title = m.group(3).strip()
                title_html = self.inline(title) if title else esc(CALLOUT_DEFAULT_TITLE.get(ctype, ctype))
                body_html = self.parse_blocks(inner[idx + 1:])
                if fold:
                    open_attr = " open" if fold == "+" else ""
                    return (f'<details class="callout callout-{esc_attr(ctype)}"{open_attr}><summary>{title_html}</summary>'
                            f'<div class="callout-body">{body_html}</div></details>')
                return (f'<div class="callout callout-{esc_attr(ctype)}"><div class="callout-title">{title_html}</div>'
                        f'<div class="callout-body">{body_html}</div></div>')
        return "<blockquote>" + self.parse_blocks(inner) + "</blockquote>"

    def render_table(self, header: str, sep: str, rows) -> str:
        heads = split_table_row(header)
        aligns = []
        for c in split_table_row(sep):
            c = c.strip()
            if c.startswith(":") and c.endswith(":"):
                aligns.append("center")
            elif c.endswith(":"):
                aligns.append("right")
            elif c.startswith(":"):
                aligns.append("left")
            else:
                aligns.append("")
        ncol = len(heads)
        aligns = (aligns + [""] * ncol)[:ncol]

        def style(k):
            return f' style="text-align:{aligns[k]}"' if aligns[k] else ""

        out = ['<div class="tbl"><table><thead><tr>']
        for k, h in enumerate(heads):
            out.append(f"<th{style(k)}>{self.inline(h)}</th>")
        out.append("</tr></thead><tbody>")
        for r in rows:
            cells = split_table_row(r)
            cells = (cells + [""] * ncol)[:ncol]
            out.append("<tr>")
            for k, c in enumerate(cells):
                out.append(f"<td{style(k)}>{self.inline(c)}</td>")
            out.append("</tr>")
        out.append("</tbody></table></div>")
        return "".join(out)

    def _restore_tokens(self, s: str) -> str:
        """inline() が退避した \x00N\x00 トークンを平文（タグ無し）に戻す。"""
        toks = getattr(self, "_tokens", None)
        if not toks or "\x00" not in s:
            return s

        def rep_tok(m):
            return html.unescape(re.sub(r"<[^>]+>", "", toks[int(m.group(1))]))

        for _ in range(8):
            if "\x00" not in s:
                break
            s = re.sub(r"\x00(\d+)\x00", rep_tok, s)
        return s

    def render_wikilink(self, inner: str) -> str:
        inner = self._restore_tokens(inner.replace("\\|", "|"))
        target, _, alias = inner.partition("|")
        note, _, head = target.partition("#")
        note, head, alias = note.strip(), head.strip(), alias.strip()
        if note.lower().endswith(".md"):
            note = note[:-3]
        if "/" in note:
            note = note.rsplit("/", 1)[-1]
        if alias:
            label = alias
        elif note and head:
            label = f"{note} › {heading_plain(head)}"
        elif head:
            label = heading_plain(head)
        else:
            label = note
        if note == "00 Cheatsheet MOC":
            return f'<a class="wl" href="#/">{esc(label)}</a>'
        nid = self.self_id if not note else self.resolve_note(note)
        if nid is None:
            self.warn("deadlink", f"存在しないノートへのリンク [[{target}]]")
            return f'<span class="wl wl-dead" title="Vault にこの名前のノートが無い">{esc(label)}</span>'
        href = "#/n/" + enc(nid)
        if head:
            href += "/" + enc(make_slug(heading_plain(head)))
        if nid != self.self_id:
            self.links.append(nid)
        return f'<a class="wl" href="{esc_attr(href)}" data-note="{esc_attr(nid)}">{esc(label)}</a>'

    def render_embed(self, inner: str) -> str:
        name = inner.split("|")[0].strip()
        if name.lower().endswith(IMAGE_EXT):
            src = self.resolve_image(name)
            if src:
                return f'<img class="img" src="{esc_attr(src)}" alt="{esc_attr(name)}" loading="lazy">'
            self.warn("image", f"画像が見つからない ![[{name}]]")
            return f'<span class="wl wl-dead" title="画像が見つからない">{esc(name)}</span>'
        return self.render_wikilink(inner)

    # ---- インライン -----------------------------------------------------------
    def inline(self, text: str) -> str:
        tokens = []
        self._tokens = tokens

        def tok(h: str) -> str:
            tokens.append(h)
            return f"\x00{len(tokens) - 1}\x00"

        def code_span(m):
            content = m.group(2)
            if len(content) >= 2 and content[0] == " " and content[-1] == " " and content.strip():
                content = content[1:-1]
            return tok("<code>" + self.code_text(content) + "</code>")

        text = CODE_SPAN_RE.sub(code_span, text)
        text = EMBED_RE.sub(lambda m: tok(self.render_embed(m.group(1))), text)
        text = WIKILINK_RE.sub(lambda m: tok(self.render_wikilink(m.group(1))), text)
        text = ESCAPE_RE.sub(lambda m: tok(esc(m.group(1))), text)
        text = MDLINK_RE.sub(
            lambda m: tok(f'<a class="ext" href="{esc_attr(m.group(2))}" target="_blank" rel="noopener noreferrer">{esc(self._restore_tokens(m.group(1)))}</a>'),
            text)

        def autolink(m):
            url = m.group(1)
            trail = ""
            while url and url[-1] in ".,;:!?)]}>、。）」』*_~":
                if url[-1] == ")" and url.count("(") >= url.count(")"):
                    break
                trail = url[-1] + trail
                url = url[:-1]
            return tok(f'<a class="ext" href="{esc_attr(url)}" target="_blank" rel="noopener noreferrer">{esc(url)}</a>') + trail

        text = URL_RE.sub(autolink, text)
        text = esc(text)
        # 本文中の <VICTIM_IP> も変数として扱う（コード外でも置換・強調できるように）
        def prose_ph(m):
            self.placeholders.append(m.group(1))
            return f'<span class="ph" data-ph="{m.group(1)}">&lt;{m.group(1)}&gt;</span>'
        text = re.sub(r"&lt;([A-Z][A-Z0-9_]*)&gt;", prose_ph, text)
        text = re.sub(r"\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*", r"<em><strong>\1</strong></em>", text, flags=re.S)
        text = re.sub(r"(?<!\*)\*\*(?=[^\s*])(.+?)(?<=[^\s*])\*\*(?!\*)", r"<strong>\1</strong>", text, flags=re.S)
        text = re.sub(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])", r"<em>\1</em>", text, flags=re.S)
        text = re.sub(r"(?<!\w)__(?=\S)(.+?)(?<=\S)__(?!\w)", r"<strong>\1</strong>", text, flags=re.S)
        text = re.sub(r"(?<!\w)_(?=[^\s_])(.+?)(?<=[^\s_])_(?!\w)", r"<em>\1</em>", text, flags=re.S)
        text = re.sub(r"~~(?=\S)(.+?)(?<=\S)~~", r"<del>\1</del>", text, flags=re.S)
        text = re.sub(r"==(?=\S)(.+?)(?<=\S)==", r"<mark>\1</mark>", text, flags=re.S)
        text = text.replace("\n", "<br>\n")
        for _ in range(8):
            if "\x00" not in text:
                break
            text = re.sub(r"\x00(\d+)\x00", lambda m: tokens[int(m.group(1))], text)
        return text


# ---------------------------------------------------------------------------
# ノート読み込み
# ---------------------------------------------------------------------------
def extract_meta(lines):
    """`> 検索語:` `> 引く場面:` `> 確認日:`（または本文中の `検索語:` 段落）を抜き出し、本文から除く。"""
    meta = {"keywords": [], "scene": "", "checked": None}
    out = []
    in_fence = None
    for l in lines:
        fm = FENCE_RE.match(l)
        if fm:
            if in_fence is None:
                in_fence = fm.group(2)
            elif re.match(r"^\s*" + re.escape(in_fence[0]) + "{" + str(len(in_fence)) + r",}\s*$", l):
                in_fence = None
            out.append(l)
            continue
        if in_fence is None:
            m = META_RE.match(l.strip())
            if m:
                key, val = m.group(1), m.group(2).strip()
                if key == "検索語":
                    meta["keywords"] = [k.strip() for k in re.split(r"\s+/\s+|／", val) if k.strip()]
                elif key == "引く場面":
                    meta["scene"] = strip_md(val)
                else:
                    meta["checked"] = val
                continue
        out.append(l)
    return meta, out


def fidelity_missing(src_lines, html_: str, limit: int = 8):
    """Markdown ソースの語（記法を除いたもの）が HTML 本文から消えていないかを調べ、消えた語を返す。

    コードブロック・インラインコードの中身はそのまま、本文は変換規約と同じ要領で記法を剥がして比較する。
    """
    words = set()

    def add(w: str):
        w = w.strip("|")
        if len(w) < 2 or re.fullmatch(r"[\W_]+", w) or w.lower() == "rem":
            return
        words.add(w)

    in_fence = None
    for raw in src_lines:
        s = re.sub(r"^(?:\s{0,3}>\s?)+", "", raw.rstrip("\n"))
        fm = FENCE_RE.match(s)
        if fm:
            if in_fence is None:
                in_fence = fm.group(2)
            elif re.match(r"^\s*" + re.escape(in_fence[0]) + "{" + str(len(in_fence)) + r",}\s*$", s):
                in_fence = None
            continue
        if in_fence is not None:
            for w in s.split():
                add(w)
            continue
        s = s.strip()
        if not s or (TABLE_SEP_RE.match(s) and "|" in s) or HR_RE.match(s):
            continue
        s = re.sub(r"^#{1,6}\s+", "", s)
        s = re.sub(r"^(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?", "", s)
        s = re.sub(r"^\[![A-Za-z0-9_-]+\][-+]?\s*", "", s)

        def take_code(m):
            for w in m.group(2).split():
                add(w)
            return "\x01"   # 強調記号の判定を壊さないよう、空白ではない印に置き換える

        s = CODE_SPAN_RE.sub(take_code, s)
        s = re.sub(r"!\[\[[^\]]+\]\]", " ", s)
        s = re.sub(r"\[\[([^\]|#]*)#?([^\]|]*)\|([^\]]*)\]\]", r"\3", s)
        s = re.sub(r"\[\[([^\]|#]*)#([^\]|]*)\]\]", r"\1 \2", s)
        s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
        s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r"\1 \2", s)
        s = s.replace("\\|", "|")
        s = re.sub(r"\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*", r"\1", s)
        s = re.sub(r"(?<!\*)\*\*(?=[^\s*])(.+?)(?<=[^\s*])\*\*(?!\*)", r"\1", s)
        s = re.sub(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])", r"\1", s)
        s = re.sub(r"(?<!\w)__(?=\S)(.+?)(?<=\S)__(?!\w)", r"\1", s)
        s = re.sub(r"(?<!\w)_(?=[^\s_])(.+?)(?<=[^\s_])_(?!\w)", r"\1", s)
        s = re.sub(r"~~(?=\S)(.+?)(?<=\S)~~", r"\1", s)
        s = re.sub(r"==(?=\S)(.+?)(?<=\S)==", r"\1", s)
        s = ESCAPE_RE.sub(r"\1", s).replace("\x01", " ")
        for w in s.split():
            add(w)

    def loosen(t: str) -> str:
        return t.replace("\\", "").replace("`", "").replace("[[", "").replace("]]", "")

    text = html.unescape(re.sub(r"<[^>]+>", " ", html_))
    have = set(text.split())
    nospace = re.sub(r"\s+", "", text)
    norm = loosen(nospace)
    missing = []
    for w in sorted(words):
        if w in have:
            continue
        w2 = re.sub(r"\s+", "", w)
        if w2 in nospace:
            continue
        w3 = loosen(w2)
        if w3 and w3 in norm:
            continue
        missing.append(w)
        if len(missing) >= limit:
            break
    return missing


def first_text_line(lines) -> str:
    """scene が無いノート用の代替説明: 最初の本文テキスト行。"""
    in_fence = False
    for l in lines:
        if FENCE_RE.match(l):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        s = l.strip()
        if not s or s.startswith("#") or s.startswith("|") or LIST_RE.match(s):
            continue
        s = re.sub(r"^>\s*", "", s)
        if CALLOUT_RE.match(s):
            continue
        s = strip_md(s)
        return s[:140]
    return ""


def natural_key(s: str):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def collect_notes(vault: Path, folders):
    files = []
    for folder in folders:
        base = vault / folder
        if not base.is_dir():
            print(f"[warn] フォルダが無い: {base}", file=sys.stderr)
            continue
        for p in sorted(base.rglob("*.md"), key=lambda p: natural_key(str(p))):
            if any(part.startswith(".") for part in p.relative_to(vault).parts):
                continue
            files.append(p)
    return files


def index_images(vault: Path, pictures_dir: str):
    idx = {}
    roots = [vault / pictures_dir] if (vault / pictures_dir).is_dir() else []
    roots.append(vault)
    for root in roots:
        for p in root.rglob("*"):
            if p.is_file() and p.suffix.lower() in IMAGE_EXT and ".obsidian" not in p.parts:
                idx.setdefault(p.name, p)
                idx.setdefault(p.name.lower(), p)
    return idx


# ---------------------------------------------------------------------------
# MOC 解析
# ---------------------------------------------------------------------------
def parse_moc(text: str):
    groups = []
    external = []
    cur_group = cur_section = None
    cur_sub = None
    table_mode = None     # 'notes' | 'external' | None
    in_fence = False
    desc_target = None    # 直近の見出し（desc 未設定ならここに入れる）

    def new_section(title):
        nonlocal cur_section, cur_sub, desc_target
        cur_section = {"id": section_slug(title), "title": title, "desc": "", "entries": []}
        cur_group["sections"].append(cur_section)
        cur_sub = None
        desc_target = cur_section

    for raw in text.splitlines():
        line = raw.rstrip("\n")
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        s = line.strip()
        if not s:
            continue
        m = re.match(r"^#\s+(?:(\d+)\.\s*)?(.+)$", s)
        if m:
            if m.group(1) is None:
                cur_group = None
                desc_target = None
                continue
            num = int(m.group(1))
            title = m.group(2).strip()
            cur_group = {"id": GROUP_ID_BY_NUMBER.get(num, section_slug(title)), "num": num, "title": title, "desc": "", "sections": []}
            groups.append(cur_group)
            cur_section = None
            cur_sub = None
            table_mode = None
            desc_target = cur_group
            continue
        m = re.match(r"^##\s+(.+)$", s)
        if m and cur_group is not None:
            new_section(m.group(1).strip())
            table_mode = None
            continue
        m = re.match(r"^###\s+(.+)$", s)
        if m and cur_group is not None:
            if cur_section is None:
                new_section(cur_group["title"])
            cur_sub = m.group(1).strip()
            table_mode = None
            continue
        if cur_group is None:
            continue
        if s.startswith("|"):
            cells = split_table_row(s)
            if TABLE_SEP_RE.match(s):
                continue
            head0 = cells[0] if cells else ""
            if head0 in ("引きたい状況", "状況", "引きたい場面"):
                table_mode = "notes"
                continue
            if head0 in ("サイト", "名前", "リファレンス"):
                table_mode = "external"
                continue
            if table_mode is None:
                table_mode = "external" if cur_group["id"] == "external" else "notes"
            if table_mode == "external":
                if len(cells) >= 3:
                    um = re.search(r"https?://\S+", cells[2])
                    external.append({"title": strip_md(cells[0]), "scene": strip_md(cells[1]), "url": um.group(0) if um else strip_md(cells[2])})
                continue
            if len(cells) >= 2:
                links = re.findall(r"\[\[([^\]|#]+)", cells[1])
                if not links:
                    continue
                if cur_section is None:
                    new_section(cur_group["title"])
                cur_section["entries"].append({
                    "note": links[0].strip(),
                    "also": [x.strip() for x in links[1:]],
                    "scene": strip_md(cells[0]),
                    "keywords": strip_md(cells[2]) if len(cells) >= 3 else "",
                    "sub": cur_sub,
                })
            continue
        if s in ("---", "***"):
            continue
        if desc_target is not None and not desc_target.get("desc"):
            desc_target["desc"] = strip_md(s)
    return groups, external


# ---------------------------------------------------------------------------
# ビルド本体
# ---------------------------------------------------------------------------
def build(cfg: dict, vault: Path, project: Path, out_dir: Path, check_only: bool, single: bool):
    folders = cfg["vault"]["folders"]
    files = collect_notes(vault, folders)
    if not files:
        print(f"[error] ノートが 1 本も見つからない: {vault}", file=sys.stderr)
        return 2

    warnings = []   # (note_id, kind, message)

    # id（ファイル名）→ パス
    id_to_path = {}
    for p in files:
        stem = p.stem
        if stem in id_to_path:
            warnings.append((stem, "dup", f"同名ノートが複数ある: {id_to_path[stem]} と {p.relative_to(vault)}（先勝ち）"))
            continue
        id_to_path[stem] = p
    lower_index = {}
    for k in id_to_path:
        lower_index.setdefault(k.lower(), k)

    def resolve_note(name: str):
        if name in id_to_path:
            return name
        return lower_index.get(name.lower())

    images = index_images(vault, cfg["vault"].get("pictures", "98 Picture"))
    used_images = {}

    def resolve_image(name: str):
        p = images.get(name) or images.get(name.lower())
        if not p:
            return None
        used_images[p.name] = p
        return "img/" + enc(p.name)

    # 00 OSCP Playbook の「[[Recon]] — 説明」行を、引く場面が無いプレイブックの説明に使う
    playbook_desc = {}
    if "00 OSCP Playbook" in id_to_path:
        raw = id_to_path["00 OSCP Playbook"].read_text(encoding="utf-8", errors="replace")
        for m in re.finditer(r"^(?:\d+\.|-)\s+\[\[([^\]|#]+)\]\]\s+[—-]\s+(.+)$", raw, flags=re.M):
            playbook_desc[m.group(1).strip()] = strip_md(m.group(2))

    # 変換
    notes = {}
    ph_counts = {}
    for nid, p in id_to_path.items():
        rel = p.relative_to(vault)
        folder = str(rel.parent).replace(os.sep, "/")
        text = p.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n").replace("﻿", "")
        lines = text.split("\n")
        meta, body_lines = extract_meta(lines)
        conv = Converter(nid, resolve_note, resolve_image, lambda kind, msg, _n=nid: warnings.append((_n, kind, msg)))
        body_html = conv.convert(body_lines)
        top = folder.split("/")[0]
        kind = "cve" if top.startswith("13") else ("playbook" if top.startswith("14") else "tool")
        ph_order = list(dict.fromkeys(conv.placeholders))
        for k in conv.placeholders:
            ph_counts[k] = ph_counts.get(k, 0) + 1
        mtime = _dt.datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d")
        if not meta["keywords"]:
            warnings.append((nid, "meta", "`> 検索語:` が無い"))
        lost = fidelity_missing(body_lines, body_html)
        if lost:
            warnings.append((nid, "fidelity", "本文から消えた語の疑い: " + " ".join(lost)))
        notes[nid] = {
            "id": nid,
            "title": nid,
            "folder": folder,
            "path": str(rel).replace(os.sep, "/"),
            "kind": kind,
            "keywords": meta["keywords"],
            "scene": meta["scene"] or playbook_desc.get(nid) or first_text_line(body_lines),
            "checked": meta["checked"],
            "html": body_html,
            "headings": conv.headings,
            "placeholders": ph_order,
            "links": list(dict.fromkeys(conv.links)),
            "backlinks": [],
            "commands": conv.commands,
            "tasks": conv.task_counter,
            "mtime": mtime,
        }

    for nid, n in notes.items():
        for t in n["links"]:
            if t in notes and nid not in notes[t]["backlinks"]:
                notes[t]["backlinks"].append(nid)
    for n in notes.values():
        n["backlinks"].sort(key=natural_key)

    # MOC → ナビ
    moc_path = vault / cfg["vault"].get("moc", "00 Cheatsheet MOC.md")
    groups, external = [], []
    if moc_path.is_file():
        groups, external = parse_moc(moc_path.read_text(encoding="utf-8", errors="replace"))
    else:
        warnings.append(("(MOC)", "moc", f"MOC が無い: {moc_path}"))

    moc_referenced = set()
    nav = []
    for g in groups:
        if g["id"] == "external":
            continue
        sections = []
        for s in g["sections"]:
            entries = []
            for e in s["entries"]:
                nid = resolve_note(e["note"])
                if nid is None:
                    warnings.append(("(MOC)", "deadlink", f"MOC が存在しないノートを指している [[{e['note']}]]（{g['title']} / {s['title']}）"))
                    continue
                moc_referenced.add(nid)
                also = []
                for a in e["also"]:
                    aid = resolve_note(a)
                    if aid:
                        also.append(aid)
                        moc_referenced.add(aid)
                entries.append({"note": nid, "scene": e["scene"] or notes[nid]["scene"], "keywords": e["keywords"], "sub": e["sub"], "also": also})
            if entries:
                sid, k = s["id"], 2
                while any(x["id"] == sid for x in sections):
                    sid = f"{s['id']}-{k}"
                    k += 1
                sections.append({"id": sid, "title": s["title"], "desc": s["desc"], "entries": entries})
        nav.append({"id": g["id"], "title": g["title"], "desc": g["desc"], "sections": sections})

    # プレイブック（14 Methodology）
    playbook_ids = [n["id"] for n in notes.values() if n["kind"] == "playbook"]
    order = cfg["vault"].get("playbook_order", [])
    playbook_ids.sort(key=lambda x: (order.index(x) if x in order else 999, natural_key(x)))
    pb_entries = []
    for nid in playbook_ids:
        n = notes[nid]
        pb_entries.append({"note": nid, "scene": n["scene"], "keywords": " / ".join(n["keywords"]), "sub": None, "also": []})
        moc_referenced.add(nid)
    if pb_entries:
        nav.insert(0, {"id": "playbook", "title": "プレイブック", "desc": "列挙の道順。次に何をやるか迷ったらここ。", "sections": [
            {"id": "playbook", "title": "14 Methodology", "desc": "上から順に回す。各フェーズの実コマンドはリンク先へ。", "entries": pb_entries}]})

    # フォルダ一覧
    by_folder = {}
    for n in notes.values():
        by_folder.setdefault(n["folder"], []).append(n["id"])
    folder_sections = []
    for folder in sorted(by_folder, key=natural_key):
        ids = sorted(by_folder[folder], key=natural_key)
        folder_sections.append({
            "id": section_slug(folder), "title": folder.replace("/", " / "), "desc": "",
            "entries": [{"note": i, "scene": notes[i]["scene"], "keywords": " / ".join(notes[i]["keywords"]), "sub": None, "also": []} for i in ids],
        })
    nav.append({"id": "folder", "title": "フォルダ一覧", "desc": "Vault のフォルダ構成そのまま。MOC に載っていないノートもここに出る。", "sections": folder_sections})

    orphans = sorted([nid for nid in notes if nid not in moc_referenced], key=natural_key)
    for o in orphans:
        warnings.append((o, "orphan", "00 Cheatsheet MOC に載っていない"))

    variables = []
    for v in cfg.get("variables", []):
        variables.append({
            "key": v["key"], "label": v.get("label", v["key"]), "group": v.get("group", "other"),
            "example": v.get("example", ""), "default": v.get("default", ""),
            "derive": v.get("derive"), "secret": bool(v.get("secret", False)),
        })

    data = {
        "meta": {
            "title": cfg["site"].get("title", "OSCP Cheatsheet"),
            "subtitle": cfg["site"].get("subtitle", ""),
            "short": cfg["site"].get("short", ""),
            "built_at": _dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "vault_name": cfg["vault"].get("name", vault.name),
            "note_count": len(notes),
            "generator": f"build.py {VERSION}",
            "folders": folders,
        },
        "variables": variables,
        "variable_groups": cfg.get("variable_groups", {}),
        "placeholders": dict(sorted(ph_counts.items(), key=lambda kv: (-kv[1], kv[0]))),
        "notes": notes,
        "nav": nav,
        "external": external,
        "orphans": orphans,
    }

    # ---- チェック ---------------------------------------------------------------
    problems = run_checks(notes, warnings)
    if check_only:
        print_report(data, problems, warnings, used_images)
        return 1 if any(p[1] in ("fence", "artifact") for p in problems) else 0

    # ---- 出力 --------------------------------------------------------------------
    src_dir = project / "src"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "img").mkdir(exist_ok=True)
    js = "window.CHEATSHEET_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + ";\n"
    (out_dir / "data.js").write_text(js, encoding="utf-8")
    for name in ("index.html", "app.js", "style.css"):
        srcf = src_dir / name
        if srcf.is_file():
            shutil.copyfile(srcf, out_dir / name)
        else:
            warnings.append(("(src)", "src", f"src/{name} が無い（UI 未配置）"))
    for name, p in used_images.items():
        shutil.copyfile(p, out_dir / "img" / name)
    (out_dir / ".nojekyll").write_text("", encoding="utf-8")
    if single and (src_dir / "index.html").is_file():
        write_single_file(src_dir, js, out_dir / cfg["output"].get("single_file", "oscp-cheatsheet.html"), used_images, out_dir)
    print_report(data, problems, warnings, used_images)
    print(f"\n出力: {out_dir}  (data.js {os.path.getsize(out_dir / 'data.js') // 1024} KB)")
    return 0


def write_single_file(src_dir: Path, data_js: str, dest: Path, used_images: dict, out_dir: Path):
    """index.html に CSS / data / JS を埋め込んだ 1 ファイル版を書く。画像は data URI にする。"""
    import base64
    import mimetypes
    page = (src_dir / "index.html").read_text(encoding="utf-8")
    css = (src_dir / "style.css").read_text(encoding="utf-8") if (src_dir / "style.css").is_file() else ""
    app = (src_dir / "app.js").read_text(encoding="utf-8") if (src_dir / "app.js").is_file() else ""
    inline_data = data_js
    for name, p in used_images.items():
        mime = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        b64 = base64.b64encode(p.read_bytes()).decode("ascii")
        inline_data = inline_data.replace("img/" + enc(name), f"data:{mime};base64,{b64}")
    page = re.sub(r'<link[^>]+href="style\.css"[^>]*>', lambda m: "<style>\n" + css.replace("</style", "<\\/style") + "\n</style>", page, count=1)
    page = re.sub(r'<script[^>]+src="data\.js"[^>]*>\s*</script>', lambda m: "<script>\n" + inline_data + "\n</script>", page, count=1)
    page = re.sub(r'<script[^>]+src="app\.js"[^>]*>\s*</script>', lambda m: "<script>\n" + app.replace("</script", "<\\/script") + "\n</script>", page, count=1)
    dest.write_text(page, encoding="utf-8")


# ---------------------------------------------------------------------------
# チェック（変換し残しの検出）
# ---------------------------------------------------------------------------
ARTIFACT_PATTERNS = [
    ("wikilink の残り", re.compile(r"\[\[")),
    ("太字記号の残り", re.compile(r"\*\*\S.*?\S\*\*")),
    ("表の区切り行の残り", re.compile(r"\|\s*:?-{3,}")),
    ("コードフェンスの残り", re.compile(r"```")),
    ("callout 記法の残り", re.compile(r"\[![a-z]+\]")),
    ("表の行らしきテキスト", re.compile(r"^\s*\|.+\|\s*$", re.M)),
    ("検索語行の残り", re.compile(r"(検索語|引く場面)\s*[:：]")),
]


def run_checks(notes, warnings):
    problems = []
    for nid, n in notes.items():
        h = n["html"]
        stripped = re.sub(r"<pre>.*?</pre>", "", h, flags=re.S)
        stripped = re.sub(r"<code>.*?</code>", "", stripped, flags=re.S)
        text = html.unescape(re.sub(r"<[^>]+>", "", stripped))
        for label, rx in ARTIFACT_PATTERNS:
            m = rx.search(text)
            if m:
                a = max(0, m.start() - 30)
                snippet = text[a:m.start() + 50].replace("\n", "⏎")
                problems.append((nid, "artifact", f"{label}: …{snippet}…"))
        if "\x00" in h:
            problems.append((nid, "artifact", "未展開トークン（NUL 文字）が残っている"))
        if "<em>" in h:
            cnt = h.count("<em>")
            problems.append((nid, "em", f"<em>（* 強調）が {cnt} 箇所。意図した強調か確認"))
    for nid, kind, msg in warnings:
        if kind in ("fence", "deadlink", "image", "dup", "moc", "src", "fidelity"):
            problems.append((nid, kind, msg))
    return problems


def print_report(data, problems, warnings, used_images):
    notes = data["notes"]
    print(f"ノート {len(notes)} 本 / コマンド {sum(len(n['commands']) for n in notes.values())} 個 / "
          f"プレースホルダ {len(data['placeholders'])} 種 / 画像 {len(used_images)} 枚 / 外部リンク {len(data['external'])} 件")
    by_kind = {}
    for n in notes.values():
        by_kind[n["kind"]] = by_kind.get(n["kind"], 0) + 1
    print("  種別: " + ", ".join(f"{k} {v}" for k, v in sorted(by_kind.items())))
    print("  ナビ: " + ", ".join(f"{g['title']}({sum(len(s['entries']) for s in g['sections'])})" for g in data["nav"]))
    top = list(data["placeholders"].items())[:12]
    print("  プレースホルダ上位: " + ", ".join(f"{k}×{v}" for k, v in top))
    errs = [p for p in problems if p[1] in ("fence", "artifact", "dup", "moc", "src", "image", "fidelity")]
    deads = [p for p in problems if p[1] == "deadlink"]
    ems = [p for p in problems if p[1] == "em"]
    orphans = data["orphans"]
    metas = [w for w in warnings if w[1] == "meta"]
    if errs:
        print(f"\n[要確認] 変換し残し・エラー {len(errs)} 件:")
        for nid, kind, msg in errs:
            print(f"  - {nid}: {msg}")
    if deads:
        print(f"\n[情報] 存在しないノートへのリンク {len(deads)} 件:")
        for nid, kind, msg in deads:
            print(f"  - {nid}: {msg}")
    if orphans:
        print(f"\n[情報] MOC に載っていないノート {len(orphans)} 本（フォルダ一覧には出る）:")
        for o in orphans:
            print(f"  - {o}")
    if metas:
        print(f"\n[情報] `> 検索語:` が無いノート {len(metas)} 本:")
        for nid, kind, msg in metas:
            print(f"  - {nid}")
    if ems:
        print(f"\n[情報] * による強調（<em>）があるノート {len(ems)} 本: " + ", ".join(p[0] for p in ems))
    if not errs and not deads:
        print("\n変換し残し・存在しないリンク: なし")


# ---------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(description="Obsidian Vault のチートシートを静的サイトに変換する")
    ap.add_argument("--config", default=None, help="config.json のパス（既定: build.py と同じ場所）")
    ap.add_argument("--vault", default=None, help="Vault のパス（config.json を上書き）")
    ap.add_argument("--out", default=None, help="出力先ディレクトリ（config.json を上書き）")
    ap.add_argument("--check", action="store_true", help="生成せずチェックだけ行う")
    ap.add_argument("--no-single", action="store_true", help="単一ファイル版を作らない")
    args = ap.parse_args(argv)

    project = Path(__file__).resolve().parent
    cfg_path = Path(args.config) if args.config else project / "config.json"
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    vault = Path(os.path.expanduser(args.vault or cfg["vault"]["path"]))
    if not vault.is_dir():
        print(f"[error] Vault が見つからない: {vault}（config.json の vault.path か --vault を確認）", file=sys.stderr)
        return 2
    out_dir = Path(args.out) if args.out else project / cfg.get("output", {}).get("dir", "docs")
    if not out_dir.is_absolute():
        out_dir = project / out_dir
    return build(cfg, vault, project, out_dir, args.check, not args.no_single)


if __name__ == "__main__":
    sys.exit(main())
