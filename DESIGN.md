# 設計メモ — OSCP Cheatsheet サイト

Obsidian Vault（`~/Offsec/Penetration`）のチートシート（`10 Exploit` / `11 Linux` / `12 Windows` / `13 CVE` / `14 Methodology`）を、
1 コマンドで静的サイトに変換する。getSH（https://lizajose.github.io/getSH/）のように、
上部で `<VICTIM_IP>` などの変数を入力すると全コマンドに即反映され、ボタン 1 つでコピーできる。

- 変換は `build.py`（Python 3 標準ライブラリのみ。依存なし）
- サイトは素の HTML / CSS / JS（フレームワーク・ビルドツールなし）。`file://` でも GitHub Pages でも動く
- 外部通信ゼロ（フォント・CDN・fetch を使わない）。試験 VM にコピーしても動く


## 1. ディレクトリ

```
oscp-cheatsheet/
├── build.py            Vault → docs/ を生成
├── config.json         Vault パス・サイト名・変数定義（ここを編集）
├── src/                UI テンプレート（手で編集するのはここ）
│   ├── index.html
│   ├── app.js
│   └── style.css
├── docs/               生成物。GitHub Pages の公開元（手で編集しない）
│   ├── index.html      src/index.html のコピー
│   ├── app.js / style.css
│   ├── data.js         全ノートのデータ（window.CHEATSHEET_DATA）
│   ├── img/            Vault の画像（参照されているものだけ）
│   ├── .nojekyll
│   └── oscp-cheatsheet.html   全部入り 1 ファイル版（USB / 試験 VM 用）
├── update.sh           build → git commit → push
├── DESIGN.md           このファイル
└── README.md           使い方
```


## 2. data.js の契約（build.py が書き、app.js が読む）

