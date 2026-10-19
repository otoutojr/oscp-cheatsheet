# OSCP Cheatsheet

Obsidian Vault（`~/Offsec/Penetration`）のチートシートを、[getSH](https://lizajose.github.io/getSH/) と同じ構成のサイトにしたもの。
画面の作り（左のカテゴリ → ツール一覧 → 番号付き手順ごとのコマンド、上部の変数カード）は getSH、
中身のコマンドと説明は Vault のノートから自動で取り込む。

- 元データは Vault の `10 Exploit` / `11 Linux` / `12 Windows` / `13 CVE` / `14 Methodology`
- サイトは素の HTML / CSS / JS。外部通信なし。`docs/index.html` をダブルクリックしても、GitHub Pages に置いても動く
- `docs/oscp-cheatsheet.html` は全部入りの 1 ファイル版。USB や試験用 VM にコピーして使える


## 使う

```bash
xdg-open docs/index.html
```

| 操作 | やり方 |
|---|---|
| 変数を入れる | 上部のカード（ATTACKER IP / VICTIM IP / DOMAIN / USER …）に入力。全ノートのコマンドに即反映される。`反映` を外すとその変数だけ `<…>` のまま |
| その他の変数 | `その他の変数 ▾` で VICTIM HOST / PASSWORD / HASH / URL / WORDLIST などが出る。`変数を追加…` で Vault に出てくる他の `<X>` も足せる |
| ツールを探す | 左のカテゴリ（スキャン / 主要サービス / Web / シェルと転送 / 権限昇格 / Active Directory / 便利ツール / CVE / プレイブック）→ BROWSE の一覧。または `Ctrl+K` で検索 |
| コマンドをコピー | 各行の ⧉ でそのコマンド、ターミナルの `Copy` でブロック全部。未入力の変数が残っていれば `未入力: …` と出る |
| 詳しく見る | ツールの一番下の `詳細` を開くと、元ノートの「書き換える場所」「オプション表」「出力例」「詰まったら」「関連」が全部読める |
| チェックリスト | プレイブック（`14 Methodology`）はチェックボックス付きで全文表示。状態はブラウザに保存。`チェックをリセット` で初期化 |
| Obsidian で直す | ツール名の下の「Obsidian で開く」。直したら下の「更新する」 |

変数の値・チェック状態はブラウザの `localStorage` にだけ保存される（サーバには何も送らない）。

ツールページの「構文 — まずこれ」は Vault の `## 構文`、番号付きの手順は `## 1. …` の見出しごと、
各コマンドの上の `# 説明` はコードブロック先頭のコメント行から取っている。
手順の半分以上にコマンドが無いノート（分岐表や判断ノート）と、プレイブックは、アコーディオンではなく元ノートをそのまま表示する。


## 更新する

Vault のノートを直したら:

```bash
./update.sh
```

中身は `python3 build.py` → `git add -A && git commit && git push`（remote があれば）。
生成だけしたい時は `python3 build.py`、変換の健全性だけ見たい時は `python3 build.py --check`。

`--check` は次を一覧する:

- 変換しきれなかった記法（`[[` や `**` の残り、表の区切り行の残り、閉じていないコードブロック）
- 存在しないノートへの `[[リンク]]`
- `00 Cheatsheet MOC.md` に載っていないノート（サイトでは「フォルダ一覧」にだけ出る）
- `> 検索語:` が無いノート


## GitHub に置く

1. GitHub で空のリポジトリを作る（Private 推奨。Vault の内容がそのまま載る）
2. remote を繋いで push する

```bash
git remote add origin git@github.com:<you>/oscp-cheatsheet.git
```

```bash
git add -A && git commit -m "initial" && git push -u origin main
```

3. リポジトリの Settings → Pages → Build and deployment: **Deploy from a branch** / Branch: `main` / Folder: **`/docs`** → Save
4. 数分後に `https://<you>.github.io/oscp-cheatsheet/` で開ける。以後は `./update.sh` だけで反映される

Private リポジトリの Pages は GitHub Pro 以上が必要。Free のままなら Public にするか、`docs/oscp-cheatsheet.html` を手元で使う。


## 構成

```
oscp-cheatsheet/
├── build.py        Vault → docs/ を生成（Python 3 標準ライブラリのみ）
├── config.json     Vault のパス・サイト名・上部に出す変数の定義
├── src/            UI（index.html / app.js / style.css）。見た目や挙動を変える時はここ
├── docs/           生成物。GitHub Pages の公開元。手で編集しない
├── update.sh       build → commit → push
├── tools/snap.js   ヘッドレス Chromium で表示確認する開発用ツール（初回は tools/ で npm i）
├── DESIGN.md       データ契約・HTML 規約・UI 仕様（直す時に読む）
└── README.md
```


## 変数を増やす・変える

`config.json` の `variables` に 1 行足して `./update.sh`。

```json
{ "key": "SHARE", "label": "共有名", "group": "victim", "example": "secrets", "default": "" }
```

- `key` は Vault 側のプレースホルダ名（`<SHARE>` なら `SHARE`）。大文字・数字・`_` のみ
- `group` は `attacker` / `victim` / `cred` / `other`
- `secret: true` を付けると伏せ字にできる（PASSWORD / HASH）
- `derive: "base_dn"` は DOMAIN から `DC=corp,DC=com` を自動で作る特別扱い

config に無いプレースホルダ（`<SHARE>` `<PIVOT_IP>` など 300 種以上）も、画面の「変数を追加」からその場で足せる。


## Vault 側で守ること

サイトは Vault の書式規約（`obsidian-vault-rules.md` §3）に依存している。特に:

- プレースホルダは `<VICTIM_IP>` のように**大文字**で書く（`<n>` `<script>` のような小文字は変数扱いしない）
- ノートの 1〜2 行目は `> 検索語:` と `> 引く場面:`（検索と一覧の説明文に使う）
- 1 コードブロック 1 コマンド、先頭行の `# 日本語コメント` はキャプションとして表示され、コピーには含まれない
- 左ナビのカテゴリ分けは `config.json` の `categories`（フォルダ単位）。新しいフォルダを作ったら、どのカテゴリに入れるかを `folders` に足す（未指定は「便利ツール」に入る）
- `00 Cheatsheet MOC.md` の「引きたい状況」は検索の対象になるので、新しいノートは MOC にも追記する


## 見た目や挙動を変える

`src/index.html` / `src/app.js` / `src/style.css` を直して `python3 build.py`（`docs/` にコピーされる）。
配色は `src/style.css` 先頭の `:root` の変数（getSH の色をそのまま使っている）。
カテゴリの名前・説明・並び・所属フォルダは `config.json` の `categories`。
`DESIGN.md` に data.js の構造・本文 HTML の規約・UI の仕様があるので、先にそれを読む。
表示確認は `node tools/snap.js "file://$PWD/docs/index.html#/n/nmap" --out /tmp/x.png`（初回は `cd tools && npm i`）。


## うまくいかない時

| 症状 | 対処 |
|---|---|
| `Vault が見つからない` | `config.json` の `vault.path` を直すか `python3 build.py --vault <パス>` |
| ページが真っ白 | `docs/data.js` が無い。`python3 build.py` を実行する |
| 文字化け | `docs/` 全体を UTF-8 のまま置く。`index.html` は `data.js` を `charset="utf-8"` 付きで読んでいる |
| ノートが思ったカテゴリに出ない | `config.json` の `categories[].folders` を見る。どこにも当たらないノートは「便利ツール」に入る |
| 更新したのに見た目が古い | ブラウザのキャッシュ。再読み込み（Ctrl+Shift+R）。`index.html` はビルドごとに CSS / JS の URL にバージョンを付けているので通常は起きない |
| リンクが灰色で押せない | リンク先のノートが Vault に無い（`--check` に出る） |
