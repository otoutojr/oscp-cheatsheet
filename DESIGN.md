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
      mtime: "2026-10-15"
    }
  },

  // 左ナビ。00 Cheatsheet MOC.md の構造をそのまま使う
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


## 4. UI 仕様（src/）

### 4.1 画面構成（≥1024px）

```
┌──────────┬──────────────────────────────────────────────────┐
│ サイト名   │ 変数バー: [ATTACKER_IP][ATTACKER_PORT][VICTIM_IP]…  │ ← sticky
│ ナビ絞込   │   ▸ その他の変数 / 変数を追加 / クリア   🔍 検索 ☾/☀   │
│ ▾ プレイ   ├──────────────────────────────────────────────────┤
│   ブック   │ パンくず: 12 Windows / 88 - kerberos                │
│ ▾ ポート   │ # GetNPUsers・GetUserSPNs            [Obsidian で開く]│
│   21 - ftp│ 引く場面: …   検索語: chip chip chip                 │
│   22 - ssh│ 使う変数: [VICTIM_IP ____] [DOMAIN ____] …           │ ← このノートで使う分だけ
│   …       │ 目次: 1. … 2. … 3. …                                │
│ ▸ 状況    │ 本文（コマンドにコピー ボタン、<X> はハイライト）        │
│ ▸ CVE     │ 関連 / このノートへのリンク                            │
│ ▸ フォルダ │                                                    │
└──────────┴──────────────────────────────────────────────────┘
```

- `<1024px`: 左ナビはドロワー（ハンバーガー）、変数バーは「変数 (3/13 入力済み)」ボタンで開閉
- 既定はダークテーマ（ターミナル風）。`prefers-color-scheme` を初期値にし、トグルで切替。CSS 変数は `:root` にトークン化
- フォント: 日本語は `system-ui, "Noto Sans CJK JP", "Hiragino Sans", Meiryo, sans-serif`、コードは `ui-monospace, "JetBrains Mono", "Noto Sans Mono CJK JP", Consolas, monospace`。外部フォント不使用

### 4.2 ルーティング（hash）

| URL | 画面 |
|---|---|
| `#/` | ホーム（サイト名・クイックリンク・プレイブック・最近見たノート・件数） |
| `#/n/ENC_ID` | ノート |
| `#/n/ENC_ID/ENC_SLUG` | ノートの見出しへスクロール |
| `#/s/GROUP_ID/SECTION_ID` | セクション一覧（例: 445 - smb。説明 + 引きたい状況 / ノート / 検索語 の一覧） |
| `#/all` | 全ノート（フォルダ順） |
| `#/ext` | 外部リファレンス |

`document.title` は「ノート名 | サイト名」。履歴は hash 遷移に任せる。

### 4.3 変数（置換）

- 状態: `{ values: {KEY: "…"}, enabled: {KEY: true}, extra: ["SHARE", …], inlineApply: true }` を `localStorage["cs.vars.v1"]` に保存
- 表示: `variables` の順。`group` ごとにまとめる（attacker / victim / cred / other）。`other` 群と `extra` は「その他の変数 ▾」で開閉
- 「変数を追加」: `placeholders` の中で `variables` に無いものを出現回数順に並べて選ばせる → `extra` に入り、入力欄が増える
- 置換: 変更のたびに本文中の `.ph[data-ph=KEY]` を全部更新。`enabled && value !== ""` → `textContent = value`、class `ph-set`。それ以外 → `textContent = "<KEY>"`、class `ph-unset`（目立つ色で「ここを埋める」と分かるように）
- `derive: "base_dn"`: BASE_DN が未入力で DOMAIN が入っていれば `corp.com` → `DC=corp,DC=com` を自動で使う（入力欄にはプレースホルダとして薄く表示）
- `inlineApply`（既定 ON）: OFF の時はインラインコード（`<code>` 直下）の `.ph` は置換しない
- 「クリア」: 値を全部空にする（確認なし。取り消し用に直前の値を 1 回だけ戻せる「元に戻す」があると良い）
- `secret: true`（PASSWORD / HASH）: 入力欄は `type="text"` のまま（見えないと打ち間違える）だが、目のアイコンで伏せ字にできる

### 4.4 コードブロック