```js
window.CHEATSHEET_DATA = {
  meta: {
    title: "OSCP Cheatsheet",        // config.site.title
    subtitle: "…",                   // config.site.subtitle
    tagline: "列挙から root まで。",   // config.site.tagline（ホームの見出し下）
    built_at: "2026-10-19 13:05",    // 生成日時
    vault_name: "Penetration",       // obsidian://open?vault=<vault_name>&file=<path> 用
    note_count: 188,
    generator: "build.py 1.0"
  },

  // 上部バーに出す変数（config.variables をそのまま）。順序 = 表示順
  variables: [
    { key: "VICTIM_IP", label: "攻撃対象の IP", group: "victim",
      example: "192.168.50.8", default: "", derive: null, secret: false },
    // derive: "base_dn" のものは、未入力なら DOMAIN から DC=corp,DC=com を自動生成する
  ],

  // 全ノートのコード／インラインコードに現れた <X> の出現回数。UI の「変数を追加」候補
  placeholders: { "VICTIM_IP": 1649, "USER": 1226, "N": 161, … },

  notes: {
    "<id>": {                 // id = ファイル名（拡張子なし）。Vault 内で一意。wikilink の解決キー
      id: "nmap",
      title: "nmap",
      folder: "10 Exploit/Enumeration",         // Vault 相対のフォルダ
      path: "10 Exploit/Enumeration/nmap.md",   // Vault 相対のパス
      kind: "tool" | "cve" | "playbook",        // 13 CVE → cve, 14 Methodology → playbook, 他 → tool
      keywords: ["nmap", "ポートスキャン", …],   // `> 検索語:` を " / " で分割
      scene: "開いているポートを洗い出す・…",      // `> 引く場面:`
      checked: "2026-10-01" | null,              // `> 確認日:`（CVE ノートなど）
      html: "<h2 id=\"…\">…</h2>…",              // 本文（§3 の規約）。見出し行・検索語行は除去済み
      headings: [ { level: 2, text: "1. 出力先を作る", slug: "1.-出力先を作る" } ],
      placeholders: ["VICTIM_IP", "OUTPUT"],      // このノートのコード内に出る <X>（出現順）
      links: ["searchsploit", …],                 // 出て行く wikilink（解決できた id だけ）
      backlinks: ["00 OSCP Playbook", …],         // 被リンク
      commands: [                                 // 検索用。fenced code のうち言語ありのもの
        { lang: "bash", comment: "全 65535 ポートを…", text: "sudo nmap -Pn -p- … <VICTIM_IP>" }
      ],
      intro: "Impacket v0.14.0 / Kali 標準で導入済み",     // 最初の見出しより前の説明文（無ければ ""）
      sections: [                                 // getSH 表示用。## ごと（書き換える場所・その他のオプション・詰まったら・関連 は除く）
        { title: "構文", slug: "構文", kind: "syntax", lead: "", ncmd: 1,
          subs: [ { title: "", slug: "構文", cmds: [ { lang: "bash", caption: "値は <VICTIM_IP> を…", text: "sudo nmap …" } ] } ] },
        { title: "2. 全ポートを洗い出す（1 段目）", slug: "2.-全ポートを洗い出す（1-段目）", kind: "step",
          lead: "まずは「どのポートが開いているか」だけを確定させる。…",   // セクション最初の段落（最初のコマンドより前）
          ncmd: 1, subs: [ { title: "", cmds: [ … ] } ] }   // ### があれば subs が分かれる
      ],
      category: "scan",                           // 所属カテゴリ（config.categories の id）
      mtime: "2026-10-15"
    }
  },

  // 左ナビ（getSH 風）。config.categories の順。グループはフォルダの末尾名（例: "445 - smb"）
  categories: [
    { id: "scan", title: "スキャン", en: "Scan", icon: ">_", desc: "…", count: 6,
      groups: [ { title: "Enumeration", notes: ["autorecon", "nmap", …] } ] }
  ],

  // MOC（00 Cheatsheet MOC.md）の構造。検索の「引きたい状況」と互換用に残す
  nav: [
    { id: "playbook", title: "プレイブック", desc: "列挙の道順。迷ったらここ",
      sections: [ { id: "playbook", title: "14 Methodology", desc: "", entries: [ { note: "00 OSCP Playbook", scene: "…", keywords: "…", sub: null } ] } ] },
    { id: "port", title: "ポートから引く", desc: "nmap の結果を見て、開いていたポートから辿る。",
      sections: [
        { id: "21-ftp", title: "21 - ftp", desc: "ファイル転送サービス。匿名ログインと…",
          entries: [ { note: "FTP enumeration", scene: "21/tcp が開き…", keywords: "FTP enumeration / …", sub: null, also: [] } ] },
        { id: "80-443-http-https", title: "80,443 - http,https", desc: "…",
          entries: [ { note: "Web enumeration", scene: "…", keywords: "…", sub: "まず何が動いているか調べる" }, … ] }
      ] },
    { id: "situation", title: "状況から引く", desc: "ポートに紐づかないもの。入った後はこちら。", sections: [ … ] },
    { id: "cve", title: "CVE から引く", desc: "バージョンが確定した後に引く。…", sections: [ { id: "cve", title: "CVE", desc: "", entries: [ … ] } ] },
    { id: "folder", title: "フォルダ一覧", desc: "Vault のフォルダ構成そのまま（MOC に載っていないノートもここに出る）",
      sections: [ { id: "10-exploit-enumeration", title: "10 Exploit / Enumeration", desc: "", entries: [ { note: "nmap", scene: "…", keywords: "…" } ] } ] }
  ],

  external: [ { title: "HackTricks", scene: "手法は知っているが…", url: "https://hacktricks.wiki/ja/index.html" } ],

  orphans: [ "<MOC に載っていないノート id>" ]   // 0 件が正常。MOC 追記漏れの検知用
}
```

- `entries[].scene` / `keywords` は MOC の表の値。MOC に無いノート（folder グループ）はノート自身の `scene` / `keywords` を使う
- `entries[].also` は MOC の「ノート」列に 2 つ以上リンクがあった時の 2 番目以降
- `data.js` の中の `</` は `<\/` にエスケープされている（単一ファイル版で `<script>` に埋め込むため）


## 3. ノート本文 HTML の規約（build.py の出力）

本文は `<h2>` から始まる断片。タイトル（`<h1>`）・パンくず・検索語は UI 側が描く。
全テキストは HTML エスケープ済み（`<script>` などの生 HTML は一切通さない）。

