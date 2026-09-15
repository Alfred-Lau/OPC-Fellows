#!/usr/bin/env bash
# 打 macOS 桌面包：先出未签名 .app，再用 sign-mac.sh 签名，
# zip / dmg 必须指向 .app 本身，不能指向 dist/mac-arm64（否则会套娃，系统报损坏）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PRODUCT="${PRODUCT_NAME:-OPC Agent Team - Solokit}"
VERSION="$(node -p "require('./package.json').version")"
APP="dist/mac-arm64/${PRODUCT}.app"
ZIP="dist/${PRODUCT}-${VERSION}-mac-arm64.zip"
DMG="dist/${PRODUCT}-${VERSION}-mac-arm64.dmg"

export CSC_IDENTITY_AUTO_DISCOVERY=false
export ELECTRON_CACHE="${ELECTRON_CACHE:-$HOME/Library/Caches/electron}"

pnpm clean:dist
pnpm exec electron-vite build
node scripts/vendor-dsh.mjs
pnpm exec electron-builder --mac --dir \
  -c.mac.identity=null \
  -c.electronDist=node_modules/electron/dist

if [[ ! -f "$APP/Contents/Info.plist" ]]; then
  echo "打包后找不到 $APP" >&2
  exit 1
fi

bash scripts/sign-mac.sh "$APP"

rm -f "$ZIP" "${ZIP}.blockmap" "$DMG" "${DMG}.blockmap"
ditto -c -k --keepParent "$APP" "$ZIP"
pnpm exec electron-builder --mac dmg --prepackaged "$APP" -c.mac.identity=null

echo "产物："
ls -lh "$APP" "$ZIP" "$DMG"
