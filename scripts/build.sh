#!/usr/bin/env bash
# 一条命令重建全部交付物。任何一步失败即停（set -e），不做"跳过继续"。
set -euo pipefail
cd "$(dirname "$0")/.."

if command -v py >/dev/null 2>&1; then PY="py -3"; else PY="python3"; fi

if [ ! -d node_modules ]; then
  echo "== npm ci =="
  npm ci --no-audit --no-fund
fi

echo "== 字体子集（少一个字就会静默回落系统字体）=="
$PY scripts/subset_fonts.py

echo "== 版式 + 织纹（fail-closed）=="
node scripts/render.mjs

echo "== 转 JPG（RGB / 300dpi / ≤10MB）=="
$PY scripts/to_jpg.py

echo "== 创作说明 PDF =="
node scripts/statement.mjs

echo "== 复验（对着交付物）=="
$PY scripts/verify.py
