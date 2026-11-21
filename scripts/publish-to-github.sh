#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="duyuyd/driveledger-saas"
if ! command -v git >/dev/null 2>&1; then echo "Cần cài Git"; exit 1; fi
if ! command -v gh >/dev/null 2>&1; then echo "Cần cài GitHub CLI: https://cli.github.com"; exit 1; fi
if ! gh auth status >/dev/null 2>&1; then echo "Đăng nhập GitHub bằng trình duyệt trước."; gh auth login -w; fi
if gh repo view "$REPO" >/dev/null 2>&1; then echo "Repo $REPO đã tồn tại; dừng để tránh ghi đè."; exit 1; fi
if [ -d .git ]; then echo "Thư mục đã có .git; dừng để không thay đổi lịch sử khác."; exit 1; fi
git init -b main
git add .
git commit -m "feat: initial DriveLedger SaaS web mobile Supabase foundation"
gh repo create "$REPO" --private --source=. --remote=origin --push
printf '\nTạo repo: https://github.com/%s\n' "$REPO"