| Markdown（Obsidian） | HTML |
|---|---|
| `## 見出し` | `<h2 id="SLUG">見出し</h2>`（`###` → `<h3>`）。SLUG = 見出しテキストの空白を `-` に置換（日本語はそのまま）。取得は `getElementById`（`querySelector('#1.-x')` は CSS 的に無効） |
| ```` ```bash ```` ブロック | `<div class="code" data-lang="bash"><div class="code-cap">…</div><pre><code>…</code></pre></div>`。先頭行がコメント（bash/sh/zsh/python/powershell は `#`、cmd は `::`/`REM`、sql は `--`、cypher/groovy/c は `//`）で 2 行以上ある時だけ、その 1 行を `.code-cap` に移す（コピー対象から外す）。言語無しの出力例ブロックは `class="code code-out"`、`.code-cap` 無し |
| コード内の `<VICTIM_IP>` | `<span class="ph" data-ph="VICTIM_IP">&lt;VICTIM_IP&gt;</span>`。対象は `<[A-Z][A-Z0-9_]*>`（大文字のみ。`<script>` `<n>` は対象外）。fenced code・インラインコード両方。本文テキスト中の `<X>` も同じ span（コードの外でも置換の対象） |
| コード内のコメント行（残った 2 行目以降） | `<span class="c">…</span>` |
| `` `inline` `` | `<code>…</code>`（中の `<X>` は上と同じ span） |
| `> [!example]- タイトル` + `> …` | `<details class="callout callout-example"><summary>タイトル</summary><div class="callout-body">…</div></details>`。`-` は閉じた状態、`+` は `open`。符号なしは `<div class="callout callout-TYPE"><div class="callout-title">…</div><div class="callout-body">…</div></div>`。タイトル省略時の既定: example→出力例 note→メモ warning→注意 tip→ヒント info→情報 danger→危険 bug→不具合 quote→引用 todo→TODO success→成功 question→疑問 failure→失敗 abstract→要約。中身（`> ` を剥がしたもの）は再帰的に Markdown として変換（表・コードブロック可） |
| `> 引用` | `<blockquote>…</blockquote>` |
| GFM 表 | `<div class="tbl"><table><thead><tr><th>…</th></tr></thead><tbody>…</tbody></table></div>`。区切り行の `:` による寄せは `style="text-align:…"`。インラインコード内の `\|` はパイプ文字として扱う |
| `- ` / `1. ` リスト | `<ul>` / `<ol start="N">`。3 スペース字下げの継続行は同じ `<li>` に `<br>` で続ける |
| `- [ ]` / `- [x]` | `<li class="task"><input type="checkbox" class="task-box" data-task="N"[ checked]> …</li>`。N はノート内の通し番号（0 始まり） |
| 段落 | `<p>…</p>`。段落内の改行は `<br>`（Obsidian の既定表示に合わせる） |
| `**x**` / `*x*` / `~~x~~` / `==x==` | `<strong>` / `<em>` / `<del>` / `<mark>`（コード内は対象外） |
| `[[ノート]]` | `<a class="wl" href="#/n/ENC_ID" data-note="ID">ノート</a>`。ENC = `encodeURIComponent` |
| `[[ノート#見出し]]` / `[[#見出し]]` / `[[x\|別名]]` | `href="#/n/ENC_ID/ENC_SLUG"`。`[[#…]]` は自ノート。別名は表示テキスト。表の中の `\|` も別名区切り |
| 存在しないノートへの `[[x]]` | `<span class="wl wl-dead" title="Vault にこの名前のノートが無い">x</span>` |
| `[[00 Cheatsheet MOC]]` | `<a class="wl" href="#/">` |
| `![[画像.png]]` | `<img class="img" src="img/画像.png" alt="画像.png" loading="lazy">`（`98 Picture/` から `docs/img/` へコピー） |
| 裸の `http(s)://…` | `<a class="ext" href="…" target="_blank" rel="noopener noreferrer">…</a>` |
| `> 検索語:` `> 引く場面:` `> 確認日:`、本文中の `検索語: …` 段落 | 本文から除去し `keywords` / `scene` / `checked` へ |


## 4. UI 仕様（src/）— getSH 準拠

見た目・構成は getSH（https://lizajose.github.io/getSH/）に合わせる。中身（コマンドと説明）だけを Obsidian から取る。
配色: 背景 `#080e12`、サイドバー `#0c1418`、パネル `#111b1f`、ターミナル `#0b1316`（ヘッダ `#121c20`）、枠 `#25353a`、文字 `#e5edf0`、アクセント青緑 `#6ee7dc`（コマンド文字 `#89e1d8`）、プロンプト緑 `#22c55e`、角丸 8px（ナビは 12px）。ダーク固定。

### 4.1 画面構成