- UI が各 `.code` に右上ツールバーを足す: 言語バッジ、`コピー` ボタン
- コピー: `pre` の `textContent`（置換後）をクリップボードへ。末尾改行は落とす。成功で「コピーしました」(1.5 秒)。未入力の `.ph-unset` が含まれていたら「未入力: VICTIM_IP, DOMAIN」を併記
- `navigator.clipboard` が無い（`file://` + 一部ブラウザ）時は `execCommand('copy')` にフォールバック
- `.code-out`（出力例）にもコピーは付けてよいが控えめに

### 4.5 検索

- `Ctrl+K` / `⌘K` / `/`（入力欄にフォーカスが無い時）でパレットを開く。`Esc` で閉じる。↑↓ Enter で選択
- 対象と重み: title (10) > keywords (6) > MOC の scene (5) > note.scene (5) > headings (3) > commands.text / comment (2)
- 部分一致（大文字小文字無視）。複数語はスペース区切りの AND
- 結果: ノート名 + フォルダ + 一致した箇所の抜粋（一致語をハイライト）。見出し一致はその見出しへ、コマンド一致はそのノートへ
- 左ナビ上の絞り込み欄は、ナビの木をテキストでフィルタ（title / scene / keywords）

### 4.6 ノート画面

- パンくず（`folder` を ` / ` で）、タイトル、`scene`、`keywords` チップ、`checked`（あれば）、`mtime`
- 「Obsidian で開く」: `obsidian://open?vault=<meta.vault_name>&file=<encodeURIComponent(path から .md を除いたもの)>`
- 「使う変数」: `note.placeholders` のうち `variables` か `extra` にあるものを、その場で編集できる小さな入力欄として並べる（上部バーと同じ状態を双方向に更新）。無いものは「追加」ボタン付きチップ
- 目次: `headings` から（`h2` のみ。`h3` はインデント）。クリックでスクロール
- 本文: `note.html` を `innerHTML` で描画 → 置換・コピー・タスク・wikilink クリックを有効化
- タスク: `.task-box` の状態を `localStorage["cs.tasks.<id>"]` に保存。タスクを含むノートには「チェックをリセット」
- 末尾: `backlinks`（「このノートへのリンク」）
- `.wl` クリックは hash 遷移。`.wl-dead` はクリック不可

### 4.7 その他

- 「最近見たノート」8 件を `localStorage["cs.recent"]` に保存しホームと左ナビ上部に出す
- 左ナビのグループ開閉状態を `localStorage["cs.nav"]` に保存
- `data.js` が読めていない時はホームに「`python3 build.py` を実行してください」と出す
- JS は 1 ファイル（`app.js`）、`<script defer>` で読み込む。`index.html` は `data.js` → `app.js` の順。例外として、描画前にテーマ（`data-theme`）を当てる数行だけは `index.html` の `<head>` にインラインで置く（ちらつき防止）

### 4.8 文言（日本語）

| 要素 | 文言 |
|---|---|
| 検索ボタン | 検索 (Ctrl+K) |
| 検索プレースホルダ | ノート名・検索語・コマンドで探す |
| 変数バー見出し | 書き換える場所 |
| 変数の有効チェック | 反映 |
| その他の変数 | その他の変数 |
| 変数を追加 | 変数を追加 |
| クリア | すべてクリア |
| 元に戻す | 元に戻す |
| コピー | コピー / コピーしました / 未入力: … |
| テーマ切替 | ダーク / ライト |
| ノート内の変数 | このノートで使う変数 |
| 目次 | 目次 |
| 被リンク | このノートへのリンク |
| Obsidian | Obsidian で開く |
| タスクリセット | チェックをリセット |
| 最近 | 最近見たノート |
| 全ノート | 全ノート（フォルダ順） |
| 外部 | 外部リファレンス |
| 空検索 | 一致するノートがありません |


## 5. 更新の流れ

1. Obsidian で Vault のノートを書く・直す（いつも通り）
2. `./update.sh`（中身は `python3 build.py` → `git add -A && git commit && git push`）
3. GitHub Pages（Settings → Pages → Branch: main, Folder: /docs）が `docs/` を公開

ローカルだけなら `docs/index.html` をブラウザで開くだけ（`file://` 対応）。
`docs/oscp-cheatsheet.html` は 1 ファイルで完結するので、USB・試験 VM へコピーして使える。

`python3 build.py --check` で、変換しきれなかった記法・存在しないノートへのリンク・MOC 未掲載ノートを一覧する。
