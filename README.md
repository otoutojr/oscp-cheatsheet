# OSCP Cheatsheet

Obsidian Vault（`~/Offsec/Penetration`）のチートシートを、ブラウザで引ける静的サイトにしたもの。
上の欄に `<VICTIM_IP>` や `<DOMAIN>` の値を入れると、全ノートのコマンドにその場で反映され、ボタン 1 つでコピーできる。
手本は [getSH](https://lizajose.github.io/getSH/)。

- 元データは Vault の `10 Exploit` / `11 Linux` / `12 Windows` / `13 CVE` / `14 Methodology`（計 188 本）
- サイトは素の HTML / CSS / JS。外部通信なし。`docs/index.html` をダブルクリックしても、GitHub Pages に置いても動く
- `docs/oscp-cheatsheet.html` は全部入りの 1 ファイル版。USB や試験用 VM にコピーして使える


## 使う

```bash
xdg-open docs/index.html
```

| 操作 | やり方 |
|---|---|
| 変数を入れる | 上部の「書き換える場所」に入力。`反映` を外すとその変数だけ `<…>` のまま残る |
| ノートを探す | `Ctrl+K`（または `/`）で検索。ノート名・検索語・引く場面・見出し・コマンド本文が対象 |
| コマンドをコピー | 各コードブロック右上の `コピー`。未入力の変数が残っていれば `未入力: …` と出る |
| 状況から引く | 左ナビの「ポートから引く」「状況から引く」「CVE から引く」は Vault の `00 Cheatsheet MOC.md` と同じ構成 |
| チェックリスト | `14 Methodology` のチェックボックスはブラウザに保存される。「チェックをリセット」で初期化 |
| Obsidian で直す | ノート右上の「Obsidian で開く」。直したら下の「更新する」 |

変数の値・テーマ・チェック状態はブラウザの `localStorage` にだけ保存される（サーバには何も送らない）。


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
- 新しいノートは `00 Cheatsheet MOC.md` にも追記する（左ナビはその構成で作られる）


## 見た目や挙動を変える

`src/index.html` / `src/app.js` / `src/style.css` を直して `python3 build.py`（`docs/` にコピーされる）。
`DESIGN.md` に data.js の構造・本文 HTML の規約・UI の仕様があるので、先にそれを読む。
表示確認は `node tools/snap.js "file://$PWD/docs/index.html#/n/nmap" --out /tmp/x.png`（初回は `cd tools && npm i`）。


## うまくいかない時

| 症状 | 対処 |
|---|---|
| `Vault が見つからない` | `config.json` の `vault.path` を直すか `python3 build.py --vault <パス>` |
| ページが真っ白 | `docs/data.js` が無い。`python3 build.py` を実行する |
| 文字化け | `docs/` 全体を UTF-8 のまま置く。`index.html` は `data.js` を `charset="utf-8"` 付きで読んでいる |
| ノートが左ナビに出ない | `00 Cheatsheet MOC.md` に未掲載。`--check` の「MOC に載っていないノート」を見る。「フォルダ一覧」には出ている |
| リンクが灰色で押せない | リンク先のノートが Vault に無い（`--check` に出る） |