- **左サイドバー**（260px・固定）: ロゴ（● ● ● + `OSCP` / `oscp.sh`）→ `NAVIGATION` → カテゴリボタン（`›` + 名前 + 件数。active は `#15302e` / 枠 `#416d69`）→ 最下部に `● READY` ピルとノート数
- **上部バー**（getSH と同じく sticky。140px スクロールすると変数カードを畳んで `VICTIM_IP=… · USER=…` の 1 行要約になり、クリックで再展開）: 左 `WORKSPACE /<category>/<tool>`、中央に変数カード（`ATTACKER IP` のようなラベル・`反映` チェック・入力欄）を 3 列 × 2 段（ATTACKER_IP, ATTACKER_PORT, VICTIM_IP, VICTIM_PORT, DOMAIN, USER）、右に `⌕ 検索 Ctrl K`・`その他の変数 ▾`・`すべてクリア`・`元に戻す`。「その他の変数」を開くと残りの変数カードと `変数を追加…`（data.placeholders から）、`本文のインラインコードにも反映`
- **ホーム**（`#/`）: `~/oscp.sh` パス → 大見出し `oscp.sh`（`.sh` がアクセント色）→ タグライン → 説明 → ボタン（AD から始める / スキャンの流れ / 検索）＋右にターミナル（`$ ./oscp.sh --objective`）→ `// OVERVIEW` 統計カード 4 枚 → `// RECENT` 最近見たノート（あれば）→ `// KNOWLEDGE BASE` カテゴリカード（アイコン・名前・説明・件数）→ `// WORKFLOW` ターミナル（プレイブックを `[01]` から順に）
- **カテゴリ**（`#/c/ID`、`#/n/ID`）: パス → カテゴリ名 → 説明 → 2 カラム。左 `BROWSE`（フォルダごとの小見出し + ツール一覧。選択中は active 色。sticky で、選択中の項目が見える位置まで自動スクロール）、右にツール詳細。getSH は 1 カラムだが、26〜40 本のカテゴリで一覧が本文を押し下げないよう意図的に 2 カラム。`#/c/ID` は `config.categories[].first`（無ければ先頭）のツールを選択した状態。≤1100px では BROWSE をチップ列（高さ 190px まで・グループ見出しなし）にする
- **ツール詳細**: タイトル → 引く場面 → intro → メタ（フォルダ / 更新日 / Obsidian で開く / 検索語）→ `構文 — まずこれ` ターミナル（`## 構文` のコマンド）→ `すべて閉じる / 開く` → **アコーディオン**（`##` 手順ごと。getSH と同じく先頭だけ開き残りは閉じる。summary = 見出し + `N cmd` + ∨。中身 = lead 段落 → `###` ごとの小見出し → ターミナル。コマンドの無い手順はその節の本文（表・箇条書き）をそのまま埋め込む）→ `詳細 — 書き換える場所 / オプション / 出力例 / 詰まったら / 関連`（閉じた details に元ノート全文）→ このノートへのリンク
- **ターミナル**: ヘッダ（● ● ● + タイトル + `Copy`）、本文は `# キャプション` 行（元の先頭コメント。`[[リンク]]` と `` `code` `` を解釈）→ `$ コマンド` 行（行末に ⧉ 行コピー）。`Copy` はブロック内の全コマンドを改行区切りで。プロンプトは言語別（bash `$` / powershell `PS>` / cmd `C:\>` / sql `SQL>` / python `>>>` / cypher `neo4j>`）。コマンドは `pre-wrap` で折り返す
- **例外**: `kind: playbook`、または手順の半数以上にコマンドが無いノート（分岐表・判断ノート、console 転記主体のノート）は、アコーディオンではなく元ノート全文（`.note-body.standalone`）をそのまま表示。`.code` には `コピー`、タスクは保存
- `#/ext` 外部リファレンス。未知 id は「ノートが見つかりません」

### 4.2 ルーティング（hash）

| URL | 画面 |
|---|---|
| `#/` | ホーム |
| `#/c/ID` | カテゴリ（先頭のツールを表示） |
| `#/n/ID` | ツール（所属カテゴリの画面で選択状態） |
| `#/n/ID/SLUG` | `sec-SLUG` のアコーディオンを開いてスクロール。無ければ詳細内の見出し `SLUG` を開く |
| `#/ext` | 外部リファレンス |

同じ hash へのクリックでも再描画する（`hashchange` が起きないため）。`document.title` は「ノート名 | サイト名」。

