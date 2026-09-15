#!/usr/bin/env bash
# 提交已签名的 zip 给 Apple 公证，成功后 staple 到 .app。
# 凭据三选一：
#   1) 环境变量 NOTARY_PROFILE（钥匙串里 xcrun notarytool store-credentials 存好的 profile）
#   2) APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID
#   3) APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${1:-dist/mac-arm64/OPC-Fellows.app}"
VERSION="$(node -p "require('${ROOT}/package.json').version")"
ZIP="${2:-dist/OPC-Fellows-${VERSION}-mac-arm64.zip}"

if [[ ! -d "$APP" ]]; then
  echo "找不到 $APP" >&2
  exit 1
fi

if [[ ! -f "$ZIP" ]]; then
  echo "打包 $ZIP"
  ditto -c -k --keepParent "$APP" "$ZIP"
fi

args=()
if [[ -n "${NOTARY_PROFILE:-}" ]]; then
  args+=(--keychain-profile "$NOTARY_PROFILE")
elif [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_KEY_ID:-}" && -n "${APPLE_API_ISSUER:-}" ]]; then
  args+=(--key "$APPLE_API_KEY" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER")
elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_APP_SPECIFIC_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
  args+=(--apple-id "$APPLE_ID" --password "$APPLE_APP_SPECIFIC_PASSWORD" --team-id "$APPLE_TEAM_ID")
else
  echo "没有公证凭据。先存一把钥匙串 profile：" >&2
  echo "  xcrun notarytool store-credentials ownworkbuddy --apple-id <你的Apple ID> --team-id <TEAM_ID>" >&2
  echo "然后：" >&2
  echo "  NOTARY_PROFILE=ownworkbuddy bash scripts/notarize-mac.sh" >&2
  exit 2
fi

echo "提交公证 $ZIP"
xcrun notarytool submit "$ZIP" --wait "${args[@]}"
echo "装订票据…"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
echo "公证完成"
