#!/bin/zsh
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
exec pnpm dev -- --remote-debugging-port=9222 > node_modules/.owb-dev.log 2>&1