### 4.3 変数（置換）

- 状態 `{ values, enabled, extra, inlineApply }` を `localStorage["cs.vars.v1"]` に保存。`cs.ui.v2` に「その他の変数」の開閉
- 置換: `.ph[data-ph=KEY]` を全部更新。`enabled && 値あり` → 値 + `ph-set`、それ以外 → `<KEY>` + `ph-unset`（琥珀色の枠）
- `derive: "base_dn"`: BASE_DN 未入力で DOMAIN があれば `corp.com` → `DC=corp,DC=com` を自動で使う（入力欄の placeholder にも出す）
- `inlineApply` OFF の時は詳細本文のインラインコード（`<code>` 直下、`pre` 外）だけ置換しない
- `すべてクリア` → 直前の値を `元に戻す` で 1 回だけ復元
- 変数カードの状態: 入力済み = 枠が青緑、既定値のまま = 通常、未入力 = 斜体の例、反映 OFF = 半透明。モバイルの `変数 (n/14 入力済み)` の n は既定値と導出値を含まない

### 4.4 コピー

- 行コピー ⧉ = そのコマンド、ヘッダの `Copy` = ブロック内の全コマンド、詳細内の `.code` = そのブロック（`.code-out` には付けない）
- コピー文字列は置換後（末尾の空白・改行は除く）。`navigator.clipboard` → 失敗時 `textarea + execCommand`
- トースト: `コピーしました` / `コピーしました（未入力: VICTIM_IP, DOMAIN）`（警告色）/ `コピーできませんでした`

### 4.5 検索

- `Ctrl+K` / `⌘K` / `/`（入力欄にフォーカスが無い時）で開く。`Esc` で閉じる。↑↓ Enter
- 重み: title 10（先頭一致 +3）> keywords 6 > scene 5 > カテゴリ・グループ名 4 > 手順名 3 > コマンド本文・キャプション 2。複数語は AND
- 結果行: ノート名（手順一致なら ` › 手順名`）、右にカテゴリ / グループ、下に抜粋（一致語を `<mark>`）。手順一致は `#/n/ID/SLUG` へ

### 4.6 その他

- `cs.recent` に最近見たノート 8 件。`cs.tasks.<id>` にチェック状態
- JS は 1 ファイル（`app.js`、`defer`。インライン化されても動くよう readyState を見る）。外部通信なし
- モバイル（≤820px）: サイドバーはドロワー（☰）、変数は `変数 (n/14 入力済み)` ボタンで開閉、BROWSE はチップ列、横スクロールなし
- `data.js` が無い時は「`python3 build.py` を実行してください」

### 4.7 文言（日本語）

| 要素 | 文言 |
|---|---|
| ナビ見出し | NAVIGATION（getSH と同じく英字のまま） |
| 検索ボタン | 検索 (Ctrl K) |
| 検索プレースホルダ | ノート名・検索語・コマンドで探す |
| 変数の有効チェック | 反映 |
| その他の変数 / 追加 / クリア / 元に戻す | その他の変数 ▾ / 変数を追加… / すべてクリア / 元に戻す |
| コピー | Copy（ターミナルのヘッダ）/ コピー（詳細内）/ コピーしました / 未入力: … |
| 構文ブロック | 構文 — まずこれ |
| 全開閉 | すべて閉じる / すべて開く |
| 詳細 | 詳細 — 書き換える場所 / オプション / 出力例 / 詰まったら / 関連 |
| コマンド無し | この手順にコマンドは無い（判断・確認のみ）。詳細で読む |
| 被リンク | このノートへのリンク |
| Obsidian | Obsidian で開く |
| タスク | n/N 完了 / チェックをリセット |
| 最近 | 最近見たノート |
| 空検索 | 一致するノートがありません |


## 5. 更新の流れ

1. Obsidian で Vault のノートを書く・直す（いつも通り）
2. `./update.sh`（中身は `python3 build.py` → `git add -A && git commit && git push`）
3. GitHub Pages（Settings → Pages → Branch: main, Folder: /docs）が `docs/` を公開

ローカルだけなら `docs/index.html` をブラウザで開くだけ（`file://` 対応）。
`docs/oscp-cheatsheet.html` は 1 ファイルで完結するので、USB・試験 VM へコピーして使える。

`python3 build.py --check` で、変換しきれなかった記法・存在しないノートへのリンク・MOC 未掲載ノートを一覧する。
