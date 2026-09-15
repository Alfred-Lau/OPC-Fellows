#!/usr/bin/env bash
# 从内向外签 Electron .app。每个 codesign 调用带重试，避开 Apple 时间戳服务抖动。
set -euo pipefail

APP="${1:-dist/mac-arm64/OPC-Fellows.app}"
if [[ -z "${CODESIGN_IDENTITY:-}" ]]; then
  echo "请设置 CODESIGN_IDENTITY，例如 Developer ID Application: Your Name (TEAMID)" >&2
  exit 1
fi
IDENTITY="$CODESIGN_IDENTITY"
ENTITLEMENTS="${ENTITLEMENTS:-build/entitlements.mac.plist}"

if [[ ! -d "$APP" ]]; then
  echo "找不到 $APP" >&2
  exit 1
fi

sign_one() {
  local path="$1"
  local attempt=1
  local max=8
  while true; do
    if codesign --sign "$IDENTITY" --force --timestamp --options runtime \
      --entitlements "$ENTITLEMENTS" "$path" 2>/tmp/owb-codesign.err; then
      echo "  已签  $path"
      return 0
    fi
    if ! grep -q "timestamp service is not available" /tmp/owb-codesign.err; then
      cat /tmp/owb-codesign.err >&2
      return 1
    fi
    if (( attempt >= max )); then
      echo "时间戳服务连续失败，放弃: $path" >&2
      cat /tmp/owb-codesign.err >&2
      return 1
    fi
    echo "  时间戳不可用，${attempt}/${max} 重试 $path"
    sleep $((attempt * 3))
    attempt=$((attempt + 1))
  done
}

echo "签名 $APP"
echo "身份 $IDENTITY"

# 从最内层往外签。不要 --deep：那会把每个 locale.pak 单独打时间戳。
# 顺序：dylib / helper 二进制 → helper.app → framework → 主包。
# 先签 framework 再签里面的 dylib，会把 framework 封印拆掉。
while IFS= read -r lib; do
  sign_one "$lib"
done < <(find "$APP/Contents/Frameworks" \( -name '*.dylib' -o -name '*.so' \) | sort)

while IFS= read -r bin; do
  sign_one "$bin"
done < <(find "$APP/Contents/Frameworks" -type f -name 'chrome_crashpad_handler' | sort)

while IFS= read -r helper; do
  sign_one "$helper"
done < <(find "$APP/Contents/Frameworks" -name '*.app' -maxdepth 1 | sort)

while IFS= read -r fw; do
  sign_one "$fw"
done < <(find "$APP/Contents/Frameworks" -name '*.framework' -maxdepth 1 | sort)

sign_one "$APP"

echo "校验签名…"
codesign --verify --deep --strict --verbose=2 "$APP"
echo "签名完成"
