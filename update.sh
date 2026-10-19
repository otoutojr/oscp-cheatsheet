#!/usr/bin/env bash
# update.sh — Vault からサイトを再生成し、git リポジトリなら commit / push まで行う。
#
#   ./update.sh            # 生成 → commit → push（remote があれば）
#   ./update.sh --no-push  # 生成 → commit だけ
#   ./update.sh --check    # 生成せず、変換の健全性チェックだけ
set -euo pipefail
cd "$(dirname "$0")"

if [[ "${1:-}" == "--check" ]]; then
  exec python3 build.py --check
fi

python3 build.py

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "(git リポジトリではないので commit は省略)"
  exit 0
fi

git add -A
if git diff --cached --quiet; then
  echo "変更なし（commit 不要）"
  exit 0
fi

git commit -q -m "update: $(date '+%Y-%m-%d %H:%M')"
echo "commit: $(git log -1 --pretty=%h) $(git log -1 --pretty=%s)"

if [[ "${1:-}" == "--no-push" ]]; then
  exit 0
fi
if git remote get-url origin >/dev/null 2>&1; then
  git push
else
  echo "(remote origin が未設定なので push は省略。README の「GitHub に置く」を参照)"
fi
